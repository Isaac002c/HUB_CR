const pool = require('../config/db');

// ========== COMPANY TARGETS (METAS DA EMPRESA) ==========

// CREATE - Criar ou atualizar meta do mês
const createOrUpdateTarget = async ({ tenant_id, month, year, target_value, user_id = null }) => {
    const result = await pool.query(
        `INSERT INTO company_monthly_targets
           (tenant_id, month_start, amount, created_by, updated_by)
         VALUES ($1, make_date($3, $2, 1), $4, $5, $5)
         ON CONFLICT (tenant_id, month_start)
         DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = NOW()
         RETURNING *, EXTRACT(MONTH FROM month_start)::int AS month,
           EXTRACT(YEAR FROM month_start)::int AS year, amount AS target_value`,
        [tenant_id, month, year, target_value, user_id]
    );
    return result.rows[0];
};

// READ - Buscar meta de um mês específico
const getTargetByMonth = async (tenant_id, month, year) => {
    const result = await pool.query(
        `SELECT *, EXTRACT(MONTH FROM month_start)::int AS month,
                EXTRACT(YEAR FROM month_start)::int AS year, amount AS target_value
           FROM company_monthly_targets
          WHERE tenant_id = $1 AND month_start = make_date($3, $2, 1)`,
        [tenant_id, month, year]
    );
    return result.rows[0];
};

// READ - Buscar todas as metas do ano
const getTargetsByYear = async (tenant_id, year) => {
    const result = await pool.query(
        `SELECT *, EXTRACT(MONTH FROM month_start)::int AS month,
                EXTRACT(YEAR FROM month_start)::int AS year, amount AS target_value
           FROM company_monthly_targets
          WHERE tenant_id = $1 AND EXTRACT(YEAR FROM month_start) = $2
          ORDER BY month_start`,
        [tenant_id, year]
    );
    return result.rows;
};

// READ - Buscar metas do ano atual
const getCurrentYearTargets = async (tenant_id) => {
    const currentYear = new Date().getFullYear();
    const result = await pool.query(
        `SELECT *, EXTRACT(MONTH FROM month_start)::int AS month,
                EXTRACT(YEAR FROM month_start)::int AS year, amount AS target_value
           FROM company_monthly_targets
          WHERE tenant_id = $1 AND EXTRACT(YEAR FROM month_start) = $2
          ORDER BY month_start`,
        [tenant_id, currentYear]
    );
    return result.rows;
};

// ========== LEAD ACTIVITIES (ATIVIDADES) ==========

// CREATE - Criar atividade
const createActivity = async ({ lead_id, tenant_id, type, description, due_date, created_by }) => {
    const result = await pool.query(
        `INSERT INTO lead_activities (lead_id, tenant_id, type, description, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [lead_id, tenant_id, type, description, due_date, created_by]
    );
    return result.rows[0];
};

// READ - Listar atividades de um lead
const getActivitiesByLead = async (lead_id, tenant_id) => {
    const result = await pool.query(
        `SELECT * FROM lead_activities WHERE lead_id = $1 AND tenant_id = $2 
         ORDER BY due_date ASC NULLS LAST, created_at DESC`,
        [lead_id, tenant_id]
    );
    return result.rows;
};

// READ - Listar todas as atividades do tenant
const getAllActivities = async (tenant_id) => {
    const result = await pool.query(
        `SELECT la.*, l.name as lead_name, l.company as lead_company
         FROM lead_activities la
         LEFT JOIN leads l ON la.lead_id = l.id
         WHERE la.tenant_id = $1
         ORDER BY la.due_date ASC NULLS LAST, la.created_at DESC`,
        [tenant_id]
    );
    return result.rows;
};

// READ - Atividades atrasadas (vencidas e não completadas)
const getOverdueActivities = async (tenant_id) => {
    const result = await pool.query(
        `SELECT la.*, l.name as lead_name, l.company as lead_company
         FROM lead_activities la
         LEFT JOIN leads l ON la.lead_id = l.id
         WHERE la.tenant_id = $1 
         AND la.completed = false 
         AND la.due_date < NOW()
         ORDER BY la.due_date ASC`,
        [tenant_id]
    );
    return result.rows;
};

// READ - Próximas atividades (não completadas, próximos 7 dias)
const getUpcomingActivities = async (tenant_id) => {
    const result = await pool.query(
        `SELECT la.*, l.name as lead_name, l.company as lead_company
         FROM lead_activities la
         LEFT JOIN leads l ON la.lead_id = l.id
         WHERE la.tenant_id = $1 
         AND la.completed = false 
         AND (la.due_date BETWEEN NOW() AND NOW() + INTERVAL '7 days')
         ORDER BY la.due_date ASC`,
        [tenant_id]
    );
    return result.rows;
};

// UPDATE - Marcar atividade como completa
const completeActivity = async (id, tenant_id) => {
    const result = await pool.query(
        `UPDATE lead_activities 
         SET completed = true, completed_at = NOW()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [id, tenant_id]
    );
    return result.rows[0];
};

// UPDATE - Atualizar atividade
const updateActivity = async (id, { type, description, due_date, completed }, tenant_id) => {
    const result = await pool.query(
        `UPDATE lead_activities 
         SET type = $1, description = $2, due_date = $3, completed = $4, updated_at = NOW()
         WHERE id = $5 AND tenant_id = $6 RETURNING *`,
        [type, description, due_date, completed, id, tenant_id]
    );
    return result.rows[0];
};

// DELETE - Deletar atividade
const deleteActivity = async (id, tenant_id) => {
    const result = await pool.query(
        'DELETE FROM lead_activities WHERE id = $1 AND tenant_id = $2 RETURNING *',
        [id, tenant_id]
    );
    return result.rows[0];
};

// READ - Leads sem atividade há X dias
const getInactiveLeads = async (tenant_id, days = 7) => {
    const result = await pool.query(
        `SELECT l.*, 
                COALESCE(MAX(la.created_at), l.created_at) as last_activity,
                EXTRACT(DAY FROM NOW() - COALESCE(MAX(la.created_at), l.created_at)) as days_inactive
         FROM leads l
         LEFT JOIN lead_activities la ON l.id = la.lead_id AND la.completed = true
         WHERE l.tenant_id = $1 
         AND l.status NOT IN ('ganho', 'perdido')
         GROUP BY l.id
         HAVING EXTRACT(DAY FROM NOW() - COALESCE(MAX(la.created_at), l.created_at)) >= $2
         ORDER BY days_inactive DESC`,
        [tenant_id, days]
    );
    return result.rows;
};

// READ - Contagem de atividades por status
const getActivityStats = async (tenant_id) => {
    const result = await pool.query(
        `SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN completed = true THEN 1 END) as completed,
            COUNT(CASE WHEN completed = false AND due_date < NOW() THEN 1 END) as overdue,
            COUNT(CASE WHEN completed = false AND due_date >= NOW() AND due_date <= NOW() + INTERVAL '7 days' THEN 1 END) as upcoming
         FROM lead_activities WHERE tenant_id = $1`,
        [tenant_id]
    );
    return result.rows[0];
};

module.exports = {
    // Targets
    createOrUpdateTarget,
    getTargetByMonth,
    getTargetsByYear,
    getCurrentYearTargets,
    // Activities
    createActivity,
    getActivitiesByLead,
    getAllActivities,
    getOverdueActivities,
    getUpcomingActivities,
    completeActivity,
    updateActivity,
    deleteActivity,
    getInactiveLeads,
    getActivityStats
};
