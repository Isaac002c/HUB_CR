const pool = require('../config/db');

// ============================================
// DOCUMENTS MODEL - Documentos
// ============================================

// CREATE - Criar novo documento
const createDocument = async ({
  tenant_id, contract_id, client_id, company_id, vehicle_id, file_url, file_name,
  file_type, file_size, category, description, uploaded_by
}) => {
  if (!tenant_id) {
    throw new Error('tenant_id é obrigatório para criar um documento');
  }

  const result = await pool.query(
    `INSERT INTO documents(
      tenant_id, contract_id, client_id, company_id, vehicle_id, file_url, file_name,
      file_type, file_size, category, description, uploaded_by
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [
      tenant_id, contract_id || null, client_id || null, company_id || null, vehicle_id || null,
      file_url, file_name, file_type, file_size, category, description, uploaded_by
    ]
  );

  return result.rows[0];
};

// READ - Listar todos os documentos do tenant
const getAllDocuments = async (tenant_id) => {
  const result = await pool.query(
    `SELECT d.*, c.numero_multa AS contract_number, cl.name as client_name
     FROM documents d
     LEFT JOIN contracts c ON d.contract_id = c.id
     LEFT JOIN clients cl ON d.client_id = cl.id
     WHERE d.tenant_id = $1
     ORDER BY d.uploaded_at DESC`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Buscar documento por ID
const getDocumentById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT d.*, c.numero_multa AS contract_number, cl.name as client_name
     FROM documents d
     LEFT JOIN contracts c ON d.contract_id = c.id
     LEFT JOIN clients cl ON d.client_id = cl.id
     WHERE d.id = $1 AND d.tenant_id = $2`,
    [id, tenant_id]
  );
  return result.rows[0];
};

// READ - Buscar documentos por contrato
const getDocumentsByContract = async (contract_id, tenant_id) => {
  const result = await pool.query(
    `SELECT * FROM documents 
     WHERE contract_id = $1 AND tenant_id = $2
     ORDER BY uploaded_at DESC`,
    [contract_id, tenant_id]
  );
  return result.rows;
};

// READ - Buscar documentos por cliente
const getDocumentsByClient = async (client_id, tenant_id) => {
  const result = await pool.query(
    `SELECT * FROM documents 
     WHERE client_id = $1 AND tenant_id = $2
     ORDER BY uploaded_at DESC`,
    [client_id, tenant_id]
  );
  return result.rows;
};

// READ - Buscar documentos por empresa (tenant-scoped)
const getDocumentsByCompany = async (company_id, tenant_id) => {
  const result = await pool.query(
    `SELECT * FROM documents
     WHERE company_id = $1 AND tenant_id = $2
     ORDER BY uploaded_at DESC`,
    [company_id, tenant_id]
  );
  return result.rows;
};

// READ - Buscar documentos por veículo (tenant-scoped)
const getDocumentsByVehicle = async (vehicle_id, tenant_id) => {
  const result = await pool.query(
    `SELECT * FROM documents
     WHERE vehicle_id = $1 AND tenant_id = $2
     ORDER BY uploaded_at DESC`,
    [vehicle_id, tenant_id]
  );
  return result.rows;
};

// READ - Buscar documentos por categoria
const getDocumentsByCategory = async (tenant_id, category) => {
  const result = await pool.query(
    `SELECT d.*, c.numero_multa AS contract_number, cl.name as client_name
     FROM documents d
     LEFT JOIN contracts c ON d.contract_id = c.id
     LEFT JOIN clients cl ON d.client_id = cl.id
     WHERE d.tenant_id = $1 AND d.category = $2
     ORDER BY d.uploaded_at DESC`,
    [tenant_id, category]
  );
  return result.rows;
};

// READ - Contar documentos
const countDocuments = async (tenant_id) => {
  const result = await pool.query(
    'SELECT COUNT(*) as total FROM documents WHERE tenant_id = $1',
    [tenant_id]
  );
  return result.rows[0].total;
};

// READ - Contar documentos por categoria
const countDocumentsByCategory = async (tenant_id) => {
  const result = await pool.query(
    `SELECT category, COUNT(*) as count
     FROM documents
     WHERE tenant_id = $1
     GROUP BY category`,
    [tenant_id]
  );
  return result.rows;
};

// UPDATE - Atualizar documento
const updateDocument = async (id, { file_url, file_name, file_type, file_size, category, description }, tenant_id) => {
  const result = await pool.query(
    `UPDATE documents 
     SET file_url = $1, file_name = $2, file_type = $3, file_size = $4, category = $5, description = $6
     WHERE id = $7 AND tenant_id = $8 RETURNING *`,
    [file_url, file_name, file_type, file_size, category, description, id, tenant_id]
  );
  return result.rows[0];
};

// READ - Buscar documento por ID SEM JOINs (raw, tenant-scoped, leve).
// Para fluxos que só precisam do registro do documento (ex.: rename), evitando
// os JOINs com contracts/clients de getDocumentById.
const getDocumentByIdRaw = async (id, tenant_id) => {
  const result = await pool.query(
    'SELECT * FROM documents WHERE id = $1 AND tenant_id = $2',
    [id, tenant_id]
  );
  return result.rows[0];
};

// UPDATE - Renomear: atualiza SOMENTE o nome de exibição (file_name).
// Não toca file_url/storage, id, datas, vínculos ou qualquer outro campo. Tenant-scoped.
const renameDocument = async (id, file_name, tenant_id) => {
  const result = await pool.query(
    'UPDATE documents SET file_name = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [file_name, id, tenant_id]
  );
  return result.rows[0];
};

// AUDIT - Registra a renomeação na tabela canônica activity_logs com o schema REAL
// (entity / entity_name / details jsonb). O writer antigo saasModels.createActivityLog
// está quebrado (colunas entity_type/description/metadata não existem), por isso
// inserimos direto. Sempre chamado de forma NÃO-bloqueante (não derruba o rename).
const logDocumentRename = async ({ tenant_id, user_id, document_id, new_name, old_name }) => {
  await pool.query(
    `INSERT INTO activity_logs (tenant_id, user_id, entity, entity_id, entity_name, action, details)
     VALUES ($1, $2, 'document', $3, $4, 'rename', $5::jsonb)`,
    [
      tenant_id, user_id || null, document_id, new_name,
      JSON.stringify({ from: old_name, to: new_name, message: `Documento renomeado de "${old_name}" para "${new_name}"` }),
    ]
  );
};

// DELETE - Deletar documento
const deleteDocument = async (id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM documents WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [id, tenant_id]
  );
  return result.rows[0];
};

module.exports = {
  createDocument,
  getAllDocuments,
  getDocumentById,
  getDocumentsByContract,
  getDocumentsByClient,
  getDocumentsByCompany,
  getDocumentsByVehicle,
  getDocumentsByCategory,
  countDocuments,
  countDocumentsByCategory,
  updateDocument,
  getDocumentByIdRaw,
  renameDocument,
  logDocumentRename,
  deleteDocument
};

