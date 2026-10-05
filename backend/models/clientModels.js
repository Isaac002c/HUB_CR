const pool = require('../config/db');

// ============================================
// CLIENTS MODEL - Clientes/Proprietários
// ============================================

// Helper - converte string vazia para null (evita erro de tipo date no PostgreSQL)
const toDateOrNull = (value) => (value === '' || value === undefined ? null : value);
const toStrOrNull = (value) => (value === '' || value === undefined ? null : value);
const LEAD_STATUSES = new Set([
  'entrada', 'possui_defensor', 'nao_quer_defender', 'negociacao',
  'fechado', 'perdido', 'nao_encontrado',
]);

// Escopo RBAC (consultor=ownerId / supervisor=teamId). $1 = tenant_id.
function ownershipClause(params, { ownerId, teamId } = {}) {
  let clause = '';
  let i = params.length + 1;
  if (ownerId) { clause += ` AND created_by = $${i}`; params.push(ownerId); i++; }
  if (teamId)  { clause += ` AND created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND team_id = $${i})`; params.push(teamId); i++; }
  return clause;
}

// CREATE - Criar novo cliente
const createClient = async ({
  tenant_id, name, birth_date, cpf, cnh, first_cnh, phone, email, address, notes, status, created_by
}) => {
  if (!tenant_id) {
    throw new Error('tenant_id é obrigatório para criar um cliente');
  }

  const result = await pool.query(
    `INSERT INTO clients(tenant_id, name, birth_date, cpf, cnh, first_cnh, phone, email, address, notes, status, created_by)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      tenant_id,
      name,
      toDateOrNull(birth_date),
      toStrOrNull(cpf),
      toStrOrNull(cnh),
      toDateOrNull(first_cnh),
      toStrOrNull(phone),
      toStrOrNull(email),
      toStrOrNull(address),
      toStrOrNull(notes),
      status || 'negociacao',
      created_by || null,
    ]
  );

  return result.rows[0];
};

// READ - Listar clientes do tenant (com escopo RBAC opcional)
// LIMIT 500: proteção de performance; se ultrapassar esse volume, implementar paginação real
const getAllClients = async (tenant_id, scope = {}) => {
  const params = [tenant_id];
  const own = ownershipClause(params, scope);
  const result = await pool.query(
    `SELECT c.id, c.tenant_id, c.name, c.cpf, c.cnh, c.first_cnh, c.birth_date,
            c.phone, c.email, c.address, c.notes, c.status, c.created_at, c.created_by, c.lead_id,
            owner.name AS consultant_name
     FROM clients c
     LEFT JOIN users owner ON owner.id = c.created_by AND owner.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1${own.replaceAll('created_by', 'c.created_by')}
     ORDER BY c.name ASC
     LIMIT 500`,
    params
  );
  return result.rows;
};

// READ - Buscar cliente por ID
const getClientById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT c.*, owner.name AS consultant_name
       FROM clients c
       LEFT JOIN users owner ON owner.id = c.created_by AND owner.tenant_id = c.tenant_id
      WHERE c.id = $1 AND c.tenant_id = $2`,
    [id, tenant_id]
  );
  return result.rows[0];
};

// READ - Buscar cliente por CPF
const getClientByCPF = async (cpf, tenant_id) => {
  const result = await pool.query(
    'SELECT * FROM clients WHERE cpf = $1 AND tenant_id = $2',
    [cpf, tenant_id]
  );
  return result.rows[0];
};

// Usuário que pode assumir a carteira de um cliente fechado.
// A consulta por tenant impede atribuições cruzadas mesmo com chamada direta à API.
const getAssignableConsultant = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT id, name
       FROM users
      WHERE id = $1 AND tenant_id = $2
        AND COALESCE(is_active, true) = true
        AND LOWER(role) IN ('master', 'seller', 'supervisor')`,
    [id, tenant_id]
  );
  return result.rows[0];
};

// READ - Pesquisar clientes (com escopo RBAC opcional)
const searchClients = async (tenant_id, searchTerm, scope = {}) => {
  const params = [tenant_id, `%${searchTerm}%`];
  const own = ownershipClause(params, scope);
  const result = await pool.query(
    `SELECT c.id, c.tenant_id, c.name, c.cpf, c.cnh, c.first_cnh, c.birth_date,
            c.phone, c.email, c.address, c.notes, c.status, c.created_at, c.created_by, c.lead_id,
            owner.name AS consultant_name
     FROM clients c
     LEFT JOIN users owner ON owner.id = c.created_by AND owner.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
       AND (c.name ILIKE $2 OR c.cpf ILIKE $2 OR c.cnh ILIKE $2 OR c.phone ILIKE $2)${own.replaceAll('created_by', 'c.created_by')}
     ORDER BY c.name ASC
     LIMIT 50`,
    params
  );
  return result.rows;
};

// READ - Contar clientes
const countClients = async (tenant_id, scope = {}) => {
  const params = [tenant_id];
  const own = ownershipClause(params, scope);
  const result = await pool.query(
    `SELECT COUNT(*) as total FROM clients WHERE tenant_id = $1${own}`,
    params
  );
  return result.rows[0].total;
};

// UPDATE - Atualizar cliente
const updateClient = async (id, {
  name, birth_date, cpf, cnh, first_cnh, phone, email, address, notes, status, consultant_id,
}, tenant_id) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changesConsultant = consultant_id !== undefined;
    const result = await client.query(
      `UPDATE clients
       SET name = $1, birth_date = $2, cpf = $3, cnh = $4, first_cnh = $5,
           phone = $6, email = $7, address = $8, notes = $9, status = $10,
           created_by = CASE WHEN $11 THEN $12 ELSE created_by END,
           updated_at = NOW()
       WHERE id = $13 AND tenant_id = $14 RETURNING *`,
      [
        name, toDateOrNull(birth_date), toStrOrNull(cpf), toStrOrNull(cnh),
        toDateOrNull(first_cnh), toStrOrNull(phone), toStrOrNull(email),
        toStrOrNull(address), toStrOrNull(notes), status || 'negociacao',
        changesConsultant, consultant_id ?? null, id, tenant_id,
      ]
    );
    const updated = result.rows[0];
    if (updated?.lead_id && LEAD_STATUSES.has(updated.status)) {
      await client.query(
        `UPDATE multas_leads
            SET status = $1, stage_changed_at = NOW(), updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [updated.status, updated.lead_id, tenant_id]
      );
    }
    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const syncLinkedClientStatusFromLead = async (lead, tenant_id) => {
  if (!lead?.id || !LEAD_STATUSES.has(lead.status)) return null;
  const result = await pool.query(
    `UPDATE clients
        SET status = $1, updated_at = NOW()
      WHERE tenant_id = $2 AND lead_id = $3
      RETURNING id`,
    [lead.status, tenant_id, lead.id]
  );
  return result.rows[0] || null;
};

// DELETE - Deletar cliente
const deleteClient = async (id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM clients WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [id, tenant_id]
  );
  return result.rows[0];
};

// ============================================
// Mantém o cliente correspondente a um lead em "negociação" ou "fechado".
// Idempotente e sem duplicar dados:
//   1) já existe cliente vinculado a este lead (lead_id)?  -> não cria
//   2) já existe cliente com o mesmo CPF neste tenant?     -> vincula o existente, não cria
//   3) senão, cria o cliente herdando os dados do lead.
// Respeita o tenant (todas as queries filtram por tenant_id). Requer a coluna
// clients.lead_id (migration add_client_lead_link.sql).
// ============================================
const ensureClientFromLead = async (lead, tenant_id, requestedStatus = null) => {
  if (!tenant_id) throw new Error('tenant_id é obrigatório');
  if (!lead || !lead.id) throw new Error('lead inválido');
  const targetStatus = requestedStatus === 'fechado' || lead.status === 'fechado' ? 'fechado' : 'negociacao';
  const validOwner = lead.created_by
    ? await pool.query(
        'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 LIMIT 1',
        [lead.created_by, tenant_id]
      )
    : { rows: [] };
  const ownerId = validOwner.rows[0]?.id || null;

  const syncLinkedClient = async (clientId) => {
    await pool.query(
      `UPDATE clients
          SET name = COALESCE(NULLIF($1, ''), name),
              cpf = COALESCE(NULLIF($2, ''), cpf),
              cnh = COALESCE(NULLIF($3, ''), cnh),
              first_cnh = COALESCE($4, first_cnh),
              birth_date = COALESCE($5, birth_date),
              phone = COALESCE(NULLIF($6, ''), phone),
              status = CASE WHEN status = 'fechado' OR $7 = 'fechado' THEN 'fechado' ELSE 'negociacao' END,
              created_by = COALESCE(created_by, $8),
              updated_at = NOW()
        WHERE id = $9 AND tenant_id = $10`,
      [
        String(lead.name || '').trim(),
        String(lead.cpf || '').replace(/\D/g, ''),
        String(lead.cnh || '').trim(),
        toDateOrNull(lead.first_license_date),
        toDateOrNull(lead.birth_date),
        String(lead.phone || '').trim(),
        targetStatus,
        ownerId,
        clientId,
        tenant_id,
      ]
    );
  };

  // 1) idempotência por vínculo direto
  const byLead = await pool.query(
    'SELECT id FROM clients WHERE lead_id = $1 AND tenant_id = $2 LIMIT 1',
    [lead.id, tenant_id]
  );
  if (byLead.rows[0]) {
    await syncLinkedClient(byLead.rows[0].id);
    return { created: false, reason: 'already_linked', id: byLead.rows[0].id };
  }

  // 2) dedupe por CPF (mesma pessoa já cadastrada) — compara só dígitos
  const cpf = String(lead.cpf || '').replace(/\D/g, '') || null;
  if (cpf) {
    const byCpf = await pool.query(
      `SELECT id FROM clients
         WHERE tenant_id = $1
           AND regexp_replace(COALESCE(cpf, ''), '\\D', '', 'g') = $2
         LIMIT 1`,
      [tenant_id, cpf]
    );
    if (byCpf.rows[0]) {
      // Vincula o cliente já existente a este lead sem duplicá-lo. Um cliente
      // já fechado nunca é rebaixado para negociação.
      await pool.query(
        `UPDATE clients
            SET lead_id = $1,
                created_by = COALESCE(created_by, $2),
                updated_at = NOW()
          WHERE id = $3 AND tenant_id = $4 AND lead_id IS NULL`,
        [lead.id, ownerId, byCpf.rows[0].id, tenant_id]
      );
      await syncLinkedClient(byCpf.rows[0].id);
      return { created: false, reason: 'existing_cpf', id: byCpf.rows[0].id };
    }
  }

  // 3) cria o cliente herdando os dados disponíveis do lead
  const notesParts = [];
  if (lead.source)          notesParts.push(`Origem: ${lead.source}`);
  if (lead.created_by_name) notesParts.push(`Consultor: ${lead.created_by_name}`);
  if (lead.notes)           notesParts.push(String(lead.notes));
  const notes = notesParts.join('\n') || null;

  const result = await pool.query(
    `INSERT INTO clients
       (tenant_id, name, cpf, cnh, first_cnh, birth_date, phone, notes, status, lead_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      tenant_id,
      lead.name,
      cpf,
      toStrOrNull(lead.cnh),
      toDateOrNull(lead.first_license_date),
      toDateOrNull(lead.birth_date),
      toStrOrNull(lead.phone),
      notes,
      targetStatus,
      lead.id,
      ownerId,
    ]
  );
  return { created: true, id: result.rows[0].id };
};

module.exports = {
  createClient,
  getAllClients,
  getClientById,
  getClientByCPF,
  getAssignableConsultant,
  searchClients,
  countClients,
  updateClient,
  deleteClient,
  ensureClientFromLead,
  syncLinkedClientStatusFromLead,
};
