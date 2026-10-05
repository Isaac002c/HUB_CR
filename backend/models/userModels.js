const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const createUser = async ({ name, email, password, tenant_id, role = 'seller' }) => {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
        'INSERT INTO users(name, email, password_hash, tenant_id, role) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [name, email, hashedPassword, tenant_id, role]
    );
    return result.rows[0];
};

const getUserByEmail = async (email) => {
    const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
    return result.rows[0];
};

// Atualizar role do usuário
const updateUserRole = async (userId, role) => {
    const result = await pool.query(
        'UPDATE users SET role = $1 WHERE id = $2 RETURNING *',
        [role, userId]
    );
    return result.rows[0];
};

// Atualizar seller_id do usuário
const updateUserSeller = async (userId, sellerId) => {
    const result = await pool.query(
        'UPDATE users SET seller_id = $1 WHERE id = $2 RETURNING *',
        [sellerId, userId]
    );
    return result.rows[0];
};

// Buscar usuários por tenant
const getUsersByTenant = async (tenantId) => {
    const result = await pool.query(
        'SELECT id, name, email, role, seller_id, created_at FROM users WHERE tenant_id = $1 ORDER BY name',
        [tenantId]
    );
    return result.rows;
};

module.exports = {
    createUser,
    getUserByEmail,
    updateUserRole,
    updateUserSeller,
    getUsersByTenant
};
