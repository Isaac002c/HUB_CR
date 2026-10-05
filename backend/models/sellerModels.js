const pool = require('../config/db');

// ========== SELLERS MODEL ==========

const sellerModel = {
  // Buscar todos os vendedores de um tenant
  async getAll(tenantId) {
    try {
      console.log('[sellerModel] getAll - INPUT tenantId:', tenantId, 'type:', typeof tenantId);
      
      // UUID comparison directly - PostgreSQL handles UUID natively
      const result = await pool.query(
        `SELECT id, tenant_id, name, email, avatar, monthly_target, active, created_at, updated_at
         FROM sellers 
         WHERE tenant_id = $1 
         ORDER BY name ASC`,
        [tenantId]
      );
      
      console.log('[sellerModel] getAll - result:', result.rows.length);
      return result.rows;
    } catch (err) {
      console.error('[sellerModel] getAll error:', err);
      throw err;
    }
  },

  // Buscar vendedor por ID
  async getById(id, tenantId) {
    try {
      console.log('[sellerModel] getById - id:', id, 'tenantId:', tenantId);
      
      const result = await pool.query(
        `SELECT id, tenant_id, name, email, avatar, monthly_target, active, created_at, updated_at
         FROM sellers 
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      console.log('[sellerModel] getById - result:', result.rows.length);
      return result.rows[0];
    } catch (err) {
      console.error('[sellerModel] getById error:', err);
      throw err;
    }
  },

  // Criar vendedor
  async create({ tenant_id, name, email, avatar, monthly_target = 50000 }) {
    try {
      console.log('[sellerModel] create - INPUT tenant_id:', tenant_id, 'type:', typeof tenant_id);
      console.log('[sellerModel] create - INPUT name:', name);
      console.log('[sellerModel] create - INPUT email:', email);
      
      // VALIDAÇÃO CRÍTICA no model também
      if (!tenant_id) {
        console.error('[sellerModel] create - ERRO: tenant_id está vazio ou null!');
        throw new Error('tenant_id é obrigatório para criar um vendedor');
      }
      
      // Gerar avatar automático se não informado
      const finalAvatar = avatar || name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      
      console.log('[sellerModel] create - Executando INSERT com tenant_id:', tenant_id);
      
      const result = await pool.query(
        `INSERT INTO sellers (tenant_id, name, email, avatar, monthly_target, active)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, tenant_id, name, email, avatar, monthly_target, active, created_at, updated_at`,
        [tenant_id, name, email, finalAvatar, monthly_target]
      );
      
      console.log('[sellerModel] create - CREATED:', result.rows[0]);
      return result.rows[0];
    } catch (err) {
      console.error('[sellerModel] create error:', err);
      throw err;
    }
  },

  // Atualizar vendedor
  async update(id, { name, email, avatar, monthly_target, active }, tenantId) {
    try {
      const result = await pool.query(
        `UPDATE sellers 
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             avatar = COALESCE($3, avatar),
             monthly_target = COALESCE($4, monthly_target),
             active = COALESCE($5, active),
             updated_at = NOW()
         WHERE id = $6 AND tenant_id = $7
         RETURNING id, tenant_id, name, email, avatar, monthly_target, active, created_at, updated_at`,
        [name, email, avatar, monthly_target, active, id, tenantId]
      );
      return result.rows[0];
    } catch (err) {
      console.error('[sellerModel] update error:', err);
      throw err;
    }
  },

  // Deletar vendedor
  async delete(id, tenantId) {
    try {
      const result = await pool.query(
        `DELETE FROM sellers WHERE id = $1 AND tenant_id = $2 RETURNING id`,
        [id, tenantId]
      );
      return result.rows[0];
    } catch (err) {
      console.error('[sellerModel] delete error:', err);
      throw err;
    }
  },

  // Buscar métricas de vendedores (para Performance)
  async getSellersWithMetrics(tenantId) {
    try {
      console.log('[sellerModel] getSellersWithMetrics - INPUT tenantId:', tenantId, 'type:', typeof tenantId);
      
      // UUID comparison directly - PostgreSQL handles UUID natively
      const result = await pool.query(
        `SELECT 
          s.id,
          s.tenant_id,
          s.name,
          s.email,
          s.avatar,
          s.monthly_target,
          s.active,
          COUNT(DISTINCT l.id) as total_leads,
          COUNT(DISTINCT CASE WHEN l.status = 'ganho' THEN l.id END) as gained_leads,
          COALESCE(SUM(CASE WHEN l.status = 'ganho' THEN l.value ELSE 0 END), 0) as revenue,
          COUNT(DISTINCT a.id) as total_activities
         FROM sellers s
         LEFT JOIN leads l ON l.seller_id = s.id
         LEFT JOIN lead_activities a ON a.lead_id = l.id
         WHERE s.tenant_id = $1 AND s.active = true
         GROUP BY s.id
         ORDER BY revenue DESC`,
        [tenantId]
      );
      
      console.log('[sellerModel] getSellersWithMetrics - result:', result.rows.length);
      return result.rows;
    } catch (err) {
      console.error('[sellerModel] getSellersWithMetrics error:', err);
      throw err;
    }
  }
};

module.exports = sellerModel;

