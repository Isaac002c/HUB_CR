const pool = require('../config/db');

// ============================================
// PLANS MODEL - Planos de Assinatura
// ============================================

// READ - Listar todos os planos ativos
const getAllPlans = async () => {
  const result = await pool.query(
    'SELECT * FROM plans WHERE is_active = true ORDER BY monthly_price ASC'
  );
  return result.rows;
};

// READ - Buscar plano por ID
const getPlanById = async (id) => {
  const result = await pool.query(
    'SELECT * FROM plans WHERE id = $1',
    [id]
  );
  return result.rows[0];
};

// READ - Buscar plano por nome
const getPlanByName = async (name) => {
  const result = await pool.query(
    'SELECT * FROM plans WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0];
};

// ============================================
// COMPANY PLANS MODEL - Assinaturas
// ============================================

// READ - Buscar assinatura ativa de uma empresa
const getActiveSubscription = async (tenant_id) => {
  const result = await pool.query(
    `SELECT cp.*, p.name as plan_name, p.features, p.monthly_price, p.yearly_price
     FROM company_plans cp
     JOIN plans p ON cp.plan_id = p.id
     WHERE cp.tenant_id = $1 AND cp.status = 'active'
     ORDER BY cp.created_at DESC
     LIMIT 1`,
    [tenant_id]
  );
  return result.rows[0];
};

// READ - Buscar assinatura com trial
const getTrialSubscription = async (tenant_id) => {
  const result = await pool.query(
    `SELECT cp.*, p.name as plan_name, p.features
     FROM company_plans cp
     JOIN plans p ON cp.plan_id = p.id
     WHERE cp.tenant_id = $1 AND cp.status = 'trial'
     ORDER BY cp.created_at DESC
     LIMIT 1`,
    [tenant_id]
  );
  return result.rows[0];
};

// CREATE - Criar assinatura (novo tenant)
const createSubscription = async ({ tenant_id, plan_id, status = 'trial', days_trial = 7 }) => {
  const result = await pool.query(
    `INSERT INTO company_plans (tenant_id, plan_id, status, end_date)
     VALUES ($1, $2, $3, NOW() + INTERVAL '1 day' * $4)
     RETURNING *`,
    [tenant_id, plan_id, status, days_trial]
  );
  return result.rows[0];
};

// UPDATE - Atualizar status da assinatura
const updateSubscriptionStatus = async (id, status) => {
  const result = await pool.query(
    `UPDATE company_plans 
     SET status = $1, updated_at = NOW() 
     WHERE id = $2 
     RETURNING *`,
    [status, id]
  );
  return result.rows[0];
};

// UPDATE - Upgrade/Downgrade de plano
const changePlan = async (tenant_id, plan_id) => {
  const result = await pool.query(
    `UPDATE company_plans 
     SET plan_id = $1, updated_at = NOW() 
     WHERE tenant_id = $2 AND status = 'active'
     RETURNING *`,
    [plan_id, tenant_id]
  );
  return result.rows[0];
};

// READ - Verificar uso vs limite do plano
const checkPlanLimits = async (tenant_id, resource, currentCount) => {
  const subscription = await getActiveSubscription(tenant_id);
  
  if (!subscription) {
    return { allowed: false, reason: 'Sem assinatura ativa' };
  }
  
  const features = subscription.features || {};
  
  // Verificar limite específico
  let limit = 0;
  switch (resource) {
    case 'clients':
      limit = subscription.max_clients || 0;
      break;
    case 'contracts':
      limit = subscription.max_contracts || 0;
      break;
    case 'users':
      limit = subscription.max_users || 1;
      break;
    default:
      return { allowed: true };
  }
  
  // 0 significa ilimitado
  if (limit === 0) {
    return { allowed: true, limit: 'ilimitado' };
  }
  
  return {
    allowed: currentCount < limit,
    current: currentCount,
    limit: limit,
    remaining: Math.max(0, limit - currentCount)
  };
};

// ============================================
// ACTIVITY LOGS MODEL - Logs de Atividades
// ============================================

// CREATE - Criar log de atividade
const createActivityLog = async ({
  tenant_id, user_id, action, entity_type, entity_id, entity_name = null, description, metadata = {}, ip_address
}) => {
  // Schema real da tabela activity_logs: entity, entity_id, entity_name, action, details(jsonb).
  // (As colunas entity_type/description/metadata/ip_address NÃO existem nesta base.)
  // Mapeamos para não quebrar e preservar a informação: details = metadata + message + ip.
  const details = { ...(metadata || {}) };
  if (description) details.message = description;
  if (ip_address) details.ip_address = ip_address;
  const result = await pool.query(
    `INSERT INTO activity_logs
     (tenant_id, user_id, entity, entity_id, entity_name, action, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [tenant_id, user_id || null, entity_type || null, entity_id || null, entity_name, action || null, JSON.stringify(details)]
  );
  return result.rows[0];
};

// READ - Listar logs de atividades (com paginação)
const getActivityLogs = async (tenant_id, filters = {}) => {
  const { page = 1, limit = 50, entity_type, action, days } = filters;
  const offset = (page - 1) * limit;
  
  let query = `
    SELECT al.*, al.entity AS entity_type, u.name as user_name, u.email as user_email
    FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.tenant_id = $1
  `;
  let countQuery = 'SELECT COUNT(*) as total FROM activity_logs WHERE tenant_id = $1';
  let params = [tenant_id];
  let paramIndex = 2;
  
  if (entity_type) {
    query += ` AND al.entity = $${paramIndex}`;
    countQuery += ` AND entity = $${paramIndex}`;
    params.push(entity_type);
    paramIndex++;
  }
  
  if (action) {
    query += ` AND al.action = $${paramIndex}`;
    countQuery += ` AND action = $${paramIndex}`;
    params.push(action);
    paramIndex++;
  }
  
  if (days) {
    query += ` AND al.created_at >= NOW() - INTERVAL '${days} days'`;
    countQuery += ` AND created_at >= NOW() - INTERVAL '${days} days'`;
  }
  
  query += `
    ORDER BY al.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  params.push(limit, offset);
  
  const result = await pool.query(query, params);
  
  // Contar total
  const countResult = await pool.query(countQuery, params.slice(0, -2));
  
  return {
    logs: result.rows,
    total: parseInt(countResult.rows[0].total),
    page,
    limit,
    totalPages: Math.ceil(parseInt(countResult.rows[0].total) / limit)
  };
};

// READ - Buscar logs por entidade
const getActivityLogsByEntity = async (tenant_id, entity_type, entity_id) => {
  const result = await pool.query(
    `SELECT al.*, al.entity AS entity_type, u.name as user_name
     FROM activity_logs al
     LEFT JOIN users u ON al.user_id = u.id
     WHERE al.tenant_id = $1 AND al.entity = $2 AND al.entity_id = $3
     ORDER BY al.created_at DESC`,
    [tenant_id, entity_type, entity_id]
  );
  return result.rows;
};

// READ - Estatísticas de atividades
const getActivityStats = async (tenant_id, days = 30) => {
  const result = await pool.query(
    `SELECT 
       action,
       COUNT(*) as count
     FROM activity_logs
     WHERE tenant_id = $1 
       AND created_at >= NOW() - INTERVAL '1 day' * $2
     GROUP BY action
     ORDER BY count DESC`,
    [tenant_id, days]
  );
  return result.rows;
};

module.exports = {
  // Plans
  getAllPlans,
  getPlanById,
  getPlanByName,
  // Company Plans
  getActiveSubscription,
  getTrialSubscription,
  createSubscription,
  updateSubscriptionStatus,
  changePlan,
  checkPlanLimits,
  // Activity Logs
  createActivityLog,
  getActivityLogs,
  getActivityLogsByEntity,
  getActivityStats
};

