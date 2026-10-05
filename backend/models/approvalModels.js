const pool = require('../config/db');

const create = async ({ tenant_id, requested_by, target_type, target_id, target_label, reason }) => {
  if (!tenant_id)    throw new Error('tenant_id é obrigatório');
  if (!target_type)  throw new Error('target_type é obrigatório');
  if (!target_id)    throw new Error('target_id é obrigatório');
  const r = await pool.query(
    `INSERT INTO approval_requests
       (tenant_id, requested_by, target_type, target_id, target_label, reason)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenant_id, requested_by || null, target_type, target_id, target_label || null, reason || null]
  );
  return r.rows[0];
};

const listByTenant = async (tenant_id, status) => {
  let q = `SELECT ar.*,
              u1.name AS requester_name, u1.email AS requester_email,
              u2.name AS reviewer_name
           FROM approval_requests ar
           LEFT JOIN users u1 ON ar.requested_by = u1.id
           LEFT JOIN users u2 ON ar.reviewed_by  = u2.id
           WHERE ar.tenant_id = $1`;
  const params = [tenant_id];
  if (status) { q += ` AND ar.status = $2`; params.push(status); }
  q += ' ORDER BY ar.created_at DESC';
  const r = await pool.query(q, params);
  return r.rows;
};

// Para a supervisão, uma solicitação pertence à equipe de quem a abriu.
// Isso mantém, por exemplo, solicitações de consultores sem equipe fora da
// fila da supervisora.
const listByTeam = async (tenant_id, team_id, status) => {
  let q = `SELECT ar.*,
              u1.name AS requester_name, u1.email AS requester_email,
              u2.name AS reviewer_name
           FROM approval_requests ar
           INNER JOIN users u1 ON ar.requested_by = u1.id
           LEFT JOIN users u2 ON ar.reviewed_by = u2.id
           WHERE ar.tenant_id = $1 AND u1.tenant_id = $1 AND u1.team_id = $2`;
  const params = [tenant_id, team_id];
  if (status) { q += ` AND ar.status = $3`; params.push(status); }
  q += ' ORDER BY ar.created_at DESC';
  const r = await pool.query(q, params);
  return r.rows;
};

const getById = async (id, tenant_id) => {
  const r = await pool.query(
    'SELECT * FROM approval_requests WHERE id=$1 AND tenant_id=$2',
    [id, tenant_id]
  );
  return r.rows[0];
};

const getByIdForTeam = async (id, tenant_id, team_id) => {
  const r = await pool.query(
    `SELECT ar.*
       FROM approval_requests ar
       INNER JOIN users requester ON requester.id = ar.requested_by
      WHERE ar.id = $1
        AND ar.tenant_id = $2
        AND requester.tenant_id = $2
        AND requester.team_id = $3`,
    [id, tenant_id, team_id]
  );
  return r.rows[0];
};

// Retorna o responsável pelo registro que terá a exclusão solicitada. A rota
// usa isso para que um consultor só possa abrir solicitação para um item seu.
const getTargetOwner = async (target_type, target_id, tenant_id) => {
  const queries = {
    lead: `SELECT created_by AS owner_id FROM multas_leads
            WHERE id = $1 AND tenant_id = $2`,
    client: `SELECT created_by AS owner_id FROM clients
              WHERE id = $1 AND tenant_id = $2`,
    contract: `SELECT COALESCE(f.seller_id, c.created_by) AS owner_id
                 FROM fines f
                 LEFT JOIN clients c ON c.id = f.client_id AND c.tenant_id = f.tenant_id
                WHERE f.id = $1 AND f.tenant_id = $2`,
    document: `SELECT uploaded_by AS owner_id FROM documents
               WHERE id = $1 AND tenant_id = $2`,
  };
  const q = queries[target_type];
  if (!q) throw new Error('Tipo de solicitação inválido');
  const r = await pool.query(q, [target_id, tenant_id]);
  return r.rows[0]?.owner_id || null;
};

const userBelongsToTeam = async (user_id, tenant_id, team_id) => {
  const r = await pool.query(
    'SELECT 1 FROM users WHERE id = $1 AND tenant_id = $2 AND team_id = $3',
    [user_id, tenant_id, team_id]
  );
  return Boolean(r.rows[0]);
};

const approve = async (id, reviewed_by, tenant_id) => {
  const req = await getById(id, tenant_id);
  if (!req) throw new Error('Solicitação não encontrada');
  if (req.status !== 'pending') throw new Error('Solicitação já processada');

  // Executar a exclusão real de acordo com o tipo
  const ttl = req.target_type;
  if (ttl === 'lead') {
    await pool.query('DELETE FROM multas_leads WHERE id=$1 AND tenant_id=$2', [req.target_id, tenant_id]);
  } else if (ttl === 'client') {
    await pool.query('DELETE FROM clients WHERE id=$1 AND tenant_id=$2', [req.target_id, tenant_id]);
  } else if (ttl === 'contract') {
    await pool.query('DELETE FROM fines WHERE id=$1 AND tenant_id=$2', [req.target_id, tenant_id]);
  } else if (ttl === 'document') {
    await pool.query('DELETE FROM documents WHERE id=$1 AND tenant_id=$2', [req.target_id, tenant_id]);
  }

  const r = await pool.query(
    `UPDATE approval_requests SET status='approved', reviewed_by=$1, reviewed_at=NOW()
     WHERE id=$2 AND tenant_id=$3 RETURNING *`,
    [reviewed_by, id, tenant_id]
  );
  return r.rows[0];
};

const reject = async (id, reviewed_by, tenant_id) => {
  const req = await getById(id, tenant_id);
  if (!req) throw new Error('Solicitação não encontrada');
  if (req.status !== 'pending') throw new Error('Solicitação já processada');
  const r = await pool.query(
    `UPDATE approval_requests SET status='rejected', reviewed_by=$1, reviewed_at=NOW()
     WHERE id=$2 AND tenant_id=$3 RETURNING *`,
    [reviewed_by, id, tenant_id]
  );
  return r.rows[0];
};

module.exports = {
  create,
  listByTenant,
  listByTeam,
  getById,
  getByIdForTeam,
  getTargetOwner,
  userBelongsToTeam,
  approve,
  reject,
};
