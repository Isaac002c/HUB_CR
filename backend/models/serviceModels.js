const pool = require('../config/db');

const getServicesByClient = async (client_id, tenant_id) => {
  const result = await pool.query(
    `SELECT 
      st.id::text AS id,
      st.code AS name,
      st.label,
      $1::uuid AS client_id,
      $2::text AS tenant_id,
      COUNT(f.id) AS total_fines,
      MAX(f.created_at) AS created_at,
      MAX(f.updated_at) AS updated_at
     FROM service_types st
     INNER JOIN fines f ON f.service_type_id = st.id
       AND f.client_id = $1
       AND f.tenant_id = $2
     GROUP BY st.id, st.code, st.label
     ORDER BY st.id`,
    [client_id, tenant_id]
  );
  return result.rows;
};

const getServiceById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT st.id::text AS id, st.code AS name, st.label
     FROM service_types st WHERE st.id = $1`,
    [id]
  );
  return result.rows[0];
};

const getAllServices = async (tenant_id) => {
  const result = await pool.query(
    `SELECT 
      st.id::text AS id,
      st.code AS name,
      st.label,
      c.id AS client_id,
      c.name AS client_name,
      c.cpf AS client_cpf,
      COUNT(f.id) AS total_fines,
      MAX(f.created_at) AS created_at
     FROM service_types st
     INNER JOIN fines f ON f.service_type_id = st.id AND f.tenant_id = $1
     INNER JOIN clients c ON f.client_id = c.id
     GROUP BY st.id, st.code, st.label, c.id, c.name, c.cpf
     ORDER BY MAX(f.created_at) DESC`,
    [tenant_id]
  );
  return result.rows;
};

const createService = async ({ tenant_id, client_id, name }) => {
  const typeResult = await pool.query(
    `SELECT id FROM service_types WHERE UPPER(code) = UPPER($1)`,
    [name]
  );
  if (!typeResult.rows[0]) throw new Error(`Tipo de serviço "${name}" não encontrado`);
  const service_type_id = typeResult.rows[0].id;
  return { id: service_type_id.toString(), name, client_id, tenant_id };
};

const deleteService = async (id, tenant_id, client_id) => {
  const result = await pool.query(
    `DELETE FROM fines 
     WHERE service_type_id = $1 AND tenant_id = $2 AND client_id = $3 RETURNING *`,
    [id, tenant_id, client_id]
  );
  return result.rows[0];
};

const countServicesByClient = async (client_id, tenant_id) => {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT service_type_id) as total 
     FROM fines WHERE client_id = $1 AND tenant_id = $2`,
    [client_id, tenant_id]
  );
  return result.rows[0].total;
};

const updateService = async () => null;

const getAllServiceTypes = async () => {
  const result = await pool.query(
    'SELECT id::text AS id, code, label FROM service_types ORDER BY id'
  );
  return result.rows;
};

module.exports = {
  createService, getAllServices, getServicesByClient, getServiceById,
  countServicesByClient, updateService, deleteService, getAllServiceTypes
};