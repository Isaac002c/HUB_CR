const pool = require('../config/db');

const VALID_STATUSES = ['entrada', 'possui_defensor', 'nao_quer_defender', 'negociacao', 'fechado', 'perdido', 'nao_encontrado'];

// CREATE
const createMultasLead = async ({
  tenant_id, name, cpf, cnh, first_license_date, birth_date,
  phone, source, status, created_by, created_by_name, notes, motivo
}) => {
  if (!tenant_id) throw new Error('tenant_id é obrigatório');
  if (!name)      throw new Error('name é obrigatório');

  const result = await pool.query(
    `INSERT INTO multas_leads
       (tenant_id, name, cpf, cnh, first_license_date, birth_date,
        phone, source, status, created_by, created_by_name, notes, motivo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      tenant_id, name,
      cpf             || null,
      cnh             || null,
      first_license_date || null,
      birth_date      || null,
      phone           || null,
      source          || null,
      VALID_STATUSES.includes(status) ? status : 'entrada',
      created_by      || null,
      created_by_name || null,
      notes           || null,
      motivo          || null,
    ]
  );
  return result.rows[0];
};

// Escopo RBAC opcional: ownerId (consultor) / teamId (supervisor).
function ownershipClause(params, { ownerId, teamId } = {}, tenantParamIndex = 1) {
  let clause = '';
  let i = params.length + 1;
  if (ownerId) { clause += ` AND ml.created_by = $${i}`; params.push(ownerId); i++; }
  if (teamId)  { clause += ` AND ml.created_by IN (SELECT id FROM users WHERE tenant_id = $${tenantParamIndex} AND team_id = $${i})`; params.push(teamId); i++; }
  return clause;
}

// READ - todos (exclui arquivados)
const getAllMultasLeads = async (tenant_id, scope = {}) => {
  const params = [tenant_id];
  const own = ownershipClause(params, scope);
  const result = await pool.query(
    `SELECT ml.*, u.name AS user_name
     FROM multas_leads ml
     LEFT JOIN users u ON ml.created_by = u.id
     WHERE ml.tenant_id = $1 AND ml.archived_at IS NULL${own}
     ORDER BY ml.created_at DESC`,
    params
  );
  return result.rows;
};

// READ - por status
const getMultasLeadsByStatus = async (tenant_id, status) => {
  const result = await pool.query(
    `SELECT ml.*, u.name AS user_name
     FROM multas_leads ml
     LEFT JOIN users u ON ml.created_by = u.id
     WHERE ml.tenant_id = $1 AND ml.status = $2
     ORDER BY ml.created_at DESC`,
    [tenant_id, status]
  );
  return result.rows;
};

// READ - por id
const getMultasLeadById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT ml.*, u.name AS user_name
     FROM multas_leads ml
     LEFT JOIN users u ON ml.created_by = u.id
     WHERE ml.id = $1 AND ml.tenant_id = $2`,
    [id, tenant_id]
  );
  return result.rows[0];
};

// READ - contagem por status
const countMultasLeadsByStatus = async (tenant_id) => {
  const result = await pool.query(
    `SELECT status, COUNT(*) as count
     FROM multas_leads
     WHERE tenant_id = $1
     GROUP BY status`,
    [tenant_id]
  );
  return result.rows;
};

// UPDATE
const updateMultasLead = async (id, {
  name, cpf, cnh, first_license_date, birth_date,
  phone, source, status, notes, motivo, consultant_id, consultant_name,
}, tenant_id) => {
  const normalizedStatus = VALID_STATUSES.includes(status) ? status : 'entrada';
  const changesConsultant = consultant_id !== undefined;
  // $13 é um parâmetro SEPARADO com o mesmo valor de status ($8). Reusar $8 na
  // comparação causava "inconsistent types deduced for parameter $8" (status é
  // varchar na atribuição e text no operador <>). Parâmetros distintos resolvem.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE multas_leads
       SET name = $1, cpf = $2, cnh = $3, first_license_date = $4, birth_date = $5,
           phone = $6, source = $7, status = $8, notes = $9, motivo = $10,
           created_by = CASE WHEN $14 THEN $15 ELSE created_by END,
           created_by_name = CASE WHEN $14 THEN $16 ELSE created_by_name END,
           stage_changed_at = CASE WHEN multas_leads.status <> $13 THEN NOW() ELSE multas_leads.stage_changed_at END,
           updated_at = NOW()
       WHERE id = $11 AND tenant_id = $12
       RETURNING *`,
      [
        name,
        cpf             || null,
        cnh             || null,
        first_license_date || null,
        birth_date      || null,
        phone           || null,
        source          || null,
        normalizedStatus,
        notes           || null,
        motivo          || null,
        id, tenant_id,
        normalizedStatus,
        changesConsultant, consultant_id ?? null, consultant_name ?? null,
      ]
    );
    if (changesConsultant && result.rows[0]) {
      await client.query(
        `UPDATE clients
            SET created_by = $1, updated_at = NOW()
          WHERE tenant_id = $2 AND lead_id = $3`,
        [consultant_id, tenant_id, id]
      );
    }
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// UPDATE status only
const updateMultasLeadStatus = async (id, status, tenant_id) => {
  const normalized = (status || '').toLowerCase().trim();
  if (!VALID_STATUSES.includes(normalized)) throw new Error('Status inválido');
  const result = await pool.query(
    `UPDATE multas_leads SET status = $1, stage_changed_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [normalized, id, tenant_id]
  );
  return result.rows[0];
};

// READ - kanban (oculta automaticamente itens parados há muito tempo, sem arquivar/apagar)
// Regra: negociacao > 30 dias | demais status > 7 dias, contados por stage_changed_at.
const getKanbanLeads = async (tenant_id, scope = {}) => {
  const params = [tenant_id];
  const own = ownershipClause(params, scope);
  const result = await pool.query(
    `SELECT ml.*, u.name AS user_name
       FROM multas_leads ml
       LEFT JOIN users u ON ml.created_by = u.id
      WHERE ml.tenant_id = $1
        AND ml.archived_at IS NULL${own}
        AND NOT (
          (ml.status = 'negociacao' AND COALESCE(ml.stage_changed_at, ml.updated_at, ml.created_at) < NOW() - INTERVAL '30 days')
          OR
          (ml.status <> 'negociacao' AND COALESCE(ml.stage_changed_at, ml.updated_at, ml.created_at) < NOW() - INTERVAL '7 days')
        )
      ORDER BY ml.created_at DESC`,
    params
  );
  return result.rows;
};

// ARCHIVE OLD (soft delete — admin only)
// negociacao: 30 dias | demais (exceto entrada/fechado): 7 dias
const archiveOldLeads = async (tenant_id) => {
  const result = await pool.query(
    `UPDATE multas_leads
     SET archived_at = NOW()
     WHERE tenant_id = $1
       AND archived_at IS NULL
       AND (
         (status = 'negociacao'  AND created_at < NOW() - INTERVAL '30 days')
         OR
         (status NOT IN ('negociacao','entrada','fechado') AND created_at < NOW() - INTERVAL '7 days')
       )
     RETURNING id, status, created_at`,
    [tenant_id]
  );
  return result.rows;
};

// DELETE
const deleteMultasLead = async (id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM multas_leads WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [id, tenant_id]
  );
  return result.rows[0];
};

module.exports = {
  createMultasLead,
  getAllMultasLeads,
  getKanbanLeads,
  getMultasLeadsByStatus,
  getMultasLeadById,
  countMultasLeadsByStatus,
  updateMultasLead,
  updateMultasLeadStatus,
  deleteMultasLead,
  archiveOldLeads,
};
