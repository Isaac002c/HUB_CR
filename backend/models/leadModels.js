const pool = require('../config/db');

// Helper function to build WHERE clause based on filter
// Escopos (RBAC):
//   filter.tenantId   → sempre (isolamento multi-tenant)
//   filter.createdBy  → consultor: só o que ELE criou (created_by = user)
//   filter.teamId     → supervisor: leads de quem está na equipe
//   filter.sellerId   → legado (tabela sellers)
const buildWhereClause = (filter) => {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  // Always filter by tenant
  if (filter.tenantId) {
    conditions.push(`tenant_id = $${paramIndex}`);
    params.push(filter.tenantId);
    paramIndex++;
  }

  // Consultor: dono do registro
  if (filter.createdBy) {
    conditions.push(`created_by = $${paramIndex}`);
    params.push(filter.createdBy);
    paramIndex++;
  }

  // Supervisor: escopo de equipe (dono pertence à equipe)
  if (filter.teamId) {
    conditions.push(`created_by IN (SELECT id FROM users WHERE tenant_id = $1 AND team_id = $${paramIndex})`);
    params.push(filter.teamId);
    paramIndex++;
  }

  // Legado (tabela sellers)
  if (filter.sellerId) {
    conditions.push(`seller_id = $${paramIndex}`);
    params.push(filter.sellerId);
    paramIndex++;
  }

  if (conditions.length === 0) {
    return { clause: '', params };
  }

  return {
    clause: 'WHERE ' + conditions.join(' AND '),
    params
  };
};

// CREATE - Criar novo lead
const createLead = async ({ name, email, phone, company, value, status, source, stage, tenant_id, seller_id, created_by }) => {
    // DEBUG: Log para identificar o problema
    console.log('[leadModels] createLead - dados recebidos:');
    console.log('  - name:', name);
    console.log('  - email:', email);
    console.log('  - tenant_id:', tenant_id, '(tipo:', typeof tenant_id, ')');
    console.log('  - seller_id:', seller_id);
    
    if (!tenant_id) {
        console.error('[leadModels] ERRO CRÍTICO: tenant_id está undefined ou null!');
        console.error('[leadModels] Dados completos:', { name, email, phone, company, value, status, source, stage, tenant_id, seller_id });
        throw new Error('tenant_id é obrigatório para criar um lead');
    }
    
    const result = await pool.query(
        `INSERT INTO leads(name, email, phone, company, value, status, source, stage, tenant_id, seller_id, created_by)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [name, email, phone, company, value || 0, status || 'novo', source, stage || 'lead', tenant_id, seller_id || null, created_by || null]
    );
    
    console.log('[leadModels] Lead criado com sucesso:', result.rows[0].id);
    return result.rows[0];
};

// READ - Listar todos os leads do tenant (com filtro)
const getLeadsByFilter = async (filter) => {
    const { clause, params } = buildWhereClause(filter);
    const result = await pool.query(
        `SELECT * FROM leads ${clause} ORDER BY created_at DESC`,
        params
    );
    return result.rows;
};

// READ - Listar todos os leads do tenant (legacy - para compatibilidade)
const getAllLeads = async (tenant_id) => {
    const result = await pool.query(
        'SELECT * FROM leads WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenant_id]
    );
    return result.rows;
};

// READ - Buscar lead por ID
const getLeadById = async (id, tenant_id) => {
    const result = await pool.query(
        'SELECT * FROM leads WHERE id = $1 AND tenant_id = $2',
        [id, tenant_id]
    );
    return result.rows[0];
};

// UPDATE - Atualizar lead
const updateLead = async (id, { name, email, phone, company, value, status, source, stage, seller_id }, tenant_id) => {
    const result = await pool.query(
        `UPDATE leads 
         SET name = $1, email = $2, phone = $3, company = $4, value = $5, status = $6, source = $7, stage = $8, seller_id = $9, updated_at = NOW()
         WHERE id = $10 AND tenant_id = $11 RETURNING *`,
        [name, email, phone, company, value, status, source, stage || 'lead', seller_id, id, tenant_id]
    );
    return result.rows[0];
};

// DELETE - Deletar lead
const deleteLead = async (id, tenant_id) => {
    const result = await pool.query(
        'DELETE FROM leads WHERE id = $1 AND tenant_id = $2 RETURNING *',
        [id, tenant_id]
    );
    return result.rows[0];
};

// READ - Contar leads por status (com filtro)
const getLeadsCountByStatus = async (filter) => {
    const { clause, params } = buildWhereClause(filter);
    const result = await pool.query(
        `SELECT status, COUNT(*) as count, SUM(COALESCE(value, 0)) as total_value
         FROM leads ${clause} 
         GROUP BY status`,
        params
    );
    return result.rows;
};

// READ - Contar leads por origem (com filtro)
const getLeadsCountBySource = async (filter) => {
    const { clause, params } = buildWhereClause(filter);
    const result = await pool.query(
        `SELECT source, COUNT(*) as count, SUM(COALESCE(value, 0)) as total_value
         FROM leads ${clause} 
         GROUP BY source`,
        params
    );
    return result.rows;
};

// READ - Métricas financeiras do pipeline (com filtro)
const getPipelineMetrics = async (filter) => {
    const { clause, params } = buildWhereClause(filter);
    const result = await pool.query(
        `SELECT 
            COUNT(*) as total_leads,
            SUM(COALESCE(value, 0)) as total_pipeline_value,
            COUNT(CASE WHEN status = 'ganho' THEN 1 END) as gained_leads,
            SUM(CASE WHEN status = 'ganho' THEN COALESCE(value, 0) END) as total_revenue,
            COUNT(CASE WHEN status = 'novo' THEN 1 END) as new_leads,
            COUNT(CASE WHEN status = 'contactado' THEN 1 END) as contacted_leads,
            COUNT(CASE WHEN status = 'qualificado' THEN 1 END) as qualified_leads,
            COUNT(CASE WHEN status = 'proposta' THEN 1 END) as proposal_leads,
            COUNT(CASE WHEN status = 'negociacao' THEN 1 END) as negotiation_leads
         FROM leads ${clause} AND status NOT IN ('ganho', 'perdido')`,
        params
    );
    return result.rows[0];
};

// READ - Métricas mensais (para histórico) (com filtro)
const getMonthlyMetrics = async (filter, months = 12) => {
    const { clause, params } = buildWhereClause(filter);
    const result = await pool.query(
        `SELECT 
            TO_CHAR(created_at, 'YYYY-MM') as month,
            COUNT(*) as total_leads,
            COUNT(CASE WHEN status = 'ganho' THEN 1 END) as gained_leads,
            SUM(CASE WHEN status = 'ganho' THEN COALESCE(value, 0) END) as revenue,
            SUM(COALESCE(value, 0)) as pipeline_value
         FROM leads ${clause} AND created_at >= NOW() - INTERVAL '${months} months'
         GROUP BY TO_CHAR(created_at, 'YYYY-MM')
         ORDER BY month ASC`,
        params
    );
    return result.rows;
};

// READ - Leads inativos (sem atividade há X dias) (com filtro)
const getInactiveLeads = async (filter, days = 7) => {
    const { clause, params } = buildWhereClause(filter);
    const result = await pool.query(
        `SELECT 
            l.*,
            MAX(la.created_at) as last_activity,
            EXTRACT(DAY FROM NOW() - MAX(la.created_at)) as days_inactive
         FROM leads l
         LEFT JOIN lead_activities la ON l.id = la.lead_id
         ${clause}
         GROUP BY l.id
         HAVING MAX(la.created_at) IS NULL OR EXTRACT(DAY FROM NOW() - MAX(la.created_at)) > $${params.length + 1}
         ORDER BY days_inactive DESC
         LIMIT 20`,
        [...params, days]
    );
    return result.rows;
};

module.exports = {
    createLead,
    getLeadsByFilter,
    getAllLeads,
    getLeadById,
    updateLead,
    deleteLead,
    getLeadsCountByStatus,
    getLeadsCountBySource,
    getPipelineMetrics,
    getMonthlyMetrics,
    getInactiveLeads
};

