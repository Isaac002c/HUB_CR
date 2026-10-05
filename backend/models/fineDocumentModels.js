const pool = require('../config/db');

// ============================================
// FINE DOCUMENTS MODEL - Documentos das Multas
// ============================================

// CREATE - Criar novo documento
const createFineDocument = async ({ 
  tenant_id, fine_id, name, file_url, file_type, file_size, category, uploaded_by
}) => {
  if (!tenant_id) {
    throw new Error('tenant_id é obrigatório');
  }
  if (!fine_id) {
    throw new Error('fine_id é obrigatório');
  }
  if (!name) {
    throw new Error('nome é obrigatório');
  }
  if (!file_url) {
    throw new Error('URL do arquivo é obrigatória');
  }
  
  const result = await pool.query(
    `INSERT INTO fine_documents(
      tenant_id, fine_id, name, file_url, file_type, file_size, category, uploaded_by
    ) VALUES($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      tenant_id, fine_id, name, file_url, file_type, file_size, category, uploaded_by
    ]
  );
  
  return result.rows[0];
};

// READ - Listar documentos por multa
const getDocumentsByFine = async (fine_id, tenant_id) => {
  const result = await pool.query(
    `SELECT fd.*, u.name as uploaded_by_name
     FROM fine_documents fd
     LEFT JOIN users u ON fd.uploaded_by = u.id
     WHERE fd.fine_id = $1 AND fd.tenant_id = $2
     ORDER BY fd.uploaded_at DESC`,
    [fine_id, tenant_id]
  );
  return result.rows;
};

// READ - Buscar documento por ID
const getDocumentById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT fd.*, u.name as uploaded_by_name
     FROM fine_documents fd
     LEFT JOIN users u ON fd.uploaded_by = u.id
     WHERE fd.id = $1 AND fd.tenant_id = $2`,
    [id, tenant_id]
  );
  return result.rows[0];
};

// READ - Listar documentos por categoria
const getDocumentsByCategory = async (fine_id, category, tenant_id) => {
  const result = await pool.query(
    `SELECT fd.*, u.name as uploaded_by_name
     FROM fine_documents fd
     LEFT JOIN users u ON fd.uploaded_by = u.id
     WHERE fd.fine_id = $1 AND fd.category = $2 AND fd.tenant_id = $3
     ORDER BY fd.uploaded_at DESC`,
    [fine_id, category, tenant_id]
  );
  return result.rows;
};

// READ - Contar documentos por multa
const countDocumentsByFine = async (fine_id, tenant_id) => {
  const result = await pool.query(
    'SELECT COUNT(*) as total FROM fine_documents WHERE fine_id = $1 AND tenant_id = $2',
    [fine_id, tenant_id]
  );
  return result.rows[0].total;
};

// DELETE - Deletar documento
const deleteFineDocument = async (id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM fine_documents WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [id, tenant_id]
  );
  return result.rows[0];
};

// DELETE - Deletar todos os documentos de uma multa
const deleteDocumentsByFine = async (fine_id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM fine_documents WHERE fine_id = $1 AND tenant_id = $2 RETURNING *',
    [fine_id, tenant_id]
  );
  return result.rows;
};

module.exports = {
  createFineDocument,
  getDocumentsByFine,
  getDocumentById,
  getDocumentsByCategory,
  countDocumentsByFine,
  deleteFineDocument,
  deleteDocumentsByFine
};

