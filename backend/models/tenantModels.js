const pool = require('../config/db');

const createTenant = async (name) => {
    const result = await pool.query(
        'INSERT INTO tenants(name) VALUES($1) RETURNING *',
        [name]
    );
    return result.rows[0];
};

const getAllTenants = async () => {
    const result = await pool.query('SELECT * FROM tenants');
    return result.rows;
};

module.exports = {
    createTenant,
    getAllTenants,
};
