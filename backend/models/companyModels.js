const pool = require('../config/db');

// ============================================
// COMPANIES MODEL - Empresas (pessoas jurídicas)
// Tudo escopado por tenant_id.
// ============================================

const toStrOrNull = (v) => (v === '' || v === undefined ? null : v);

// Escopo RBAC (consultor=ownerId / supervisor=teamId). $1 = tenant_id.
function ownershipClause(params, { ownerId, teamId } = {}, col = 'created_by') {
  let clause = '';
  let i = params.length + 1;
  if (ownerId) { clause += ` AND ${col} = $${i}`; params.push(ownerId); i++; }
  if (teamId)  { clause += ` AND ${col} IN (SELECT id FROM users WHERE tenant_id = $1 AND team_id = $${i})`; params.push(teamId); i++; }
  return clause;
}

const createCompany = async ({
  tenant_id, razao_social, nome_fantasia, cnpj, responsavel, phone, email, address, notes, status, created_by
}) => {
  if (!tenant_id) throw new Error('tenant_id é obrigatório');
  const r = await pool.query(
    `INSERT INTO companies(tenant_id, razao_social, nome_fantasia, cnpj, responsavel, phone, email, address, notes, status, created_by)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      tenant_id, razao_social, toStrOrNull(nome_fantasia), cnpj,
      toStrOrNull(responsavel), toStrOrNull(phone), toStrOrNull(email),
      toStrOrNull(address), toStrOrNull(notes), status || 'ativo', created_by || null,
    ]
  );
  return r.rows[0];
};

// Lista + busca (razão social, nome fantasia, CNPJ ou placa de veículo) — tenant + escopo RBAC
const getAllCompanies = async (tenant_id, searchTerm, scope = {}) => {
  if (searchTerm && searchTerm.trim()) {
    const like = `%${searchTerm.trim()}%`;
    const digits = searchTerm.replace(/\D/g, '');
    const params = [tenant_id, like, digits];
    const own = ownershipClause(params, scope, 'co.created_by');
    const r = await pool.query(
      `SELECT DISTINCT co.*
         FROM companies co
         LEFT JOIN company_vehicles v ON v.company_id = co.id AND v.tenant_id = co.tenant_id
        WHERE co.tenant_id = $1
          AND (
            co.razao_social ILIKE $2
            OR co.nome_fantasia ILIKE $2
            OR ($3 <> '' AND co.cnpj ILIKE '%' || $3 || '%')
            OR v.plate ILIKE $2
          )${own}
        ORDER BY co.razao_social ASC
        LIMIT 200`,
      params
    );
    return r.rows;
  }
  const params = [tenant_id];
  const own = ownershipClause(params, scope, 'created_by');
  const r = await pool.query(
    `SELECT * FROM companies WHERE tenant_id = $1${own} ORDER BY razao_social ASC LIMIT 500`,
    params
  );
  return r.rows;
};

const getCompanyById = async (id, tenant_id) => {
  const r = await pool.query('SELECT * FROM companies WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
  return r.rows[0];
};

const getCompanyByCnpj = async (cnpj, tenant_id) => {
  const r = await pool.query('SELECT * FROM companies WHERE cnpj = $1 AND tenant_id = $2', [cnpj, tenant_id]);
  return r.rows[0];
};

const updateCompany = async (id, {
  razao_social, nome_fantasia, cnpj, responsavel, phone, email, address, notes, status
}, tenant_id) => {
  const r = await pool.query(
    `UPDATE companies
        SET razao_social=$1, nome_fantasia=$2, cnpj=$3, responsavel=$4,
            phone=$5, email=$6, address=$7, notes=$8, status=$9, updated_at=NOW()
      WHERE id=$10 AND tenant_id=$11 RETURNING *`,
    [
      razao_social, toStrOrNull(nome_fantasia), cnpj, toStrOrNull(responsavel),
      toStrOrNull(phone), toStrOrNull(email), toStrOrNull(address),
      toStrOrNull(notes), status || 'ativo', id, tenant_id,
    ]
  );
  return r.rows[0];
};

const setCompanyStatus = async (id, status, tenant_id) => {
  const r = await pool.query(
    'UPDATE companies SET status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *',
    [status, id, tenant_id]
  );
  return r.rows[0];
};

const countCompanyFines = async (id, tenant_id) => {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS total FROM fines WHERE company_id = $1 AND tenant_id = $2',
    [id, tenant_id]
  );
  return r.rows[0].total;
};

const deleteCompany = async (id, tenant_id) => {
  const r = await pool.query('DELETE FROM companies WHERE id=$1 AND tenant_id=$2 RETURNING *', [id, tenant_id]);
  return r.rows[0];
};

// Processos da empresa SEM veículo vinculado (vehicle_id NULL): placa ausente,
// inválida, não cadastrada ou vínculo incompleto. Acessíveis para vínculo manual.
const getUnlinkedCompanyFines = async (company_id, tenant_id) => {
  const r = await pool.query(
    `SELECT f.id,
            f.fine_number AS numero_multa,
            f.plate       AS vehicle_plate,
            f.organ,
            f.stage       AS status,
            f.due_date,
            f.notes,
            f.real_infractor_name,
            f.service_type_id AS service_id,
            f.company_id,
            f.vehicle_id,
            f.protocol_number, f.protocol_date, f.protocol_status, f.protocol_notes, f.protocol_file_url,
            st.code AS service_name
       FROM fines f
       LEFT JOIN service_types st ON f.service_type_id = st.id
      WHERE f.company_id = $1 AND f.tenant_id = $2 AND f.vehicle_id IS NULL
      ORDER BY f.created_at DESC`,
    [company_id, tenant_id]
  );
  return r.rows;
};

// Processos/multas vinculados à empresa (tenant-scoped)
const getCompanyFines = async (company_id, tenant_id) => {
  const r = await pool.query(
    `SELECT f.id,
            f.fine_number AS numero_multa,
            f.plate       AS vehicle_plate,
            f.organ,
            f.stage       AS status,
            f.due_date,
            f.notes,
            f.real_infractor_name,
            f.service_type_id AS service_id,
            f.company_id,
            f.vehicle_id,
            f.protocol_number, f.protocol_date, f.protocol_status, f.protocol_notes, f.protocol_file_url,
            st.code AS service_name,
            v.plate AS vehicle_ref_plate
       FROM fines f
       LEFT JOIN service_types st  ON f.service_type_id = st.id
       LEFT JOIN company_vehicles v ON f.vehicle_id = v.id AND v.tenant_id = f.tenant_id
      WHERE f.company_id = $1 AND f.tenant_id = $2
      ORDER BY f.created_at DESC`,
    [company_id, tenant_id]
  );
  return r.rows;
};

module.exports = {
  createCompany, getAllCompanies, getCompanyById, getCompanyByCnpj,
  updateCompany, setCompanyStatus, countCompanyFines, deleteCompany, getCompanyFines,
  getUnlinkedCompanyFines,
};
