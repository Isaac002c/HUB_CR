const pool = require('../config/db');

// ============================================
// PERMISSIONS MODEL - Permissões e Roles
// ============================================

// READ - Listar usuários do tenant com informações de role
const getUsersWithRoles = async (tenant_id) => {
  const result = await pool.query(
    `SELECT id, name, email, role, COALESCE(is_active, true) as is_active, created_at, updated_at 
     FROM users 
     WHERE tenant_id = $1 
     ORDER BY name`,
    [tenant_id]
  );
  return result.rows;
};

// READ - Buscar usuário por ID
const getUserById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT id, name, email, role, COALESCE(is_active, true) as is_active, created_at, updated_at 
     FROM users 
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenant_id]
  );
  return result.rows[0];
};

// CREATE - Criar novo usuário
const createUser = async ({ 
  tenant_id, name, email, password, role = 'viewer' 
}) => {
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const result = await pool.query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, name, email, role, is_active, created_at`,
    [tenant_id, name, email, hashedPassword, role]
  );
  return result.rows[0];
};

// UPDATE - Atualizar usuário
const updateUser = async (id, { name, email, role, is_active }, tenant_id) => {
  const updates = [];
  const params = [];
  let paramIndex = 1;
  
  if (name !== undefined) {
    updates.push(`name = $${paramIndex}`);
    params.push(name);
    paramIndex++;
  }
  
  if (email !== undefined) {
    updates.push(`email = $${paramIndex}`);
    params.push(email);
    paramIndex++;
  }
  
  if (role !== undefined) {
    updates.push(`role = $${paramIndex}`);
    params.push(role);
    paramIndex++;
  }
  
  if (is_active !== undefined) {
    updates.push(`is_active = $${paramIndex}`);
    params.push(is_active);
    paramIndex++;
  }
  
  if (updates.length === 0) {
    return null;
  }
  
  updates.push(`updated_at = NOW()`);
  params.push(id, tenant_id);
  
  const query = `
    UPDATE users 
    SET ${updates.join(', ')}
    WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
    RETURNING id, name, email, role, is_active, updated_at
  `;
  
  const result = await pool.query(query, params);
  return result.rows[0];
};

// UPDATE - Atualizar senha
const updateUserPassword = async (id, password, tenant_id) => {
  const bcrypt = require('bcryptjs');
  const hashedPassword = await bcrypt.hash(password, 10);
  
  const result = await pool.query(
    `UPDATE users 
     SET password_hash = $1, updated_at = NOW()
     WHERE id = $2 AND tenant_id = $3
     RETURNING id`,
    [hashedPassword, id, tenant_id]
  );
  return result.rows[0];
};

// DELETE - Deletar usuário
const deleteUser = async (id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenant_id]
  );
  return result.rows[0];
};

// READ - Contar usuários do tenant
const countUsers = async (tenant_id) => {
  const result = await pool.query(
    'SELECT COUNT(*) as total FROM users WHERE tenant_id = $1',
    [tenant_id]
  );
  return parseInt(result.rows[0].total);
};

// READ - Contar usuários ativos
const countActiveUsers = async (tenant_id) => {
  const result = await pool.query(
    'SELECT COUNT(*) as total FROM users WHERE tenant_id = $1 AND is_active = true',
    [tenant_id]
  );
  return parseInt(result.rows[0].total);
};

// READ - Estatísticas de usuários por role
const getUsersStats = async (tenant_id) => {
  const result = await pool.query(
    `SELECT role, COUNT(*) as count, COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
     FROM users 
     WHERE tenant_id = $1
     GROUP BY role`,
    [tenant_id]
  );
  return result.rows;
};

// Verificar se email já existe no tenant
const checkEmailExists = async (email, tenant_id) => {
  const result = await pool.query(
    'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
    [email, tenant_id]
  );
  return result.rows.length > 0;
};

module.exports = {
  getUsersWithRoles,
  getUserById,
  createUser,
  updateUser,
  updateUserPassword,
  deleteUser,
  countUsers,
  countActiveUsers,
  getUsersStats,
  checkEmailExists
};

