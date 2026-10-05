/* Integração do fluxo transacional Resend sem chamadas externas reais. */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const { Webhook } = require('standardwebhooks');

const PG_PORT = Number(process.env.CR_EMAIL_TEST_PG_PORT || 54339);
const APP_PORT = Number(process.env.CR_EMAIL_TEST_APP_PORT || 54340);
const JWT_SECRET = 'email-integration-test-secret';
const DBURL = `postgresql://postgres@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`;
const WEBHOOK_SECRET = `whsec_${Buffer.from('cr-recursos-webhook-test-secret').toString('base64')}`;

let pass = 0;
let fail = 0;
const results = [];
function check(name, condition, extra = '') {
  if (condition) { pass += 1; results.push(`  ✓ ${name}`); }
  else { fail += 1; results.push(`  ✗ ${name}${extra ? ` → ${extra}` : ''}`); }
}

async function api(method, pathname, token, body, extraHeaders = {}) {
  const raw = typeof body === 'string' ? body : (body === undefined ? undefined : JSON.stringify(body));
  const response = await fetch(`http://localhost:${APP_PORT}${pathname}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: raw,
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: response.status, json };
}

function token(user) {
  return jwt.sign({ userId: user.id, tenantId: user.tenant_id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });
}

async function main() {
  const { PGlite } = require('@electric-sql/pglite');
  const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
  const pglite = await PGlite.create();
  const socket = new PGLiteSocketServer({ db: pglite, port: PG_PORT, host: '127.0.0.1' });
  await socket.start();
  const db = new Client({ connectionString: DBURL });
  await db.connect();

  await db.query(`
    CREATE TABLE tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, slug TEXT,
      email TEXT, status TEXT DEFAULT 'ativo', is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id),
      name TEXT, email TEXT, role TEXT, team_id UUID, is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id),
      name TEXT, email TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE fines (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID REFERENCES tenants(id),
      client_id UUID REFERENCES clients(id), seller_id UUID REFERENCES users(id), fine_number TEXT, plate TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE activity_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID, user_id UUID,
      entity TEXT, entity_id TEXT, entity_name TEXT, action TEXT, details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const migrations = path.join(__dirname, '..', 'migrations');
  const runMigration = async (name) => {
    const sql = fs.readFileSync(path.join(migrations, name), 'utf8').replace(/^.*CREATE EXTENSION.*$/gim, '');
    await db.query(sql);
  };
  await runMigration('gestao_07_audit_trail.sql');
  await runMigration('create_fine_protocols.sql');
  await runMigration('gestao_14_email_outbox.sql');

  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const t1 = await one(`INSERT INTO tenants(name,slug,email) VALUES('CR Recursos','cr-recursos','camila@empresa.test') RETURNING *`);
  const t2 = await one(`INSERT INTO tenants(name,slug,email) VALUES('Outra Empresa','outra','contato@outra.test') RETURNING *`);
  const makeUser = (tenantId, name, email, role) => one(
    `INSERT INTO users(tenant_id,name,email,role) VALUES($1,$2,$3,$4) RETURNING *`,
    [tenantId, name, email, role]
  );
  const master = await makeUser(t1.id, 'Master', 'master@cr.test', 'master');
  const admin = await makeUser(t1.id, 'Administrativo', 'admin@cr.test', 'admin');
  const supervisor = await makeUser(t1.id, 'Supervisora', 'supervisor@cr.test', 'supervisor');
  const seller = await makeUser(t1.id, 'Consultor', 'consultor@cr.test', 'seller');
  const otherMaster = await makeUser(t2.id, 'Master T2', 'master@t2.test', 'master');
  const client = await one(`INSERT INTO clients(tenant_id,name,email) VALUES($1,'Cliente Resend','delivered@resend.dev') RETURNING *`, [t1.id]);
  const clientWithoutEmail = await one(`INSERT INTO clients(tenant_id,name) VALUES($1,'Cliente sem e-mail') RETURNING *`, [t1.id]);
  const fine = await one(`INSERT INTO fines(tenant_id,client_id,seller_id,fine_number,plate) VALUES($1,$2,$3,'AI-EMAIL-1','ABC1D23') RETURNING *`, [t1.id, client.id, seller.id]);
  const fineWithoutEmail = await one(`INSERT INTO fines(tenant_id,client_id,fine_number,plate) VALUES($1,$2,'AI-EMAIL-2','DEF4G56') RETURNING *`, [t1.id, clientWithoutEmail.id]);
  await db.end();

  Object.assign(process.env, {
    DATABASE_URL: DBURL,
    DB_SSL: 'false',
    JWT_SECRET,
    NODE_ENV: 'test',
    PORT: String(APP_PORT),
    PGPOOL_MAX: '1',
    EMAIL_PROVIDER: 'resend',
    EMAIL_AUTOMATION_ENABLED: 'true',
    EMAIL_DOMAIN_VERIFIED: 'true',
    EMAIL_FROM_NAME: 'CR Recursos',
    EMAIL_FROM_ADDRESS: 'notificacoes@envios.crrecursos.com.br',
    EMAIL_REPLY_TO: 'camila@crrecursos.com.br',
    EMAIL_TEST_RECIPIENT: 'delivered@resend.dev',
    EMAIL_WORKER_ENABLED: 'false',
    EMAIL_RETRY_BASE_MS: '1',
    RESEND_API_KEY: 're_test_only_not_a_real_key',
    RESEND_WEBHOOK_SECRET: WEBHOOK_SECRET,
    APP_URL: 'https://hub.crrecursos.com.br',
  });

  require('../app.js');
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await api('GET', '/health')).status === 200) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const pool = require('../config/db');
  const emailService = require('../services/emailService');
  const { renderEmailTemplate } = require('../services/emailTemplates');
  const { createResendEmailProvider } = require('../services/resendEmailProvider');
  const verifier = createResendEmailProvider({ apiKey: 're_test_verifier' });
  const calls = [];
  let providerMode = 'success';
  let providerSequence = 0;
  emailService.setProviderForTests({
    async sendEmail(message) {
      calls.push(message);
      if (providerMode === 'temporary') {
        const error = new Error('Serviço temporariamente indisponível');
        error.code = 'application_error'; error.statusCode = 503; throw error;
      }
      if (providerMode === 'permanent') {
        const error = new Error('Destinatário inválido');
        error.code = 'validation_error'; error.statusCode = 422; throw error;
      }
      providerSequence += 1;
      return { id: `email_provider_${providerSequence}` };
    },
    verifyWebhook: verifier.verifyWebhook,
  });

  const enqueue = (suffix, recipient = 'delivered@resend.dev', tenantId = t1.id, processId = fine.id) => emailService.enqueueEmail({
    tenantId,
    processId,
    createdBy: tenantId === t1.id ? master.id : otherMaster.id,
    eventType: `test.${suffix}`,
    recipient,
    templateKey: 'system_test',
    templateData: { tenant_name: tenantId === t1.id ? t1.name : t2.name, sent_at: '20/08/2026 12:00' },
    eventVersion: 'v1',
  });

  console.log('== Resend: configuração e envio seguro ==');
  const testResult = await api('POST', '/api/emails/test', token(master));
  check('1. envio de teste com configuração válida', testResult.status === 200
    && testResult.json?.data?.status === 'sent'
    && /^email_provider_/.test(testResult.json?.data?.provider_email_id || ''), JSON.stringify(testResult.json));

  const savedApiKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  let missingKey = null;
  try { emailService.assertProviderConfigured(); } catch (error) { missingKey = error; }
  check('2. ausência da RESEND_API_KEY produz erro claro', missingKey?.code === 'RESEND_API_KEY_MISSING');
  process.env.RESEND_API_KEY = savedApiKey;

  const savedFrom = process.env.EMAIL_FROM_ADDRESS;
  delete process.env.EMAIL_FROM_ADDRESS;
  let missingFrom = null;
  try { emailService.assertProviderConfigured(); } catch (error) { missingFrom = error; }
  check('3. remetente ausente é bloqueado', missingFrom?.code === 'EMAIL_FROM_MISSING');
  process.env.EMAIL_FROM_ADDRESS = savedFrom;

  console.log('== Outbox, fila, idempotência e retries ==');
  const queued = await enqueue('outbox');
  const queuedDb = await pool.query(`SELECT * FROM email_outbox WHERE id=$1`, [queued.id]);
  check('4. tentativa cria registro persistente na outbox', queued.status === 'queued' && queuedDb.rows[0]?.id === queued.id);
  const processed = await emailService.processEmailById(queued.id, t1.id);
  check('5. worker processa fila e salva ID do provedor', processed.status === 'sent' && Boolean(processed.provider_email_id));

  const callsBeforeDuplicate = calls.length;
  const duplicateA = await enqueue('duplicate');
  const duplicateB = await enqueue('duplicate');
  await emailService.processEmailById(duplicateA.id, t1.id);
  await emailService.processEmailById(duplicateB.id, t1.id);
  check('6. chave única impede e-mail duplicado', duplicateA.id === duplicateB.id && duplicateB.duplicate === true && calls.length === callsBeforeDuplicate + 1);

  providerMode = 'temporary';
  const temporary = await enqueue('temporary');
  const delayed = await emailService.processEmailById(temporary.id, t1.id);
  check('7a. erro temporário retorna à fila', delayed.status === 'queued'
    && delayed.attempts === 1
    && /temporariamente indisponível/i.test(delayed.last_error || ''), JSON.stringify(delayed));
  await pool.query(`UPDATE email_outbox SET scheduled_at=NOW() WHERE id=$1`, [temporary.id]);
  providerMode = 'success';
  const retried = await emailService.processEmailById(temporary.id, t1.id);
  check('7b. nova tentativa temporária é processada', retried.status === 'sent' && retried.attempts === 2);

  providerMode = 'permanent';
  const permanent = await enqueue('permanent');
  const permanentlyFailed = await emailService.processEmailById(permanent.id, t1.id);
  check('8. erro permanente falha sem reagendar', permanentlyFailed.status === 'failed' && permanentlyFailed.attempts === 1);
  providerMode = 'success';

  const webhook = new Webhook(WEBHOOK_SECRET);
  const sendWebhook = async (type, outbox, svixId, signatureIsValid = true) => {
    const body = JSON.stringify({
      type,
      created_at: new Date().toISOString(),
      data: { email_id: outbox.provider_email_id, to: [outbox.recipient] },
    });
    const timestamp = new Date();
    const signature = signatureIsValid ? webhook.sign(svixId, timestamp, body) : 'v1,invalid';
    return api('POST', '/api/webhooks/resend', null, body, {
      'svix-id': svixId,
      'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'svix-signature': signature,
    });
  };

  console.log('== Webhooks, entrega e suppressions ==');
  const deliveredOutbox = await enqueue('delivered');
  const sentForDelivery = await emailService.processEmailById(deliveredOutbox.id, t1.id);
  const deliveredHook = await sendWebhook('email.delivered', sentForDelivery, 'msg_delivered_1');
  const deliveredDb = await emailService.getEmailStatus({ id: sentForDelivery.id, tenantId: t1.id });
  check('9. webhook assinado atualiza para delivered', deliveredHook.status === 200 && deliveredDb.status === 'delivered' && Boolean(deliveredDb.delivered_at));

  const bounceOutbox = await enqueue('bounce', 'bounced@resend.dev');
  const sentForBounce = await emailService.processEmailById(bounceOutbox.id, t1.id);
  const bounceHook = await sendWebhook('email.bounced', sentForBounce, 'msg_bounced_1');
  const suppressedAfterBounce = await enqueue('after-bounce', 'bounced@resend.dev');
  check('10. bounce cria suppression e bloqueia novo envio', bounceHook.status === 200 && suppressedAfterBounce.status === 'suppressed');

  const complaintOutbox = await enqueue('complaint', 'complained@resend.dev');
  const sentForComplaint = await emailService.processEmailById(complaintOutbox.id, t1.id);
  const complaintHook = await sendWebhook('email.complained', sentForComplaint, 'msg_complained_1');
  const suppressedAfterComplaint = await enqueue('after-complaint', 'complained@resend.dev');
  check('11. complaint cria suppression e bloqueia novo envio', complaintHook.status === 200 && suppressedAfterComplaint.status === 'suppressed');

  const invalidSignature = await sendWebhook('email.delivered', sentForDelivery, 'msg_invalid_1', false);
  check('12. assinatura inválida é rejeitada', invalidSignature.status === 400);
  const repeated = await sendWebhook('email.delivered', sentForDelivery, 'msg_delivered_1');
  check('13. svix-id repetido é idempotente', repeated.status === 200 && repeated.json?.data?.duplicate === true);

  console.log('== Isolamento, permissões, templates e gatilho ==');
  const tenant2Outbox = await enqueue('tenant-two', 'delivered@resend.dev', t2.id, null);
  const t1Dashboard = await api('GET', '/api/emails/dashboard', token(master));
  const t2Dashboard = await api('GET', '/api/emails/dashboard', token(otherMaster));
  const t2ReadsT1 = await api('GET', `/api/emails/${queued.id}`, token(otherMaster));
  check('14. dashboards e consulta são isolados por tenant', t1Dashboard.status === 200
    && t2Dashboard.json?.data?.recent?.every((item) => item.id === tenant2Outbox.id)
    && t2ReadsT1.status === 404);
  check('15. painel/API negados para supervisora, administrativo e consultor',
    (await api('GET', '/api/emails/dashboard', token(supervisor))).status === 403
    && (await api('POST', '/api/emails/test', token(seller))).status === 403
    && (await api('GET', '/api/emails/dashboard', token(admin))).status === 403);
  check('15b. consultor não acessa histórico de processo sem ownership',
    (await api('GET', `/api/fine-protocols/fine/${fineWithoutEmail.id}/email-history`, token(seller))).status === 403);

  process.env.EMAIL_AUTOMATION_ENABLED = 'false';
  check('16. automação pode ser desativada globalmente', emailService.isAutomationEnabled() === false);
  process.env.EMAIL_AUTOMATION_ENABLED = 'true';

  const template = renderEmailTemplate('protocol_available', {
    client_name: '<script>alert(1)</script>', process_number: 'AI-1',
    tenant_name: 'CR Recursos', process_url: 'https://hub.crrecursos.com.br/processo',
  });
  check('17. template contém HTML/texto e escapa entrada do usuário',
    template.html.includes('&lt;script&gt;') && !template.html.includes('<script>alert(1)</script>')
    && template.text.includes('<script>alert(1)</script>') && template.subject.length > 0);

  const preservedProtocol = await api('POST', '/api/fine-protocols', token(master), {
    fine_id: fineWithoutEmail.id,
    protocol_number: 'PROTO-PRESERVADO',
    protocol_file_url: `https://api-hub.crrecursos.com.br/uploads/${t1.id}/arquivo-inexistente.pdf`,
  });
  const preservedDb = await pool.query(`SELECT * FROM fine_protocols WHERE protocol_number='PROTO-PRESERVADO'`);
  check('18. processo/protocolo é preservado quando o e-mail não pode ser enfileirado',
    preservedProtocol.status === 201 && preservedProtocol.json?.email?.status === 'not_queued' && preservedDb.rowCount === 1);

  const uploadDir = path.join(__dirname, '..', 'uploads', t1.id);
  const uploadPath = path.join(uploadDir, 'protocolo-teste.txt');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(uploadPath, 'protocolo de teste sem dados sensíveis', 'utf8');
  const automaticProtocol = await api('POST', '/api/fine-protocols', token(master), {
    fine_id: fine.id,
    protocol_number: 'PROTO-AUTOMATICO',
    protocol_file_url: `https://api-hub.crrecursos.com.br/uploads/${t1.id}/protocolo-teste.txt`,
  });
  const automaticOutbox = automaticProtocol.json?.email;
  const automaticSent = automaticOutbox?.id
    ? await emailService.processEmailById(automaticOutbox.id, t1.id)
    : null;
  check('gatilho existente: protocolo com anexo entra na fila e é processado',
    automaticProtocol.status === 201 && automaticOutbox?.status === 'queued'
    && automaticSent?.status === 'sent' && automaticSent?.process_id === fine.id,
  JSON.stringify(automaticProtocol.json));
  try { fs.rmSync(uploadPath); } catch {}

  await pool.end();
  try { await socket.stop(); } catch {}
  try { await pglite.close(); } catch {}
  console.log(`\n${results.join('\n')}`);
  console.log(`\n${fail ? `✗ ${fail} FALHA(S)` : '✓ TUDO PASSOU'} — ${pass} checks ok, ${fail} falhas\n`);
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error('\n[ERRO FATAL NO TESTE DE E-MAIL]', error);
  process.exit(2);
});
