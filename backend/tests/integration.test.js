/* ============================================================================
 * TESTE DE INTEGRAÇÃO END-TO-END (Postgres real efêmero via embedded-postgres)
 * Sobe um Postgres temporário, cria o schema base, roda as migrations REAIS,
 * popula dados (2 tenants, perfis master/admin/supervisor/seller, equipes,
 * processos), sobe o Express e exercita os endpoints com JWT de cada perfil.
 *
 * Executar:  node tests/integration.test.js
 * ==========================================================================*/
const path = require('path');
const fs = require('fs');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');

const PG_PORT = Number(process.env.CR_TEST_PG_PORT || 54329);
const APP_PORT = Number(process.env.CR_TEST_APP_PORT || 54330);
const JWT_SECRET = 'test-secret-please-ignore';
const DB = 'postgres';
const DBURL = `postgresql://postgres@127.0.0.1:${PG_PORT}/${DB}?sslmode=disable`;

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; results.push('  ✓ ' + name); }
  else { fail++; results.push('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

// HTTP helper
async function api(method, p, token, body) {
  const res = await fetch(`http://localhost:${APP_PORT}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const txt = await res.text();
  try { json = txt ? JSON.parse(txt) : null; } catch { json = { raw: txt }; }
  return { status: res.status, json };
}
const tok = (u) => jwt.sign({ userId: u.id, tenantId: u.tenant_id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '1h' });

async function main() {
  // Postgres REAL em WASM, in-process (sem processo privilegiado — funciona em
  // shell admin no Windows). Exposto via socket TCP para o node-postgres do app.
  const { PGlite } = require('@electric-sql/pglite');
  const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
  console.log('▶ subindo PGlite (Postgres WASM in-process)...');
  const pglite = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pglite, port: PG_PORT, host: '127.0.0.1' });
  await server.start();
  console.log('✓ PGlite no ar via socket:', DBURL);

  const db = new Client({ connectionString: DBURL });
  await db.connect();

  // ── SCHEMA BASE (só o que o código toca; migrations adicionam o resto) ──────
  await db.query(`
    CREATE TABLE tenants (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT, slug TEXT, status TEXT DEFAULT 'ativo', is_active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), name TEXT, email TEXT, password_hash TEXT DEFAULT 'x', role TEXT DEFAULT 'seller', seller_id UUID, is_active BOOLEAN DEFAULT true, last_login TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE service_types (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, code TEXT, label TEXT);
    CREATE TABLE sellers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), name TEXT NOT NULL, email TEXT, avatar TEXT, monthly_target NUMERIC DEFAULT 0, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE clients (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), name TEXT, cpf TEXT, cnh TEXT, first_cnh DATE, birth_date DATE, phone TEXT, email TEXT, address TEXT, notes TEXT, status TEXT DEFAULT 'negociacao', lead_id UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE companies (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), razao_social TEXT, nome_fantasia TEXT, cnpj TEXT, responsavel TEXT, phone TEXT, email TEXT, address TEXT, notes TEXT, status TEXT DEFAULT 'ativo', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE company_vehicles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, company_id UUID, plate TEXT, status TEXT DEFAULT 'ativo');
    CREATE TABLE fines (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), client_id UUID, company_id UUID, vehicle_id UUID, service_type_id UUID, fine_number TEXT, plate TEXT, organ TEXT, infraction_type TEXT, vehicle_model TEXT, infraction_date DATE, due_date TIMESTAMPTZ, defense_date DATE, stage TEXT, status TEXT, value NUMERIC, cost NUMERIC, paid_value NUMERIC, seller_id UUID, notes TEXT, protocol_number TEXT, protocol_date DATE, protocol_status TEXT, protocol_notes TEXT, protocol_file_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), name TEXT, email TEXT, phone TEXT, company TEXT, value NUMERIC DEFAULT 0, status TEXT DEFAULT 'novo', stage TEXT DEFAULT 'lead', source TEXT, notes TEXT, seller_id UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE multas_leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), name TEXT, cpf TEXT, cnh TEXT, first_license_date DATE, birth_date DATE, phone TEXT, source TEXT, status TEXT DEFAULT 'entrada', created_by UUID, created_by_name TEXT, notes TEXT, motivo TEXT, stage_changed_at TIMESTAMPTZ DEFAULT NOW(), archived_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE calendar_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id), title TEXT, type TEXT DEFAULT 'outro', status TEXT DEFAULT 'agendado', event_date DATE, start_time TIME, end_time TIME, client_id UUID, service_type_id UUID, responsible_user_id UUID, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE activity_logs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, user_id UUID, entity TEXT, entity_id TEXT, entity_name TEXT, action TEXT, details JSONB, created_at TIMESTAMPTZ DEFAULT NOW());
  `);

  // ── MIGRATIONS REAIS (01 estrutura, 04 ownership). 02 (admin→master) é pulada
  //    de propósito: semeamos os papéis finais direto para testar o estado final.
  //    03 (backfill) roda DEPOIS de semear os processos. ─────────────────────
  const migDir = path.join(__dirname, '..', 'migrations');
  const runSql = async (file) => {
    let sql = fs.readFileSync(path.join(migDir, file), 'utf8');
    sql = sql.replace(/^.*CREATE EXTENSION.*$/gim, ''); // gen_random_uuid é nativo (PG13+)
    await db.query(sql);
  };
  await runSql('gestao_01_module.sql');
  await runSql('gestao_04_ownership.sql');
  await runSql('gestao_05_workforce_costs.sql');
  await runSql('gestao_06_collaborator_details.sql');
  await runSql('gestao_07_audit_trail.sql');
  await runSql('gestao_09_tri_real_infractor.sql');
  await runSql('gestao_11_team_monthly_targets.sql');
  await runSql('gestao_12_deferred_images.sql');
  await runSql('gestao_16_finance_and_negotiation_clients.sql');
  await runSql('gestao_17_client_statuses.sql');
  await runSql('gestao_29_business_day_deadlines.sql');
  console.log('✓ migrations de estrutura aplicadas');

  // ── SEED ────────────────────────────────────────────────────────────────
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const T1 = await one(`INSERT INTO tenants(name,slug) VALUES('CR Recursos','cr-recursos') RETURNING *`);
  const T2 = await one(`INSERT INTO tenants(name,slug) VALUES('Outra Empresa','outra') RETURNING *`);

  const mkUser = (t, name, email, role) => one(
    `INSERT INTO users(tenant_id,name,email,role) VALUES($1,$2,$3,$4) RETURNING *`, [t.id, name, email, role]);
  const master = await mkUser(T1, 'Master Dono', 'master@cr.com', 'master');
  const admin  = await mkUser(T1, 'Adm Restrito', 'adm@cr.com', 'admin');
  const sup    = await mkUser(T1, 'Supervisão provisória', 'supervisao.provisorio@cr-recursos.app', 'supervisor');
  const s1     = await mkUser(T1, 'Joao Consultor', 's1@cr.com', 'seller');
  const s2     = await mkUser(T1, 'Maria Consultora', 's2@cr.com', 'seller');
  const t2user = await mkUser(T2, 'Dono T2', 'm@t2.com', 'master');
  const triType = await one(`INSERT INTO service_types(tenant_id,code,label) VALUES($1,'TRI','Troca de Real Infrator') RETURNING *`, [T1.id]);
  const crciType = await one(`INSERT INTO service_types(tenant_id,code,label) VALUES($1,'CRCI','CRCI') RETURNING *`, [T1.id]);

  // Equipe A: supervisor + s1 + s2
  const teamA = await one(`INSERT INTO teams(tenant_id,name,supervisor_id) VALUES($1,'Equipe A',$2) RETURNING *`, [T1.id, sup.id]);
  await db.query(`UPDATE users SET team_id=$1 WHERE id = ANY($2)`, [teamA.id, [sup.id, s1.id, s2.id]]);
  // Comissões: s1=5%, s2=10% (antes do backfill → snapshot)
  await db.query(`UPDATE users SET commission_percentage=5 WHERE id=$1`, [s1.id]);
  await db.query(`UPDATE users SET commission_percentage=10 WHERE id=$1`, [s2.id]);

  // Clientes/empresa (ownership)
  const cliS1 = await one(`INSERT INTO clients(tenant_id,name,created_by) VALUES($1,'Cliente do Joao',$2) RETURNING *`, [T1.id, s1.id]);
  const cliS2 = await one(`INSERT INTO clients(tenant_id,name,created_by) VALUES($1,'Cliente da Maria',$2) RETURNING *`, [T1.id, s2.id]);
  const emp1  = await one(`INSERT INTO companies(tenant_id,razao_social,created_by) VALUES($1,'Transportes X',$2) RETURNING *`, [T1.id, s1.id]);
  const empVehicle = await one(`INSERT INTO company_vehicles(tenant_id,company_id,plate) VALUES($1,$2,'XYZ9K87') RETURNING *`, [T1.id, emp1.id]);

  // Processos (fines): s1 = 10000 (cliente) + 5000 (cliente, DEFERIDO) ; s2 = 8000 (empresa, DEFERIDO)
  const soonDate = new Date(Date.now() + 3 * 86400000);
  while ([0, 6].includes(soonDate.getUTCDay())) soonDate.setUTCDate(soonDate.getUTCDate() + 1);
  const soon = soonDate.toISOString(); // vence no próximo dia útil após três dias
  const namedRealClient = await one(`INSERT INTO fines(tenant_id,client_id,seller_id,service_type_id,real_infractor_name,value,paid_value,stage,due_date,fine_number,plate,organ) VALUES($1,$2,$3,$4,'Real Infrator Joao',10000,10000,'APRS DEFESA PREVIA',$5,'AI-1','ABC1D23','DETRAN') RETURNING id`, [T1.id, cliS1.id, s1.id, triType.id, soon]);
  const deferredClient = await one(`INSERT INTO fines(tenant_id,client_id,seller_id,value,paid_value,stage,due_date,fine_number,organ) VALUES($1,$2,$3,5000,5000,'DEFERIDO',$4,'AI-2','DER') RETURNING id`, [T1.id, cliS1.id, s1.id, soon]);
  const deferredCompany = await one(`INSERT INTO fines(tenant_id,company_id,seller_id,service_type_id,real_infractor_name,value,paid_value,stage,due_date,fine_number,plate,organ) VALUES($1,$2,$3,$4,'Real Infratora Empresa',8000,8000,'DEFERIDO',$5,'AI-3','XYZ9K87','DNIT') RETURNING id`, [T1.id, emp1.id, s2.id, triType.id, soon]);
  const pendingRealCompany = await one(`INSERT INTO fines(tenant_id,company_id,seller_id,service_type_id,value,paid_value,stage,due_date,fine_number,plate,organ) VALUES($1,$2,$3,$4,0,0,'APRS DEFESA PREVIA',$5,'TRI-PENDENTE','XYZ9K87','PRF') RETURNING id`, [T1.id, emp1.id, s1.id, triType.id, soon]);
  const pendingRealWithoutDeadline = await one(`INSERT INTO fines(tenant_id,company_id,seller_id,service_type_id,value,paid_value,stage,due_date,fine_number,plate,organ) VALUES($1,$2,$3,$4,0,0,'APRS DEFESA PREVIA',NULL,'TRI-SEM-PRAZO','XYZ9K87','PRF') RETURNING id`, [T1.id, emp1.id, s1.id, triType.id]);
  // T2: um processo isolado (não pode vazar para T1)
  const cliT2 = await one(`INSERT INTO clients(tenant_id,name) VALUES($1,'Cliente T2') RETURNING *`, [T2.id]);
  await one(`INSERT INTO fines(tenant_id,client_id,seller_id,value,paid_value,stage,fine_number) VALUES($1,$2,$3,99999,99999,'APRS DEFESA PREVIA','T2-1') RETURNING id`, [T2.id, cliT2.id, t2user.id]);

  // Leads (ownership por created_by)
  const leadS2 = await one(`INSERT INTO leads(tenant_id,name,email,seller_id,created_by,value,status) VALUES($1,'Lead da Maria','lead@x.com',$2,$3,3000,'novo') RETURNING *`, [T1.id, s2.id, s2.id]);
  await one(`INSERT INTO leads(tenant_id,name,email,created_by,value,status) VALUES($1,'Lead do Joao','lj@x.com',$2,2000,'novo') RETURNING *`, [T1.id, s1.id]);

  // Tarefa (multas_leads) da Maria
  await one(`INSERT INTO multas_leads(tenant_id,name,created_by,created_by_name,status) VALUES($1,'Tarefa Maria',$2,'Maria','entrada') RETURNING id`, [T1.id, s2.id]);
  // Agenda (todos podem ver)
  await one(`INSERT INTO calendar_events(tenant_id,title,event_date,created_by) VALUES($1,'Reuniao', CURRENT_DATE+2, $2) RETURNING id`, [T1.id, master.id]);

  // BACKFILL (gestao_03) — agora que há processos
  await runSql('gestao_03_backfill_sales.sql');
  await runSql('gestao_08_sales_board.sql');
  await runSql('gestao_10_fixed_commission_policy.sql');
  await runSql('gestao_13_supervision_and_monthly_targets.sql');
  await runSql('gestao_18_supervision_login.sql');
  await runSql('gestao_19_cr_user_logins.sql');
  await runSql('gestao_20_cr_supervision_team.sql');
  await runSql('gestao_21_cr_supervision_display_name.sql');
  await runSql('gestao_22_sales_responsible_display_name.sql');
  await runSql('gestao_23_cr_account_identities.sql');
  await runSql('gestao_24_monthly_transport.sql');
  await runSql('gestao_25_installment_tracking.sql');
  await runSql('gestao_26_installment_frequency.sql');
  await runSql('gestao_27_installment_schedule_amount.sql');
  await runSql('gestao_28_cpf_duplicate_guard.sql');
  const supervisionLogin = await one(`SELECT name, email, role, is_active FROM users WHERE id=$1`, [sup.id]);
  const requestedLogins = (await db.query(
    `SELECT name, email, role, is_active, password_hash, team_id, supervisor_id
       FROM users
      WHERE tenant_id=$1 AND email = ANY($2)
      ORDER BY email`,
    [T1.id, ['supervisao@crrecursos.com.br', 'marta@crrecursos.com.br', 'laine@crrecursos.com.br', 'larissa@crrecursos.com.br', 'kamila@crrecursos.com.br']],
  )).rows;
  const requestedSellers = (await db.query(
    `SELECT s.name, s.email, s.active, u.seller_id
       FROM sellers s
       JOIN tenants t ON t.id=s.tenant_id
       JOIN users u ON u.tenant_id=s.tenant_id AND LOWER(u.email)=LOWER(s.email)
      WHERE t.slug='cr-recursos' AND s.email = ANY($1)
      ORDER BY s.email`,
    [['marta@crrecursos.com.br', 'laine@crrecursos.com.br', 'larissa@crrecursos.com.br', 'kamila@crrecursos.com.br']],
  )).rows;
  const bf = await one(`SELECT COUNT(*)::int c, COALESCE(SUM(amount),0)::float s FROM sales WHERE tenant_id=$1 AND source='backfill_fine'`, [T1.id]);
  console.log('✓ backfill:', bf.c, 'vendas, total', bf.s);

  // Libera a única conexão do socket PGlite para o pool do app.
  await db.end();

  // ── BOOT do Express (lê DATABASE_URL/JWT_SECRET do env) ───────────────────
  process.env.DATABASE_URL = DBURL;
  process.env.DB_SSL = 'false';
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(APP_PORT);
  process.env.PGPOOL_MAX = '1'; // PGlite-socket serve 1 conexão → serializa o pool
  process.env.EMAIL_WORKER_ENABLED = 'false'; // fluxo de e-mail possui harness dedicado
  require('../app.js');
  // aguarda /health
  for (let i = 0; i < 40; i++) {
    try { const h = await api('GET', '/health'); if (h.status === 200) break; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  console.log('✓ backend no ar\n');
  const appPool = require('../config/db');

  // ── ASSERTS ───────────────────────────────────────────────────────────────
  console.log('== me/access ==');
  const accM = await api('GET', '/api/me/access', tok(master));
  check('master: gestao=full', accM.json?.data?.access?.gestao === 'full', JSON.stringify(accM.json));
  const accA = await api('GET', '/api/me/access', tok(admin));
  check('admin: financeiro=none & history=none', accA.json?.data?.access?.financeiro === 'none' && accA.json?.data?.access?.history === 'none');
  const accSup = await api('GET', '/api/me/access', tok(sup));
  check('supervisor: dashboard=none, prazos=none, gestao=team', accSup.json?.data?.access?.dashboard === 'none' && accSup.json?.data?.access?.prazos === 'none' && accSup.json?.data?.access?.gestao === 'team');
  check('supervisor: teamId veio do banco', accSup.json?.data?.teamId === teamA.id);
  check('login da supervisão recebe o nome funcional sem perder o usuário', supervisionLogin.name === 'Supervisão'
    && supervisionLogin.email === 'supervisao@crrecursos.com.br'
    && supervisionLogin.role === 'supervisor'
    && supervisionLogin.is_active === true, JSON.stringify(supervisionLogin));
  check('logins solicitados são provisionados ativos e com senha bcrypt', requestedLogins.length === 5
    && requestedLogins.every((row) => row.is_active === true && /^\$2[aby]\$12\$/.test(row.password_hash))
    && requestedLogins.find((row) => row.email === 'supervisao@crrecursos.com.br')?.role === 'supervisor'
    && requestedLogins.filter((row) => row.email !== 'supervisao@crrecursos.com.br').every((row) => row.role === 'seller'), JSON.stringify(requestedLogins));
  check('quatro consultoras são vinculadas à equipe da Supervisão', requestedLogins
    .filter((row) => row.role === 'seller')
    .every((row) => row.team_id === teamA.id && row.supervisor_id === sup.id), JSON.stringify(requestedLogins));
  check('consultoras aparecem também nos seletores comerciais legados', requestedSellers.length === 4
    && requestedSellers.every((row) => row.active === true && row.seller_id), JSON.stringify(requestedSellers));
  const consultantDirectory = await api('GET', '/api/calendar-events/consultants', tok(master));
  const consultantNames = consultantDirectory.json?.data?.map((row) => row.name) || [];
  check('diretório de consultores inclui os novos logins e exclui perfis administrativos', consultantDirectory.status === 200
    && ['CR Recursos', 'Kamila Ferreira', 'Laine Tavares', 'Larissa Nascimento', 'Marta Cristina', 'Supervisão']
      .every((name) => consultantNames.includes(name))
    && !consultantNames.includes('Adm Restrito'), JSON.stringify(consultantDirectory.json?.data));
  const accS = await api('GET', '/api/me/access', tok(s1));
  check('seller: deferidos=full & agenda=full & clients=own', accS.json?.data?.access?.deferidos === 'full' && accS.json?.data?.access?.agenda === 'full' && accS.json?.data?.access?.clients === 'own');

  const reactivatableLead = await api('POST', '/api/multas-leads', tok(s1), {
    name: 'Lead Perdido Reativável', status: 'perdido',
  });
  await appPool.query(
    `UPDATE multas_leads SET created_at = NOW() - INTERVAL '30 days' WHERE id = $1 AND tenant_id = $2`,
    [reactivatableLead.json?.data?.id, T1.id],
  );
  const archivedOldLeads = await api('POST', '/api/multas-leads/archive-old', tok(master));
  const visibleLeadsAfterArchive = await api('GET', '/api/multas-leads', tok(master));
  check('lead perdido antigo continua pesquisável após arquivamento de inativos',
    reactivatableLead.status === 201
      && archivedOldLeads.status === 200
      && !archivedOldLeads.json?.data?.some((lead) => lead.id === reactivatableLead.json.data.id)
      && visibleLeadsAfterArchive.json?.data?.some((lead) => lead.id === reactivatableLead.json.data.id && lead.status === 'perdido'),
    JSON.stringify({ archived: archivedOldLeads.json, visible: visibleLeadsAfterArchive.json?.data?.some((lead) => lead.id === reactivatableLead.json?.data?.id) }));

  console.log('\n== ADM: Processos (sem Gestão) ==');
  check('admin → /api/leads = 403 (removido)',        (await api('GET', '/api/leads', tok(admin))).status === 403);
  check('admin → /api/multas-leads = 403 (removido)', (await api('GET', '/api/multas-leads', tok(admin))).status === 403);
  check('admin → /api/activity = 403',     (await api('GET', '/api/activity', tok(admin))).status === 403);
  check('master → /api/activity = 200',    (await api('GET', '/api/activity', tok(master))).status === 200);
  check('admin → /api/clients = 200 (permitido)', (await api('GET', '/api/clients', tok(admin))).status === 200);

  console.log('\n== Lead em negociação aparece em Clientes ==');
  const negotiationLead = await api('POST', '/api/multas-leads', tok(s2), {
    name: 'Cliente em Negociação', cpf: '123.456.789-09', cnh: '00123456789',
    first_license_date: '2012-03-04', birth_date: '1990-02-01', phone: '(21) 99999-1111',
    source: 'Indicação', status: 'negociacao', notes: 'Lead sincronizado',
  });
  const negotiationClients = await api('GET', '/api/clients', tok(s2));
  const negotiationClient = negotiationClients.json?.data?.find((item) => item.name === 'Cliente em Negociação');
  check('lead criado em negociação gera cliente sem cadastro duplicado', negotiationLead.status === 201
    && negotiationClient?.status === 'negociacao' && negotiationClient?.cpf === '12345678909',
  JSON.stringify(negotiationClients.json?.data));
  const leadTransferBody = { ...negotiationLead.json.data, consultant_id: s1.id };
  check('administrador não altera o consultor de um lead',
    (await api('PUT', `/api/multas-leads/${negotiationLead.json.data.id}`, tok(admin), leadTransferBody)).status === 403);
  check('consultor não altera o responsável de um lead',
    (await api('PUT', `/api/multas-leads/${negotiationLead.json.data.id}`, tok(s2), leadTransferBody)).status === 403);
  check('MASTER não atribui lead a usuário de outro tenant',
    (await api('PUT', `/api/multas-leads/${negotiationLead.json.data.id}`, tok(master), {
      ...leadTransferBody, consultant_id: t2user.id,
    })).status === 400);
  const masterLeadTransfer = await api('PUT', `/api/multas-leads/${negotiationLead.json.data.id}`, tok(master), leadTransferBody);
  const clientAfterMasterLeadTransfer = await api('GET', `/api/clients/${negotiationClient.id}`, tok(master));
  check('MASTER altera o consultor do lead e sincroniza o cliente vinculado', masterLeadTransfer.status === 200
    && masterLeadTransfer.json.data.created_by === s1.id
    && masterLeadTransfer.json.data.created_by_name === s1.name
    && clientAfterMasterLeadTransfer.json.data.created_by === s1.id,
  JSON.stringify({ lead: masterLeadTransfer.json, client: clientAfterMasterLeadTransfer.json }));
  const supervisorLeadTransfer = await api('PUT', `/api/multas-leads/${negotiationLead.json.data.id}`, tok(sup), {
    ...masterLeadTransfer.json.data, consultant_id: s2.id,
  });
  const clientAfterSupervisorLeadTransfer = await api('GET', `/api/clients/${negotiationClient.id}`, tok(master));
  check('Supervisão altera o consultor do lead e sincroniza o cliente vinculado', supervisorLeadTransfer.status === 200
    && supervisorLeadTransfer.json.data.created_by === s2.id
    && supervisorLeadTransfer.json.data.created_by_name === s2.name
    && clientAfterSupervisorLeadTransfer.json.data.created_by === s2.id,
  JSON.stringify({ lead: supervisorLeadTransfer.json, client: clientAfterSupervisorLeadTransfer.json }));
  const duplicateLead = await api('POST', '/api/multas-leads', tok(s1), {
    name: 'Mesmo CPF por Outra Consultora', cpf: '12345678909', status: 'entrada',
  });
  check('CPF já existente bloqueia um segundo lead e informa o cadastro original', duplicateLead.status === 409
    && duplicateLead.json?.error?.includes('CPF já cadastrado')
    && duplicateLead.json?.error?.includes('Cliente em Negociação')
    && duplicateLead.json?.error?.includes('Maria Consultora'), JSON.stringify(duplicateLead.json));
  const duplicateManualClient = await api('POST', '/api/clients', tok(master), {
    name: 'Cliente Manual Duplicado', cpf: '123.456.789-09', status: 'negociacao',
  });
  check('CPF de lead/cliente vinculado também bloqueia novo cliente manual', duplicateManualClient.status === 409
    && duplicateManualClient.json?.error?.includes('CPF já cadastrado'), JSON.stringify(duplicateManualClient.json));
  const editOriginalLead = await api('PUT', `/api/multas-leads/${negotiationLead.json.data.id}`, tok(s2), {
    ...negotiationLead.json.data,
    cpf: '123.456.789-09',
  });
  check('lead original continua editável e mantém seu cliente vinculado', editOriginalLead.status === 200
    && editOriginalLead.json?.data?.cpf === '12345678909', JSON.stringify(editOriginalLead.json));

  const distinctLead = await api('POST', '/api/multas-leads', tok(s1), {
    name: 'Lead CPF Distinto', cpf: '987.654.321-00', status: 'entrada',
  });
  const changeToDuplicate = await api('PUT', `/api/multas-leads/${distinctLead.json.data.id}`, tok(s1), {
    ...distinctLead.json.data,
    cpf: '123.456.789-09',
  });
  check('edição não permite trocar o CPF para um já cadastrado', distinctLead.status === 201
    && changeToDuplicate.status === 409, JSON.stringify(changeToDuplicate.json));

  const crossTenantCpf = await api('POST', '/api/clients', tok(t2user), {
    name: 'Mesmo CPF em Outro Tenant', cpf: '123.456.789-09', status: 'negociacao',
  });
  check('bloqueio de CPF respeita o isolamento por empresa', crossTenantCpf.status === 201,
    JSON.stringify(crossTenantCpf.json));

  const concurrentCpf = '111.444.777-35';
  const concurrentCreates = await Promise.all([
    api('POST', '/api/multas-leads', tok(s1), { name: 'Concorrente A', cpf: concurrentCpf, status: 'entrada' }),
    api('POST', '/api/multas-leads', tok(s2), { name: 'Concorrente B', cpf: concurrentCpf, status: 'entrada' }),
  ]);
  check('cadastros simultâneos do mesmo CPF gravam exatamente um lead',
    concurrentCreates.filter((response) => response.status === 201).length === 1
      && concurrentCreates.filter((response) => response.status === 409).length === 1,
    JSON.stringify(concurrentCreates));
  const negotiationLeadClosed = await api('PATCH', `/api/multas-leads/${negotiationLead.json.data.id}/status`, tok(s2), { status: 'fechado' });
  const closedClients = await api('GET', '/api/clients', tok(s2));
  const closedNegotiationClient = closedClients.json?.data?.find((item) => item.name === 'Cliente em Negociação');
  check('ao fechar o lead a mesma ficha é promovida sem duplicação', negotiationLeadClosed.status === 200
    && closedNegotiationClient?.status === 'fechado'
    && closedClients.json.data.filter((item) => item.name === 'Cliente em Negociação').length === 1);
  check('cliente sincronizado identifica a consultora responsável', closedNegotiationClient?.consultant_name === 'Maria Consultora');

  const linkedClientDetail = await api('GET', `/api/clients/${closedNegotiationClient.id}`, tok(s2));
  check('detalhe do cliente identifica a consultora responsável', linkedClientDetail.status === 200
    && linkedClientDetail.json.data.consultant_name === 'Maria Consultora', JSON.stringify(linkedClientDetail.json));
  const clientNoInterest = await api('PUT', `/api/clients/${closedNegotiationClient.id}`, tok(s2), {
    ...linkedClientDetail.json.data,
    status: 'nao_quer_defender',
  });
  const linkedLeadsAfterClientEdit = await api('GET', '/api/multas-leads', tok(s2));
  const linkedLeadAfterClientEdit = linkedLeadsAfterClientEdit.json?.data?.find((item) => item.id === negotiationLead.json.data.id);
  check('status alterado em Clientes volta para o lead vinculado', clientNoInterest.status === 200
    && clientNoInterest.json.data.status === 'nao_quer_defender'
    && linkedLeadAfterClientEdit?.status === 'nao_quer_defender',
  JSON.stringify({ client: clientNoInterest.json, lead: linkedLeadAfterClientEdit }));

  console.log('\n== CONSULTOR: ownership ==');
  const s1leads = await api('GET', '/api/leads', tok(s1));
  check('seller1 vê só os próprios leads (1)', s1leads.status === 200 && s1leads.json.data.length === 1 && s1leads.json.data[0].name === 'Lead do Joao', JSON.stringify(s1leads.json?.data?.map(l=>l.name)));
  check('seller1 → lead da Maria por ID = 403', (await api('GET', `/api/leads/${leadS2.id}`, tok(s1))).status === 403);
  const s1cli = await api('GET', '/api/clients', tok(s1));
  check('seller1 vê só os próprios clientes (1)', s1cli.status === 200 && s1cli.json.data.length === 1 && s1cli.json.data[0].name === 'Cliente do Joao');
  check('seller1 → cliente da Maria por ID = 403', (await api('GET', `/api/clients/${cliS2.id}`, tok(s1))).status === 403);

  const clientWithAddress = await api('POST', '/api/clients', tok(s1), {
    name: 'Cliente Endereço Preservado', status: 'negociacao',
    address: 'Rua de Teste, 123 — Centro', notes: 'Observação preservada',
  });
  const clientsWithAddress = await api('GET', '/api/clients', tok(s1));
  const listedAddressClient = clientsWithAddress.json?.data?.find((item) => item.id === clientWithAddress.json?.data?.id);
  check('listagem de clientes inclui endereço e observações para edição',
    clientWithAddress.status === 201
      && listedAddressClient?.address === 'Rua de Teste, 123 — Centro'
      && listedAddressClient?.notes === 'Observação preservada');
  const searchedAddressClients = await api('GET', '/api/clients/search?q=Cliente%20Endereço%20Preservado', tok(s1));
  const searchedAddressClient = searchedAddressClients.json?.data?.find((item) => item.id === clientWithAddress.json?.data?.id);
  check('pesquisa de clientes inclui endereço e observações',
    searchedAddressClients.status === 200
      && searchedAddressClient?.address === 'Rua de Teste, 123 — Centro'
      && searchedAddressClient?.notes === 'Observação preservada');
  const partialClientEdit = await api('PUT', `/api/clients/${clientWithAddress.json.data.id}`, tok(s1), {
    name: 'Cliente Endereço Preservado', status: 'negociacao',
  });
  check('edição parcial sem endereço/observações preserva os valores cadastrados',
    partialClientEdit.status === 200
      && partialClientEdit.json?.data?.address === 'Rua de Teste, 123 — Centro'
      && partialClientEdit.json?.data?.notes === 'Observação preservada', JSON.stringify(partialClientEdit.json));

  console.log('\n== Cliente fechado: troca de consultor pelo MASTER e Supervisão ==');
  const closedTransferClient = await api('POST', '/api/clients', tok(s1), {
    name: 'Cliente Fechado para Transferência', status: 'fechado',
  });
  const transferBody = { ...closedTransferClient.json.data, consultant_id: s2.id };
  check('administrador não troca consultor de cliente fechado',
    (await api('PUT', `/api/clients/${closedTransferClient.json.data.id}`, tok(admin), transferBody)).status === 403);
  check('consultor não troca consultor de cliente fechado',
    (await api('PUT', `/api/clients/${closedTransferClient.json.data.id}`, tok(s1), transferBody)).status === 403);
  const supervisorTransfer = await api('PUT', `/api/clients/${closedTransferClient.json.data.id}`, tok(sup), transferBody);
  check('Supervisão troca o consultor de um cliente fechado', supervisorTransfer.status === 200
    && supervisorTransfer.json.data.created_by === s2.id,
  JSON.stringify(supervisorTransfer.json));
  check('MASTER não atribui cliente a usuário de outro tenant',
    (await api('PUT', `/api/clients/${closedTransferClient.json.data.id}`, tok(master), {
      ...transferBody, consultant_id: t2user.id,
    })).status === 400);
  const masterTransfer = await api('PUT', `/api/clients/${closedTransferClient.json.data.id}`, tok(master), {
    ...transferBody, consultant_id: s1.id,
  });
  const clientsAfterTransfer = await api('GET', '/api/clients', tok(master));
  const transferredClient = clientsAfterTransfer.json.data.find((item) => item.id === closedTransferClient.json.data.id);
  check('MASTER troca consultor e preserva os demais dados do cliente fechado', masterTransfer.status === 200
    && masterTransfer.json.data.created_by === s1.id
    && masterTransfer.json.data.name === 'Cliente Fechado para Transferência'
    && masterTransfer.json.data.status === 'fechado');
  check('listagem reflete o novo consultor do cliente', transferredClient?.created_by === s1.id
    && transferredClient?.consultant_name === s1.name, JSON.stringify(transferredClient));

  console.log('\n== Exceções globais: Deferidos + Agenda ==');
  const defS = await api('GET', '/api/contracts/deferred', tok(s1));
  check('seller vê TODOS os deferidos do tenant (2)', defS.status === 200 && defS.json.data.length === 2, 'got ' + JSON.stringify(defS.json?.data?.length));
  check('admin vê todos os deferidos (2)', (await api('GET', '/api/contracts/deferred', tok(admin))).json.data.length === 2);
  const deferredImage = `https://api.example.test/uploads/${T1.id}/resultado.jpg`;
  check('consultor não altera imagem do deferido', (await api('PATCH', `/api/contracts/${deferredClient.id}/deferred-image`, tok(s1), { deferred_image_url: deferredImage })).status === 403);
  const supervisorImage = await api('PATCH', `/api/contracts/${deferredCompany.id}/deferred-image`, tok(sup), { deferred_image_url: deferredImage });
  check('supervisor adiciona imagem somente ao processo deferido', supervisorImage.status === 200 && supervisorImage.json.data.deferred_image_url === deferredImage, JSON.stringify(supervisorImage.json));
  const defWithImage = await api('GET', '/api/contracts/deferred', tok(s1));
  check('consultor visualiza a imagem na vitrine somente leitura', defWithImage.json.data.some((row) => row.id === deferredCompany.id && row.deferred_image_url === deferredImage));
  check('supervisor não exclui imagem da vitrine', (await api('DELETE', `/api/contracts/${deferredCompany.id}/deferred-image`, tok(sup))).status === 403);
  const deleteDeferredImage = await api('DELETE', `/api/contracts/${deferredCompany.id}/deferred-image`, tok(admin));
  check('ADM exclui somente a imagem do resultado', deleteDeferredImage.status === 200 && deleteDeferredImage.json.success === true, JSON.stringify(deleteDeferredImage.json));
  const defWithoutImage = await api('GET', '/api/contracts/deferred', tok(s1));
  check('exclusão da imagem preserva o processo deferido', defWithoutImage.json.data.some((row) => row.id === deferredCompany.id && !row.deferred_image_url));
  check('seller vê a Agenda (200)', (await api('GET', '/api/calendar-events', tok(s1))).status === 200);
  check('admin vê a Agenda (200)', (await api('GET', '/api/calendar-events', tok(admin))).status === 200);

  console.log('\n== Prazos ==');
  check('supervisor → /deadlines = 403 (prazos none)', (await api('GET', '/api/contracts/deadlines', tok(sup))).status === 403);
  const dlM = await api('GET', '/api/contracts/deadlines', tok(master));
  check('master → /deadlines = 200 (todos)', dlM.status === 200 && (dlM.json.data.overdue.length + dlM.json.data.upcoming.length) >= 3);
  check('consultor → /deadlines = 403 (Prazos removido)', (await api('GET', '/api/contracts/deadlines', tok(s1))).status === 403);
  check('deadlines destacam somente TRI e trazem nome do real infrator', dlM.json.data.overdue.concat(dlM.json.data.upcoming).some(f => f.real_infractor_type && f.real_infractor_name && f.service_code === 'TRI'));
  const dlCompany = await api('GET', '/api/contracts/deadlines?real_infractor=company', tok(master));
  const dlCompanyAll = [...dlCompany.json.data.overdue, ...dlCompany.json.data.upcoming];
  check('filtro real_infractor=company só TRI de empresa', dlCompanyAll.length >= 1 && dlCompanyAll.every(row => row.company_id && row.service_code === 'TRI'));
  const realAlerts = await api('GET', '/api/contracts/real-infractor-alerts', tok(master));
  check('Dashboard de Real infrator inclui nomes cadastrados e registros sem prazo', realAlerts.status === 200
    && realAlerts.json.data.some(row => row.id === pendingRealCompany.id)
    && realAlerts.json.data.some(row => row.id === pendingRealWithoutDeadline.id)
    && realAlerts.json.data.some(row => row.id === namedRealClient.id && row.real_infractor_name === 'Real Infrator Joao'), JSON.stringify(realAlerts.json));
  const companyAlert = realAlerts.json.data.find(row => row.id === pendingRealCompany.id);
  check('pendência antiga de empresa resolve o veículo pela placa para abrir o cadastro correto', companyAlert?.company_id === emp1.id && companyAlert?.vehicle_id === empVehicle.id, JSON.stringify(companyAlert));

  const weekendDeadline = await api('POST', '/api/contracts', tok(s1), {
    client_id: cliS1.id, service_id: crciType.id, numero_multa: 'CRCI-FIM-DE-SEMANA',
    status: 'EM ANDAMENTO', due_date: '2026-09-26',
  });
  check('API bloqueia novo prazo no sábado', weekendDeadline.status === 400
    && weekendDeadline.json?.error?.includes('dia útil'), JSON.stringify(weekendDeadline.json));
  const weekdayDeadline = await api('POST', '/api/contracts', tok(s1), {
    client_id: cliS1.id, service_id: crciType.id, numero_multa: 'CRCI-DIA-UTIL',
    status: 'EM ANDAMENTO', due_date: '2026-09-28',
  });
  check('API aceita prazo na segunda-feira', weekdayDeadline.status === 201
    && String(weekdayDeadline.json?.data?.due_date || '').substring(0, 10) === '2026-09-28', JSON.stringify(weekdayDeadline.json));

  const legacyDb = require('../config/db');
  const legacyWeekendResult = await legacyDb.query(
    `INSERT INTO fines(tenant_id,client_id,seller_id,service_type_id,stage,due_date,fine_number)
     VALUES($1,$2,$3,$4,'EM ANDAMENTO','2026-09-27','PRAZO-LEGADO-DOMINGO') RETURNING id`,
    [T1.id, cliS1.id, s1.id, crciType.id]
  );
  const legacyWeekend = legacyWeekendResult.rows[0];
  const deadlineMigrationSql = fs.readFileSync(path.join(migDir, 'gestao_29_business_day_deadlines.sql'), 'utf8');
  await legacyDb.query(deadlineMigrationSql);
  const migratedDeadlineResult = await legacyDb.query(`SELECT due_date FROM fines WHERE id=$1`, [legacyWeekend.id]);
  const migratedDeadline = migratedDeadlineResult.rows[0];
  check('migration preserva prazo legado e move domingo para a segunda-feira seguinte',
    new Date(migratedDeadline.due_date).toISOString().substring(0, 10) === '2026-09-28', JSON.stringify(migratedDeadline));

  const updatedCompanyFine = await api('PUT', `/api/contracts/${deferredCompany.id}`, tok(master), {
    company_id: emp1.id,
    vehicle_id: empVehicle.id,
    vehicle_plate: 'XYZ9K87',
    service_id: triType.id,
    numero_multa: 'AI-3',
    real_infractor_name: 'Real Infratora Empresa',
    infraction_type: '218 INC I',
    organ: 'DNIT',
    status: 'DEFERIDO',
    due_date: soon,
    notes: 'Enquadramento da frota',
  });
  check('edição do processo da frota grava enquadramento sem apagar o valor', updatedCompanyFine.status === 200
    && updatedCompanyFine.json.data.infraction_type === '218 INC I'
    && Number(updatedCompanyFine.json.data.value) === 8000, JSON.stringify(updatedCompanyFine.json));
  const vehicleFines = await api('GET', `/api/companies/${emp1.id}/vehicles/${empVehicle.id}/fines`, tok(master));
  check('consulta do veículo devolve o enquadramento salvo para a tela', vehicleFines.status === 200
    && vehicleFines.json.data.items.some(row => row.id === deferredCompany.id && row.infraction_type === '218 INC I'), JSON.stringify(vehicleFines.json));

  console.log('\n== Andamentos por perfil + cadastro completo do Real Infrator ==');
  const sellerCrci = await api('POST', '/api/contracts', tok(s1), {
    client_id: cliS1.id, service_id: crciType.id, numero_multa: 'E-16/061/010272/2026',
    status: 'EM ANDAMENTO',
  });
  check('consultor cadastra CRCI com seu andamento próprio', sellerCrci.status === 201
    && sellerCrci.json.data.stage === 'EM ANDAMENTO'
    && sellerCrci.json.data.seller_id === s1.id, JSON.stringify(sellerCrci.json));
  const sellerBlockedStage = await api('POST', '/api/contracts', tok(s1), {
    client_id: cliS1.id, service_id: triType.id, numero_multa: 'TRI-BLOCK', vehicle_plate: 'ABC1D23',
    real_infractor_name: 'Pessoa Bloqueada', status: 'DEFERIDO',
  });
  check('consultor não cadastra andamento fora de APRs', sellerBlockedStage.status === 403, JSON.stringify(sellerBlockedStage.json));
  const sellerTri = await api('POST', '/api/contracts', tok(s1), {
    client_id: cliS1.id, service_id: triType.id, numero_multa: 'TRI-OK', vehicle_plate: 'ABC1D23',
    real_infractor_name: 'Novo Real Infrator', organ: 'DETRAN', status: 'APRS 1 INSTANCIA',
  });
  check('consultor cadastra TRI completo em APRs e fica como responsável', sellerTri.status === 201
    && sellerTri.json.data.real_infractor_name === 'Novo Real Infrator'
    && sellerTri.json.data.seller_id === s1.id, JSON.stringify(sellerTri.json));
  const missingTriName = await api('POST', '/api/contracts', tok(master), {
    client_id: cliS1.id, service_id: triType.id, numero_multa: 'TRI-SEM-NOME', vehicle_plate: 'ABC1D23', status: 'APRS DEFESA PREVIA',
  });
  check('API exige nome do real infrator no serviço TRI', missingTriName.status === 400, JSON.stringify(missingTriName.json));
  const retiredStage = await api('POST', '/api/contracts', tok(master), {
    client_id: cliS1.id, service_id: triType.id, numero_multa: 'TRI-OLD', vehicle_plate: 'ABC1D23',
    real_infractor_name: 'Fluxo Antigo', status: 'PROTOCOLADO',
  });
  check('Protocolado foi retirado dos andamentos deste cadastro', retiredStage.status === 400, JSON.stringify(retiredStage.json));
  const supervisorFullStage = await api('POST', '/api/contracts', tok(sup), {
    client_id: cliS2.id, service_id: triType.id, numero_multa: 'TRI-SUP', vehicle_plate: 'SUP1A23',
    real_infractor_name: 'Real Infrator Supervisão', status: 'DEFERIDO',
  });
  check('supervisora mantém permissão para andamento completo', supervisorFullStage.status === 201 && supervisorFullStage.json.data.stage === 'DEFERIDO', JSON.stringify(supervisorFullStage.json));

  console.log('\n== Gestão: overview / ranking / comissão ==');
  const ovM = await api('GET', '/api/management/overview', tok(master));
  check('master overview total = 23000 (10k+5k+8k)', Number(ovM.json.data.current.total_amount) === 23000, 'got ' + ovM.json?.data?.current?.total_amount);
  check('master overview comissões = 1550 (750+800)', Number(ovM.json.data.current.total_commission) === 1550, 'got ' + ovM.json?.data?.current?.total_commission);
  const rk = ovM.json.data.ranking;
  check('ranking: 1º Joao (15000), 2º Maria (8000)', rk[0].seller_name === 'Joao Consultor' && Number(rk[0].total_amount) === 15000 && rk[1].seller_name === 'Maria Consultora' && Number(rk[1].total_amount) === 8000, JSON.stringify(rk.map(r=>[r.seller_name, r.total_amount])));

  const ovSup = await api('GET', '/api/management/overview', tok(sup));
  check('supervisor overview = só equipe (23000 = toda a equipe A)', Number(ovSup.json.data.current.total_amount) === 23000);
  const ovS1 = await api('GET', '/api/management/overview', tok(s1));
  check('seller1 overview = só o próprio (15000)', Number(ovS1.json.data.current.total_amount) === 15000, 'got ' + ovS1.json?.data?.current?.total_amount);

  console.log('\n== Gestão: equipe (cross-team 403) ==');
  check('supervisor → própria equipe = 200', (await api('GET', `/api/management/team/${teamA.id}`, tok(sup))).status === 200);
  const fakeTeam = '00000000-0000-0000-0000-000000000000';
  check('supervisor → outra equipe = 403', (await api('GET', `/api/management/team/${fakeTeam}`, tok(sup))).status === 403);
  const supCollaborators = await api('GET', '/api/management/collaborators', tok(sup));
  check('supervisor não recebe salários', supCollaborators.status === 200 && supCollaborators.json.data.every((u) => u.salary === undefined));
  check('perfil da Supervisão visualiza as quatro consultoras da equipe',
    ['Kamila Ferreira', 'Laine Tavares', 'Larissa Nascimento', 'Marta Cristina']
      .every((name) => supCollaborators.json.data.some((user) => user.name === name)),
    JSON.stringify(supCollaborators.json.data.map((user) => user.name)));

  console.log('\n== Gestão: criação de equipe e administração de colaboradores ==');
  const createdTeam = await api('POST', '/api/management/teams', tok(master), { name: 'Equipe B', supervisor_id: admin.id, active: true });
  check('master cria equipe (201)', createdTeam.status === 201 && createdTeam.json.data.name === 'Equipe B', JSON.stringify(createdTeam.json));
  const collaboratorsAfterTeam = await api('GET', '/api/management/collaborators', tok(master));
  const adminAfterTeam = collaboratorsAfterTeam.json.data.find((u) => u.id === admin.id);
  check('criação vincula supervisor na mesma transação', adminAfterTeam.team_id === createdTeam.json.data.id);
  const duplicateTeam = await api('POST', '/api/management/teams', tok(master), { name: 'equipe b' });
  check('nome de equipe não duplica no tenant', duplicateTeam.status === 409);

  const blockedCreation = await api('POST', '/api/management/collaborators', tok(master), {
    name: 'Usuário indevido', email: 'indevido@cr.com', password: 'Temporaria@2026', role: 'seller',
  });
  check('módulo Colaboradores não cria usuários (405)', blockedCreation.status === 405, JSON.stringify(blockedCreation.json));

  const managedCollaborator = await api('PUT', `/api/management/collaborators/${s1.id}`, tok(master), {
    name: 'Nome que deve ser ignorado', email: 'alterado@cr.com', role: 'admin',
    team_id: createdTeam.json.data.id, supervisor_id: admin.id, position: 'Consultor', employment_type: 'CLT',
    salary: 3600, benefits_amount: 400, other_monthly_costs: 100,
    employer_charges_percentage: 20, thirteenth_salary_enabled: true, commission_percentage: 5,
  });
  check('master administra valores e vínculo sem alterar a comissão fixa', managedCollaborator.status === 200
    && Number(managedCollaborator.json.data.salary) === 3600
    && managedCollaborator.json.data.team_id === createdTeam.json.data.id
    && Number(managedCollaborator.json.data.commission_percentage) === 10
    && Number(managedCollaborator.json.data.commission_threshold) === 7500,
  JSON.stringify(managedCollaborator.json));
  check('módulo não altera identidade ou perfil do usuário', managedCollaborator.json.data.name === 'Joao Consultor' && managedCollaborator.json.data.email === 's1@cr.com' && managedCollaborator.json.data.role === 'seller');
  check('admin não pode alterar master', (await api('PUT', `/api/management/collaborators/${master.id}`, tok(admin), { position: 'Tentativa' })).status === 403);

  const competence = new Date().toISOString().substring(0, 8) + '01';
  const newCost = await api('POST', '/api/management/collaborator-costs', tok(master), {
    collaborator_id: s1.id, category: 'bonus', recurring: true,
    description: 'Bônus mensal', amount: 250, competence,
  });
  check('lança custo extra recorrente detalhado (201)', newCost.status === 201 && newCost.json.data.recurring === true && Number(newCost.json.data.amount) === 250, JSON.stringify(newCost.json));
  const workforce = await api('GET', '/api/management/workforce-summary', tok(master));
  const worker = workforce.json?.data?.collaborators?.find((u) => u.id === s1.id);
  check('financeiro soma salário + encargos + benefícios + 13º + comissão + custos', workforce.status === 200 && Number(worker?.commission_amount) === 750 && Number(worker?.total_cost) === 6120, JSON.stringify(worker));
  check('conta master não aparece como custo de colaborador', !workforce.json?.data?.collaborators?.some((u) => u.id === master.id));
  const firstTransport = await api('PUT', `/api/management/collaborators/${s1.id}/monthly-transport`, tok(master), { amount: 40, competence });
  const replacedTransport = await api('PUT', `/api/management/collaborators/${s1.id}/monthly-transport`, tok(master), { amount: 80, competence });
  const workforceAfterTransport = await api('GET', '/api/management/workforce-summary', tok(master));
  const workerAfterTransport = workforceAfterTransport.json?.data?.collaborators?.find((u) => u.id === s1.id);
  check('passagem mensal substitui o valor anterior sem somar', firstTransport.status === 200
    && replacedTransport.status === 200
    && Number(workerAfterTransport?.transport_costs) === 80
    && Number(workerAfterTransport?.total_cost) === 6200, JSON.stringify(workerAfterTransport));
  check('supervisor não acessa folha geral', (await api('GET', '/api/management/workforce-summary', tok(sup))).status === 403);

  const fixedExpense = await api('POST', '/api/management/office-expenses', tok(master), {
    category: 'rent', description: 'Aluguel do escritório', competence,
    due_date: competence, amount: 2000, status: 'paid',
  });
  const variableExpense = await api('POST', '/api/management/office-expenses', tok(master), {
    category: 'marketing', description: 'Campanha mensal', competence,
    due_date: competence, amount: 350, status: 'pending',
  });
  const officeSummary = await api('GET', '/api/management/workforce-summary', tok(master));
  check('financeiro separa custos fixos e variáveis', fixedExpense.status === 201 && variableExpense.status === 201
    && Number(officeSummary.json?.data?.fixed_costs) === 2000
    && Number(officeSummary.json?.data?.variable_costs) === 350,
  JSON.stringify(officeSummary.json?.data));
  const officeRows = await api('GET', '/api/management/office-expenses', tok(master));
  check('despesas trazem vencimento, valor e status', officeRows.status === 200
    && officeRows.json.data.some((row) => row.description === 'Aluguel do escritório' && row.status === 'paid'));
  check('supervisor não acessa despesas do escritório', (await api('GET', '/api/management/office-expenses', tok(sup))).status === 403);

  console.log('\n== Colaborador: detalhe e política fixa de comissão ==');
  const tier7 = await api('POST', `/api/management/collaborators/${s1.id}/commission-tiers`, tok(master), { name: 'Prata', min_sales: 10000, percentage: 7 });
  check('API recusa faixas porque a comissão agora é fixa', tier7.status === 409, JSON.stringify(tier7.json));
  const detail = await api('GET', `/api/management/collaborators/${s1.id}/detail?months=12`, tok(master));
  check('ficha traz 12 meses, custos e regra fixa sem faixas', detail.status === 200
    && detail.json.data.monthly.length === 12
    && detail.json.data.costs.some((c) => c.category === 'bonus' && c.recurring)
    && detail.json.data.tiers.length === 0
    && Number(detail.json.data.current.effective_percentage) === 10
    && Number(detail.json.data.current.commission_threshold) === 7500,
  JSON.stringify(detail.json?.data));
  const tierSale = await api('POST', '/api/management/sales', tok(master), { seller_id: s1.id, amount: 5000, closed_at: new Date().toISOString().substring(0,10), description: 'atinge faixa ouro' });
  check('venda acima do gatilho usa 10% fixos', tierSale.status === 201 && Number(tierSale.json.data.commission_percentage) === 10 && Number(tierSale.json.data.commission_amount) === 500, JSON.stringify(tierSale.json?.data));
  await api('DELETE', `/api/management/sales/${tierSale.json.data.id}`, tok(master));

  console.log('\n== Comissão: snapshot ==');
  // Tentativa de configurar 20% é normalizada para a política fixa; vendas antigas não mudam.
  const fixedPolicyUpdate = await api('PUT', `/api/management/collaborators/${s1.id}`, tok(master), { commission_percentage: 20, commission_threshold: 9000 });
  check('percentual e gatilho individuais são normalizados para 10% e R$ 7.500', fixedPolicyUpdate.status === 200
    && Number(fixedPolicyUpdate.json.data.commission_percentage) === 10
    && Number(fixedPolicyUpdate.json.data.commission_threshold) === 7500,
  JSON.stringify(fixedPolicyUpdate.json));
  const ovAfter = await api('GET', '/api/management/overview', tok(master));
  check('snapshots históricos seguem preservados em 1550', Number(ovAfter.json.data.current.total_commission) === 1550, 'got ' + ovAfter.json?.data?.current?.total_commission);
  const novaVenda = await api('POST', '/api/management/sales', tok(master), { seller_id: s1.id, amount: 1000, closed_at: new Date().toISOString().substring(0,10), description: 'venda nova' });
  check('nova venda acima do gatilho grava 10% e comissão R$ 100', novaVenda.status === 201
    && Number(novaVenda.json.data.commission_percentage) === 10
    && Number(novaVenda.json.data.commission_trigger_amount) === 7500
    && Number(novaVenda.json.data.commission_amount) === 100,
  JSON.stringify(novaVenda.json?.data));

  const ownerSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: master.id, customer_name: 'Cliente da Proprietária', service_name: 'Suspensão',
    amount: 1200, closed_at: '2028-01-15', payment_method: 'pix', closing_method: 'remoto',
  });
  const supervisorOwnerSales = await api('GET', '/api/management/sales?month=1&year=2028', tok(sup));
  check('proprietária registra a própria venda sem comissão automática', ownerSale.status === 201
    && ownerSale.json.data.seller_id === master.id
    && ownerSale.json.data.seller_role_snapshot === 'master'
    && Number(ownerSale.json.data.commission_amount) === 0,
  JSON.stringify(ownerSale.json));
  check('venda da proprietária não aparece para a supervisão', supervisorOwnerSales.status === 200
    && !supervisorOwnerSales.json.data.some((sale) => sale.id === ownerSale.json.data.id));

  const responsibleDirectory = await api('GET', '/api/management/sales/responsibles', tok(master));
  const responsibleNames = responsibleDirectory.json?.data?.map((item) => item.name) || [];
  const crResponsible = responsibleDirectory.json?.data?.find((item) => item.name === 'CR Recursos');
  const supervisionResponsible = responsibleDirectory.json?.data?.find((item) => item.name === 'Supervisão');
  check('responsáveis incluem CR Recursos, Supervisão e todos os nomes existentes', responsibleDirectory.status === 200
    && crResponsible?.seller_id === master.id
    && supervisionResponsible?.seller_id === sup.id
    && !responsibleNames.includes('Camila Rodrigues Pereira')
    && ['Joao Consultor', 'Maria Consultora', 'Kamila Ferreira', 'Laine Tavares', 'Larissa Nascimento', 'Marta Cristina']
      .every((name) => responsibleNames.includes(name)), JSON.stringify(responsibleDirectory.json?.data));
  if (!crResponsible || !supervisionResponsible) {
    throw new Error(`Diretório de responsáveis inválido: ${JSON.stringify(responsibleDirectory)}`);
  }
  const crSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: crResponsible.seller_id, seller_display_name: crResponsible.name,
    customer_name: 'Cliente CR', service_name: 'Recurso', amount: 100,
    closed_at: '2029-02-10', payment_method: 'pix', closing_method: 'remoto',
  });
  const supervisionSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: supervisionResponsible.seller_id, seller_display_name: supervisionResponsible.name,
    customer_name: 'Cliente Supervisão', service_name: 'Multa', amount: 100,
    closed_at: '2029-02-11', payment_method: 'pix', closing_method: 'remoto',
  });
  const namedSales = await api('GET', '/api/management/sales?month=2&year=2029', tok(master));
  check('venda pode ser lançada e exibida como CR Recursos', crSale.status === 201
    && crSale.json.data.seller_display_name_snapshot === 'CR Recursos'
    && namedSales.json.data.find((sale) => sale.id === crSale.json.data.id)?.seller_name === 'CR Recursos');
  check('venda pode ser lançada e exibida como Supervisão', supervisionSale.status === 201
    && supervisionSale.json.data.seller_display_name_snapshot === 'Supervisão'
    && namedSales.json.data.find((sale) => sale.id === supervisionSale.json.data.id)?.seller_name === 'Supervisão');
  check('API rejeita rótulo de responsável não autorizado',
    (await api('POST', '/api/management/sales', tok(master), {
      seller_id: sup.id, seller_display_name: 'Responsável inventado',
      customer_name: 'Cliente inválido', service_name: 'Multa', amount: 100,
      closed_at: '2029-02-12', payment_method: 'pix', closing_method: 'remoto',
    })).status === 400);

  console.log('\n== Consultor cria venda própria (seller_id forçado) ==');
  const vendaConsultor = await api('POST', '/api/management/sales', tok(s2), { seller_id: s1.id /* tenta forjar */, amount: 500, closed_at: new Date().toISOString().substring(0,10) });
  check('venda do consultor é atribuída a ELE (ignora seller_id forjado)', vendaConsultor.status === 201 && vendaConsultor.json.data.seller_id === s2.id, JSON.stringify(vendaConsultor.json?.data?.seller_id));

  console.log('\n== Auditoria completa do Master ==');
  // O middleware grava após a resposta; aguarda a persistência assíncrona.
  await new Promise((resolve) => setTimeout(resolve, 150));
  const auditSeller = await api('GET', `/api/activity?user_id=${s2.id}&module=gestao&action=create&days=30`, tok(master));
  const saleAudit = auditSeller.json?.data?.logs?.find((event) => event.path === '/api/management/sales');
  check('master filtra auditoria por usuário/módulo/ação', auditSeller.status === 200 && saleAudit?.user_id === s2.id, JSON.stringify(auditSeller.json?.data));
  check('auditoria identifica rota, resultado e perfil', saleAudit?.method === 'POST' && saleAudit?.success === true && saleAudit?.user_role === 'seller');
  const failedAudit = await api('GET', `/api/activity?user_id=${master.id}&status=failed&search=PROTEGIDO&days=30`, tok(master));
  const protectedAudit = failedAudit.json?.data?.logs?.find((event) => event.path === '/api/management/collaborators');
  check('auditoria registra tentativa bloqueada e mascara senha', protectedAudit?.status_code === 405 && protectedAudit?.metadata?.request?.password === '[PROTEGIDO]', JSON.stringify(failedAudit.json?.data));
  const auditFilters = await api('GET', '/api/activity/filters', tok(master));
  check('filtros de auditoria listam usuários e módulos', auditFilters.status === 200 && auditFilters.json.data.users.some((user) => user.id === s2.id) && auditFilters.json.data.modules.includes('gestao'));
  check('apenas master acessa filtros de auditoria', (await api('GET', '/api/activity/filters', tok(sup))).status === 403);

  console.log('\n== Isolamento multi-tenant ==');
  const ovT2 = await api('GET', '/api/management/overview', tok(t2user));
  check('T2 overview NÃO enxerga dados de T1 (só 99999)', Number(ovT2.json.data.current.total_amount) === 99999, 'got ' + ovT2.json?.data?.current?.total_amount);
  check('T1 master overview NÃO inclui os 99999 de T2', Number(ovM.json.data.current.total_amount) === 23000);
  const t2Client = await api('GET', `/api/clients/${cliS1.id}`, tok(t2user));
  check('T2 → cliente de T1 por ID = 404 (fora do tenant)', t2Client.status === 404);

  console.log('\n== Quadro mensal: campos, meta e gatilho de R$ 7.500 ==');
  const createdSeller = await api('POST', '/api/users/management', tok(master), {
    name: 'Consultor Meta', email: 'meta@cr.com', password: 'Temporaria@2026', role: 'seller',
  });
  const metaSeller = { ...createdSeller.json?.data, tenant_id: T1.id };
  check('cria consultor para cenário de meta', createdSeller.status === 201 && metaSeller.role === 'seller', JSON.stringify(createdSeller.json));
  const configuredSeller = await api('PUT', `/api/management/collaborators/${metaSeller.id}`, tok(master), {
    team_id: teamA.id, commission_percentage: 20, commission_threshold: 7500, monthly_sales_target: 10000,
  });
  check('vínculo não aceita sobrescrever meta ou comissão pela ficha administrativa', configuredSeller.status === 200
    && configuredSeller.json.data.team_id === teamA.id
    && Number(configuredSeller.json.data.commission_percentage) === 10);
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const individualTarget = await api('PUT', `/api/management/targets/users/${metaSeller.id}`, tok(master), { month: currentMonth, year: currentYear, amount: 10000 });
  check('master configura meta individual por competência', individualTarget.status === 200
    && Number(individualTarget.json.data.amount) === 10000
    && individualTarget.json.data.updated_by === master.id, JSON.stringify(individualTarget.json));
  check('administrativo não altera meta individual', (await api('PUT', `/api/management/targets/users/${metaSeller.id}`, tok(admin), { month: currentMonth, year: currentYear, amount: 99999 })).status === 403);
  const teamTarget = await api('PUT', `/api/management/teams/${teamA.id}/target`, tok(master), { month: currentMonth, year: currentYear, amount: 50000 });
  check('master define meta mensal da equipe separada da individual', teamTarget.status === 200 && Number(teamTarget.json.data.amount) === 50000);
  check('administrativo não altera a meta mensal da equipe', (await api('PUT', `/api/management/teams/${teamA.id}/target`, tok(admin), { month: currentMonth, year: currentYear, amount: 99999 })).status === 403);
  const supervisorTargets = await api('GET', `/api/management/team-targets?month=${currentMonth}&year=${currentYear}`, tok(sup));
  check('supervisor consulta apenas a meta da própria equipe', supervisorTargets.status === 200 && supervisorTargets.json.data.length === 1 && Number(supervisorTargets.json.data[0].amount) === 50000);
  const saleBeforeTrigger = await api('POST', '/api/management/sales', tok(master), {
    seller_id: metaSeller.id, customer_name: 'Cliente A', service_name: 'Suspensão',
    amount: 7000, closed_at: new Date().toISOString().substring(0,10),
    payment_method: 'pix', closing_method: 'remoto',
  });
  check('venda abaixo do gatilho grava 10%, mas comissão zero', saleBeforeTrigger.status === 201
    && Number(saleBeforeTrigger.json.data.commission_percentage) === 10
    && Number(saleBeforeTrigger.json.data.commissionable_amount) === 0
    && Number(saleBeforeTrigger.json.data.commission_amount) === 0, JSON.stringify(saleBeforeTrigger.json?.data));
  const crossingSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: metaSeller.id, customer_name: 'Cliente B', service_name: 'Multa',
    amount: 1000, closed_at: `${currentYear}-${String(currentMonth).padStart(2, '0')}-20`,
    installment_number: 1, installment_total: 3, installment_frequency: 'weekly',
    payment_method: 'boleto', closing_method: 'presencial',
  });
  check('venda que cruza o gatilho comissiona 10% sobre R$ 500 = R$ 50', crossingSale.status === 201
    && Number(crossingSale.json.data.commissionable_amount) === 500
    && Number(crossingSale.json.data.commission_amount) === 50
    && crossingSale.json.data.installment_number === 1
    && crossingSale.json.data.installment_frequency === 'weekly'
    && crossingSale.json.data.installment_plan_id
    && crossingSale.json.data.next_installment_due_date
    && crossingSale.json.data.is_settlement === false
    && crossingSale.json.data.customer_name === 'Cliente B', JSON.stringify(crossingSale.json?.data));
  const installmentFollowUps = await api('GET', '/api/management/sales/installments', tok(sup));
  check('parcelamento aberto sinaliza a próxima cobrança da competência atual por padrão', installmentFollowUps.status === 200
    && installmentFollowUps.json.data.filter((row) => row.installment_plan_id === crossingSale.json.data.installment_plan_id).length === 1
    && installmentFollowUps.json.data.some((row) => row.installment_plan_id === crossingSale.json.data.installment_plan_id
      && Number(row.next_installment_number) === 2 && row.is_next_installment === true), JSON.stringify(installmentFollowUps.json?.data));
  const firstScheduledDue = String(crossingSale.json.data.next_installment_due_date).substring(0, 10);
  const nextMonthDate = new Date(`${firstScheduledDue}T12:00:00Z`);
  nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1, 1);
  const nextMonthDue = nextMonthDate.toISOString().substring(0, 10);
  const moveOutsideCompetence = await api('PATCH', `/api/management/sales/installments/${crossingSale.json.data.installment_plan_id}`, tok(sup), {
    next_installment_due_date: nextMonthDue,
    next_installment_amount: 600,
    installment_frequency: 'manual',
  });
  const futureCompetenceFollowUps = await api('GET', '/api/management/sales/installments', tok(sup));
  check('cobrança de competência futura não aparece antes da virada do mês', moveOutsideCompetence.status === 200
    && !futureCompetenceFollowUps.json.data.some((row) => row.installment_plan_id === crossingSale.json.data.installment_plan_id),
  JSON.stringify(futureCompetenceFollowUps.json?.data));
  const selectedFutureDate = new Date(`${nextMonthDue}T12:00:00Z`);
  const selectedFutureMonth = selectedFutureDate.getUTCMonth() + 1;
  const selectedFutureYear = selectedFutureDate.getUTCFullYear();
  const selectedFutureFollowUps = await api('GET', `/api/management/sales/installments?month=${selectedFutureMonth}&year=${selectedFutureYear}`, tok(sup));
  check('ao selecionar uma competência futura, as parcelas daquele mês aparecem', selectedFutureFollowUps.status === 200
    && selectedFutureFollowUps.json.data.some((row) => row.installment_plan_id === crossingSale.json.data.installment_plan_id
      && String(row.next_installment_due_date).substring(0, 10) === nextMonthDue),
  JSON.stringify(selectedFutureFollowUps.json?.data));
  const overdueDue = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString().substring(0, 10);
  const moveToOverdue = await api('PATCH', `/api/management/sales/installments/${crossingSale.json.data.installment_plan_id}`, tok(sup), {
    next_installment_due_date: overdueDue,
    next_installment_amount: 600,
    installment_frequency: 'manual',
  });
  const futureWithOverdue = await api('GET', `/api/management/sales/installments?month=${selectedFutureMonth}&year=${selectedFutureYear}`, tok(sup));
  check('competência selecionada mantém cobranças vencidas de meses anteriores', moveToOverdue.status === 200
    && futureWithOverdue.json.data.some((row) => row.installment_plan_id === crossingSale.json.data.installment_plan_id
      && row.follow_up_status === 'overdue'
      && String(row.next_installment_due_date).substring(0, 10) === overdueDue),
  JSON.stringify(futureWithOverdue.json?.data));
  const restoreSchedule = await api('PATCH', `/api/management/sales/installments/${crossingSale.json.data.installment_plan_id}`, tok(sup), {
    next_installment_due_date: firstScheduledDue,
    next_installment_amount: 600,
    installment_frequency: 'weekly',
  });
  const adjustedFollowUps = await api('GET', '/api/management/sales/installments', tok(sup));
  const adjustedCharge = adjustedFollowUps.json.data.find((row) => row.installment_plan_id === crossingSale.json.data.installment_plan_id
    && row.is_next_installment === true);
  check('ajuste manual grava vencimento e valor previsto sem alterar a venda recebida', restoreSchedule.status === 200
    && String(adjustedCharge?.next_installment_due_date || '').substring(0, 10) === firstScheduledDue
    && Number(adjustedCharge?.pending_amount) === 600
    && Number(restoreSchedule.json.data.amount) === 1000
    && Number(restoreSchedule.json.data.next_installment_amount) === 600,
  JSON.stringify({ restoreSchedule: restoreSchedule.json, adjustedCharge }));
  const sellerCannotAdjustAnother = await api('PATCH', `/api/management/sales/installments/${crossingSale.json.data.installment_plan_id}`, tok(s1), {
    next_installment_due_date: firstScheduledDue,
    next_installment_amount: 900,
    installment_frequency: 'weekly',
  });
  check('consultor não altera cobrança de outro responsável', sellerCannotAdjustAnother.status === 403, JSON.stringify(sellerCannotAdjustAnother.json));
  const sellerBoard = await api('GET', `/api/management/sales?seller_id=${metaSeller.id}`, tok(sup));
  check('supervisor filtra a aba do consultor dentro da própria equipe', sellerBoard.status === 200
    && sellerBoard.json.data.length === 2
    && sellerBoard.json.data.every((sale) => sale.seller_id === metaSeller.id));
  const boardCollaborators = await api('GET', '/api/management/collaborators', tok(master));
  const metaRow = boardCollaborators.json.data.find((row) => row.id === metaSeller.id);
  check('consultor mostra vendido 8 mil e saldo de meta calculável em 2 mil', Number(metaRow?.sold_period) === 8000
    && Number(metaRow?.monthly_sales_target) - Number(metaRow?.sold_period) === 2000, JSON.stringify(metaRow));

  const exportResponse = await fetch(`http://localhost:${APP_PORT}/api/management/sales/export?month=${currentMonth}&year=${currentYear}`, {
    headers: { Authorization: `Bearer ${tok(sup)}` },
  });
  const exportBuffer = Buffer.from(await exportResponse.arrayBuffer());
  check('supervisor exporta XLSX com content-type e nome corretos', exportResponse.status === 200
    && String(exportResponse.headers.get('content-type')).includes('spreadsheetml.sheet')
    && String(exportResponse.headers.get('content-disposition')).includes('.xlsx')
    && exportBuffer.length > 5000);
  const exportedWorkbook = new ExcelJS.Workbook();
  await exportedWorkbook.xlsx.load(exportBuffer);
  check('XLSX respeita equipe e cria abas geral, supervisora e consultores', exportedWorkbook.getWorksheet('FATURAMENTO')
    && exportedWorkbook.getWorksheet('Supervisão')
    && exportedWorkbook.getWorksheet('Consultor Meta')
    && Number(exportedWorkbook.getWorksheet('FATURAMENTO').getCell('D20').value) === 50000
    && !exportedWorkbook.worksheets.some((sheet) => sheet.name.includes('T2')),
  exportedWorkbook.worksheets.map((sheet) => sheet.name).join(', '));
  const expectedFollowingDueDate = new Date(`${firstScheduledDue}T12:00:00Z`);
  expectedFollowingDueDate.setUTCDate(expectedFollowingDueDate.getUTCDate() + 7);
  const expectedFollowingDue = expectedFollowingDueDate.toISOString().substring(0, 10);
  const weeklyPaymentPayload = {
    seller_id: metaSeller.id, customer_name: 'Cliente B', service_name: 'Multa',
    amount: 1000, closed_at: new Date().toISOString().substring(0, 10),
    installment_number: 2, installment_total: 3,
    installment_plan_id: crossingSale.json.data.installment_plan_id,
    installment_frequency: 'weekly',
    // O backend deve ignorar esta tentativa de deslocar o calendário e avançar
    // a partir do vencimento contratual, não da data em que o cliente pagou.
    next_installment_due_date: '2099-01-01',
    payment_method: 'boleto', closing_method: 'presencial',
  };
  const concurrentWeeklyPayments = await Promise.all([
    api('POST', '/api/management/sales', tok(master), weeklyPaymentPayload),
    api('POST', '/api/management/sales', tok(master), weeklyPaymentPayload),
  ]);
  const weeklyPayment = concurrentWeeklyPayments.find((response) => response.status === 201);
  const repeatedWeeklyPayment = concurrentWeeklyPayments.find((response) => response.status !== 201);
  check('pagamento semanal avança 7 dias a partir do vencimento contratual', String(weeklyPayment?.json?.data?.next_installment_due_date || '').substring(0, 10) === expectedFollowingDue
    && weeklyPayment?.json?.data?.installment_frequency === 'weekly', JSON.stringify(concurrentWeeklyPayments));
  check('duplo clique não duplica nem soma a mesma parcela', Boolean(weeklyPayment)
    && [400, 409].includes(repeatedWeeklyPayment?.status), JSON.stringify(concurrentWeeklyPayments));
  const afterWeeklyPayment = await api('GET', `/api/management/sales?seller_id=${metaSeller.id}`, tok(sup));
  check('cobranças futuras não viram vendas; só um recebimento novo foi faturado', afterWeeklyPayment.status === 200
    && afterWeeklyPayment.json.data.length === 3
    && afterWeeklyPayment.json.data.filter((sale) => sale.installment_plan_id === crossingSale.json.data.installment_plan_id).length === 2,
  JSON.stringify(afterWeeklyPayment.json?.data));

  const settlementSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: metaSeller.id, customer_name: 'Cliente B', service_name: 'Multa',
    amount: 1000, closed_at: new Date().toISOString().substring(0, 10),
    installment_number: 3, installment_total: 3,
    installment_plan_id: crossingSale.json.data.installment_plan_id,
    installment_frequency: 'weekly',
    is_settlement: true, payment_method: 'boleto', closing_method: 'presencial',
  });
  const followUpsAfterSettlement = await api('GET', '/api/management/sales/installments', tok(sup));
  check('quitação encerra o alerta sem apagar os recebimentos já lançados', settlementSale.status === 201
    && settlementSale.json.data.is_settlement === true
    && !followUpsAfterSettlement.json.data.some((row) => row.installment_plan_id === crossingSale.json.data.installment_plan_id));

  console.log('\n== Aceite definitivo: supervisão 10% pessoal + 5% equipe ==');
  const supervisionMonth = 4;
  const supervisionYear = 2027;
  const supervisionDate = '2027-04-10';
  const supervisionQuery = `month=${supervisionMonth}&year=${supervisionYear}`;
  await api('PUT', `/api/management/teams/${teamA.id}/target`, tok(master), { month: supervisionMonth, year: supervisionYear, amount: 35000 });
  await api('PUT', `/api/management/targets/users/${sup.id}`, tok(master), { month: supervisionMonth, year: supervisionYear, amount: 7000 });

  const personalSupervisorSale = await api('POST', '/api/management/sales', tok(sup), {
    seller_id: sup.id,
    customer_name: 'Cliente da Supervisora', service_name: 'Defesa',
    amount: 8000, closed_at: supervisionDate, payment_method: 'pix', closing_method: 'remoto',
  });
  check('1. supervisora vende R$ 8.000 e a venda grava R$ 800 pessoais', personalSupervisorSale.status === 201
    && personalSupervisorSale.json.data.seller_id === sup.id
    && Number(personalSupervisorSale.json.data.commission_percentage) === 10
    && Number(personalSupervisorSale.json.data.commission_amount) === 800,
  JSON.stringify(personalSupervisorSale.json));
  const dashboardBeforeTeamSale = await api('GET', `/api/management/team/${teamA.id}?${supervisionQuery}`, tok(sup));

  const consultantTeamSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: metaSeller.id, customer_name: 'Clientes da Equipe', service_name: 'Contratos',
    amount: 30000, closed_at: supervisionDate, payment_method: 'pix', closing_method: 'presencial',
  });
  check('venda válida de R$ 30.000 fica vinculada à equipe da competência', consultantTeamSale.status === 201
    && consultantTeamSale.json.data.team_id === teamA.id
    && consultantTeamSale.json.data.seller_role_snapshot === 'seller', JSON.stringify(consultantTeamSale.json));

  const createdExternal = await api('POST', '/api/users/management', tok(master), {
    name: 'Consultor Externo', email: 'externo@cr.com', password: 'Temporaria@2026', role: 'seller',
  });
  const externalSeller = { ...createdExternal.json?.data, tenant_id: T1.id };
  await api('PUT', `/api/management/collaborators/${externalSeller.id}`, tok(master), { team_id: createdTeam.json.data.id, supervisor_id: admin.id });
  await api('POST', '/api/management/sales', tok(master), {
    seller_id: externalSeller.id, amount: 5000, closed_at: supervisionDate, description: 'Venda externa',
  });

  // Simula receitas legadas de perfis administrativos na mesma equipe. Mesmo
  // com team_id coincidente, o snapshot de função deve excluí-las da supervisão.
  await appPool.query(
    `INSERT INTO sales (tenant_id,seller_id,team_id,seller_role_snapshot,amount,commission_percentage,commission_amount,status,closed_at,source,created_by)
     VALUES ($1,$2,$4,'admin',3000,0,0,'confirmed',$5,'accept_legacy',$2),
            ($1,$3,$4,'master',4000,0,0,'confirmed',$5,'accept_legacy',$3)`,
    [T1.id, admin.id, master.id, teamA.id, supervisionDate]
  );

  const canceledSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: metaSeller.id, amount: 4000, closed_at: supervisionDate, description: 'Venda cancelada',
  });
  await api('DELETE', `/api/management/sales/${canceledSale.json.data.id}`, tok(master));
  const reversedSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: metaSeller.id, amount: 6000, closed_at: supervisionDate, description: 'Venda estornada',
  });
  await api('PUT', `/api/management/sales/${reversedSale.json.data.id}`, tok(master), { status: 'reversed' });

  const supervisionDashboard = await api('GET', `/api/management/team/${teamA.id}?${supervisionQuery}`, tok(sup));
  const supervision = supervisionDashboard.json?.data?.supervision_commission || {};
  check('2. R$ 30.000 dos consultores geram R$ 1.500 de supervisão', Number(supervision.team_sales_base) === 30000 && Number(supervision.team_commission) === 1500, JSON.stringify(supervision));
  check('3. comissão total da supervisora é R$ 2.300', Number(supervision.total_commission) === 2300, JSON.stringify(supervision));
  check('4. vendas pessoais não entram na base dos 5%', Number(supervision.personal_sales_base) === 8000 && Number(supervision.team_sales_base) === 30000);
  check('5. vendedor externo não entra no faturamento ou comissão da equipe', Number(supervisionDashboard.json?.data?.current?.total_amount) === 38000
    && !supervisionDashboard.json?.data?.collaborators?.some((row) => row.id === externalSeller.id));
  check('6. receita de ADM com team_id coincidente não gera comissão', Number(supervision.team_sales_base) === 30000);
  check('7. receita de Master/proprietário com team_id coincidente não gera comissão', Number(supervision.total_commission) === 2300);
  check('9. vendas canceladas e estornadas não geram comissão', Number(supervisionDashboard.json?.data?.current?.sales_count) === 2);
  check('14. valor restante nunca fica negativo', Number(supervisionDashboard.json?.data?.current?.target_remaining) === 0
    && Number(supervisionDashboard.json?.data?.personal?.target_remaining) === 0);
  check('15. percentual recalcula e pode superar 100% com novas vendas válidas', Number(supervisionDashboard.json?.data?.current?.target_progress) > 100
    && Number(supervisionDashboard.json?.data?.current?.target_progress) > Number(dashboardBeforeTeamSale.json?.data?.current?.target_progress));
  check('16. painel final informa somente 10% pessoal e 5% de equipe', Number(supervision.personal_percentage) === 10
    && Number(supervision.team_percentage) === 5
    && Number(personalSupervisorSale.json.data.commission_percentage) !== 20);
  const masterTeamDashboard = await api('GET', `/api/management/team/${teamA.id}?${supervisionQuery}`, tok(master));
  const masterSupervision = masterTeamDashboard.json?.data?.supervision_commission || {};
  check('Master vê na equipe as comissões pessoal, da equipe e total da supervisão', masterTeamDashboard.status === 200
    && Number(masterSupervision.personal_commission) === 800
    && Number(masterSupervision.team_commission) === 1500
    && Number(masterSupervision.total_commission) === 2300, JSON.stringify(masterSupervision));

  const marketingSellerCreated = await api('POST', '/api/users/management', tok(master), {
    name: 'Marketing Comissão Especial', email: 'marketing-comissao@cr.com',
    password: 'Temporaria@2026', role: 'seller',
  });
  const marketingSellerId = marketingSellerCreated.json?.data?.id;
  const marketingSellerSession = { ...marketingSellerCreated.json?.data, tenant_id: T1.id, role: 'seller' };
  const marketingClosedClient = await api('POST', '/api/clients', tok(marketingSellerSession), {
    name: 'Cliente Fechado do Marketing', status: 'fechado',
  });
  const marketingContractPermissionProbe = await api('POST', '/api/contracts', tok(marketingSellerSession), {});
  check('perfil atualizado de marketing consegue cadastrar cliente fechado e não recebe 403 ao iniciar serviço',
    marketingSellerCreated.status === 201
      && marketingClosedClient.status === 201
      && marketingClosedClient.json?.data?.status === 'fechado'
      && marketingClosedClient.json?.data?.created_by === marketingSellerId
      && marketingContractPermissionProbe.status === 400
      && marketingContractPermissionProbe.json?.error === 'Tipo de serviço inválido.',
    JSON.stringify({ client: marketingClosedClient.json, contract: marketingContractPermissionProbe.json }));
  await appPool.query(
    `UPDATE users SET position = 'Marketing', team_id = NULL, supervisor_id = NULL,
                       commission_percentage = 5, commission_threshold = 0
      WHERE id = $1 AND tenant_id = $2`,
    [marketingSellerId, T1.id],
  );
  const marketingSale = await api('POST', '/api/management/sales', tok(master), {
    seller_id: marketingSellerId, customer_name: 'Cliente do Marketing',
    service_name: 'Multa', amount: 1000, closed_at: supervisionDate,
    payment_method: 'pix', closing_method: 'presencial',
  });
  const marketingRanking = await api('GET', `/api/management/ranking?month=${supervisionDate.slice(5, 7)}&year=${supervisionDate.slice(0, 4)}`, tok(master));
  const marketingRankingRow = marketingRanking.json?.data?.ranking?.find((row) => row.seller_id === marketingSellerId);
  const marketingCollaborators = await api('GET', `/api/management/collaborators?month=${supervisionDate.slice(5, 7)}&year=${supervisionDate.slice(0, 4)}`, tok(master));
  const marketingCollaborator = marketingCollaborators.json?.data?.find((row) => row.id === marketingSellerId);
  const teamAfterMarketingSale = await api('GET', `/api/management/team/${teamA.id}?${supervisionQuery}`, tok(sup));
  check('venda de marketing recebe 5% desde o primeiro real e não entra na equipe',
    marketingSale.status === 201
      && Number(marketingSale.json?.data?.commission_percentage) === 5
      && Number(marketingSale.json?.data?.commission_trigger_amount) === 0
      && Number(marketingSale.json?.data?.commission_amount) === 50
      && marketingSale.json?.data?.team_id === null
      && marketingSale.json?.data?.supervisor_id === null
      && Number(teamAfterMarketingSale.json?.data?.supervision_commission?.team_sales_base) === 30000,
    JSON.stringify({ sale: marketingSale.json?.data, team: teamAfterMarketingSale.json?.data?.supervision_commission }));
  check('tela de colaboradores mostra a regra individual de marketing sem alterar consultores',
    marketingCollaborator?.position === 'Marketing'
      && Number(marketingCollaborator.commission_percentage) === 5
      && Number(marketingCollaborator.commission_threshold) === 0
      && marketingCollaborators.json?.data?.find((row) => row.id === metaSeller.id)?.commission_percentage === 10,
    JSON.stringify(marketingCollaborator));
  check('ranking apresenta o percentual efetivamente aplicado às vendas de marketing',
    marketingRanking.status === 200 && Number(marketingRankingRow?.commission_percentage) === 5,
    JSON.stringify(marketingRankingRow));

  check('10. supervisor não acessa outra equipe por URL', (await api('GET', `/api/management/team/${createdTeam.json.data.id}?${supervisionQuery}`, tok(sup))).status === 403);
  const externalSalesProbe = await api('GET', `/api/management/sales?${supervisionQuery}&seller_id=${externalSeller.id}`, tok(sup));
  check('10b. supervisor não acessa vendedor externo por parâmetro', externalSalesProbe.status === 200 && externalSalesProbe.json.data.length === 0);
  const consultantProbe = await api('GET', `/api/management/sales?${supervisionQuery}&seller_id=${metaSeller.id}`, tok(s2));
  check('11. consultor não acessa vendas de outro consultor', consultantProbe.status === 200 && consultantProbe.json.data.length === 0);
  const supervisorTargetsScoped = await api('GET', `/api/management/targets?${supervisionQuery}`, tok(sup));
  check('supervisora recebe só meta da equipe e metas individuais permitidas', supervisorTargetsScoped.status === 200
    && supervisorTargetsScoped.json.data.company_target === null
    && supervisorTargetsScoped.json.data.team_targets.length === 1
    && supervisorTargetsScoped.json.data.user_targets.every((row) => row.team_id === teamA.id));

  console.log('\n== Aceite de metas históricas e transferência ==');
  await api('PUT', `/api/management/targets/users/${metaSeller.id}`, tok(master), { month: 1, year: 2027, amount: 10000 });
  await api('PUT', `/api/management/targets/users/${metaSeller.id}`, tok(master), { month: 1, year: 2027, amount: 12500 });
  await api('PUT', `/api/management/targets/users/${metaSeller.id}`, tok(master), { month: 2, year: 2027, amount: 9000 });
  const januaryTargets = await api('GET', '/api/management/targets?month=1&year=2027', tok(master));
  const februaryTargets = await api('GET', '/api/management/targets?month=2&year=2027', tok(master));
  const januaryMeta = januaryTargets.json.data.user_targets.find((row) => row.user_id === metaSeller.id);
  const februaryMeta = februaryTargets.json.data.user_targets.find((row) => row.user_id === metaSeller.id);
  check('12. meta de R$ 10.000 pode ser alterada', Number(januaryMeta?.amount) === 12500 && januaryMeta?.updated_by_name === 'CR Recursos', JSON.stringify(januaryMeta));
  check('13. metas de competências anteriores permanecem preservadas', Number(januaryMeta?.amount) === 12500 && Number(februaryMeta?.amount) === 9000);

  const createdTransfer = await api('POST', '/api/users/management', tok(master), {
    name: 'Consultor Transferido', email: 'transferido@cr.com', password: 'Temporaria@2026', role: 'seller',
  });
  const transferSeller = { ...createdTransfer.json?.data, tenant_id: T1.id };
  await api('PUT', `/api/management/collaborators/${transferSeller.id}`, tok(master), { team_id: teamA.id, supervisor_id: sup.id });
  const oldTeamSale = await api('POST', '/api/management/sales', tok(master), { seller_id: transferSeller.id, amount: 1000, closed_at: '2027-05-05', description: 'Antes da transferência' });
  await api('PUT', `/api/management/collaborators/${transferSeller.id}`, tok(master), { team_id: createdTeam.json.data.id, supervisor_id: admin.id });
  const newTeamSale = await api('POST', '/api/management/sales', tok(master), { seller_id: transferSeller.id, amount: 1000, closed_at: '2027-05-06', description: 'Depois da transferência' });
  const oldTeamSnapshot = await api('GET', `/api/management/sales?month=5&year=2027&team_id=${teamA.id}&seller_id=${transferSeller.id}`, tok(master));
  const newTeamSnapshot = await api('GET', `/api/management/sales?month=5&year=2027&team_id=${createdTeam.json.data.id}&seller_id=${transferSeller.id}`, tok(master));
  check('8. transferência preserva a equipe válida de cada venda/competência', oldTeamSale.json.data.team_id === teamA.id
    && newTeamSale.json.data.team_id === createdTeam.json.data.id
    && oldTeamSnapshot.json.data.length === 1
    && newTeamSnapshot.json.data.length === 1,
  JSON.stringify({ old: oldTeamSnapshot.json, next: newTeamSnapshot.json }));

  // ── FIM ──
  try { await server.stop(); } catch {}
  try { await pglite.close(); } catch {}
  console.log('\n' + results.join('\n'));
  console.log(`\n${fail ? '✗ ' + fail + ' FALHA(S)' : '✓ TUDO PASSOU'} — ${pass} checks ok, ${fail} falhas\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('\n[ERRO FATAL NO HARNESS]', e); process.exit(2); });
