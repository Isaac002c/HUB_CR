const pool = require('../config/db');

async function createAuditEvent({
  tenant_id, user_id = null, action, module = 'sistema', entity = null,
  entity_id = null, entity_name = null, description, method = null, path = null,
  status_code = null, success = true, ip_address = null, user_agent = null,
  metadata = {}, source = 'automatic',
}) {
  const result = await pool.query(
    `INSERT INTO audit_events (
       tenant_id, user_id, action, module, entity, entity_id, entity_name,
       description, method, path, status_code, success, ip_address, user_agent,
       metadata, source
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13, $14,
       $15::jsonb, $16
     ) RETURNING *`,
    [tenant_id, user_id, action, module, entity, entity_id ? String(entity_id) : null,
      entity_name, description, method, path, status_code, success, ip_address,
      user_agent, JSON.stringify(metadata || {}), source]
  );
  return result.rows[0];
}

function appendFilters(filters, params, { eventAlias = 'ae', userAlias = 'u' } = {}) {
  const clauses = [`${eventAlias}.tenant_id = $1`];
  const add = (sql, value) => {
    params.push(value);
    clauses.push(sql.replace('?', `$${params.length}`));
  };

  if (filters.user_id) add(`${eventAlias}.user_id = ?`, filters.user_id);
  if (filters.module) add(`${eventAlias}.module = ?`, filters.module);
  if (filters.action) add(`${eventAlias}.action = ?`, filters.action);
  if (filters.entity_type) add(`${eventAlias}.entity = ?`, filters.entity_type);
  if (filters.status === 'success') clauses.push(`${eventAlias}.success = true`);
  if (filters.status === 'failed') clauses.push(`${eventAlias}.success = false`);
  if (filters.from) add(`${eventAlias}.created_at >= ?::date`, filters.from);
  if (filters.to) add(`${eventAlias}.created_at < (?::date + INTERVAL '1 day')`, filters.to);
  if (!filters.from && !filters.to && filters.days) {
    add(`${eventAlias}.created_at >= NOW() - (?::int * INTERVAL '1 day')`, filters.days);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const ref = `$${params.length}`;
    clauses.push(`(
      ${eventAlias}.description ILIKE ${ref}
      OR COALESCE(${eventAlias}.entity_name, '') ILIKE ${ref}
      OR COALESCE(${eventAlias}.entity_id, '') ILIKE ${ref}
      OR COALESCE(${userAlias}.name, '') ILIKE ${ref}
      OR COALESCE(${userAlias}.email, '') ILIKE ${ref}
      OR ${eventAlias}.metadata::text ILIKE ${ref}
    )`);
  }
  return clauses.join(' AND ');
}

async function getAuditEvents(tenantId, filters = {}) {
  const page = Math.max(parseInt(filters.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 30, 1), 100);
  const params = [tenantId];
  const where = appendFilters(filters, params);
  const countParams = [...params];
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.user_id
      WHERE ${where}`,
    countParams
  );
  params.push(limit, offset);
  const result = await pool.query(
    `SELECT ae.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.user_id
      WHERE ${where}
      ORDER BY ae.created_at DESC, ae.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const total = countResult.rows[0]?.total || 0;
  return { logs: result.rows, total, page, limit, totalPages: Math.max(Math.ceil(total / limit), 1) };
}

async function getAuditStats(tenantId, filters = {}) {
  const params = [tenantId];
  const where = appendFilters(filters, params);
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE ae.success)::int AS successful,
       COUNT(*) FILTER (WHERE NOT ae.success)::int AS failed,
       COUNT(DISTINCT ae.user_id)::int AS active_users
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.user_id
     WHERE ${where}`,
    params
  );
  return result.rows[0] || { total: 0, successful: 0, failed: 0, active_users: 0 };
}

async function getAuditFilterOptions(tenantId) {
  const [users, values] = await Promise.all([
    pool.query(
      `SELECT id, name, email, role, COALESCE(is_active, true) AS is_active
         FROM users WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId]
    ),
    pool.query(
      `SELECT
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT module ORDER BY module), NULL) AS modules,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT action ORDER BY action), NULL) AS actions,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT entity ORDER BY entity), NULL) AS entities
       FROM audit_events WHERE tenant_id = $1`,
      [tenantId]
    ),
  ]);
  return {
    users: users.rows,
    modules: values.rows[0]?.modules || [],
    actions: values.rows[0]?.actions || [],
    entities: values.rows[0]?.entities || [],
  };
}

async function getAuditEventsByEntity(tenantId, entity, entityId) {
  const result = await pool.query(
    `SELECT ae.*, u.name AS user_name, u.email AS user_email, u.role AS user_role
       FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.user_id
      WHERE ae.tenant_id = $1 AND ae.entity = $2 AND ae.entity_id = $3
      ORDER BY ae.created_at DESC`,
    [tenantId, entity, String(entityId)]
  );
  return result.rows;
}

module.exports = {
  createAuditEvent,
  getAuditEvents,
  getAuditStats,
  getAuditFilterOptions,
  getAuditEventsByEntity,
};
