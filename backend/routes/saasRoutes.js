const express = require('express');
const router = express.Router();
const saasModel = require('../models/saasModels');
const auditModel = require('../models/auditModels');
const pool = require('../config/db');
const { requireModule } = require('../middlewares/authorize');

// HISTÓRICO (activity logs) — módulo "history": apenas MASTER (admin/supervisor/
// consultor recebem 403 aqui, além de o item não aparecer no menu).
const requireHistory = requireModule('history');

// ============================================
// ROTAS PÚBLICAS
// ============================================

// GET /api/plans - Listar todos os planos disponíveis
router.get('/plans', async (req, res) => {
  try {
    const plans = await saasModel.getAllPlans();
    res.json({ success: true, data: plans });
  } catch (err) {
    console.error('Erro ao buscar planos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// ROTAS PROTEGIDAS (Admin)
// ============================================

// GET /api/subscription - Buscar assinatura atual
router.get('/subscription', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    // Primeiro tenta assinatura ativa
    let subscription = await saasModel.getActiveSubscription(tenantId);
    
    // Se não tiver, tenta trial
    if (!subscription) {
      subscription = await saasModel.getTrialSubscription(tenantId);
    }
    
    if (!subscription) {
      // Criar trial automaticamente para tenants existentes
      const freePlan = await saasModel.getPlanByName('Free');
      if (freePlan) {
        subscription = await saasModel.createSubscription({
          tenant_id: tenantId,
          plan_id: freePlan.id,
          status: 'trial',
          days_trial: 7
        });
        subscription.plan_name = 'Free';
      }
    }
    
    res.json({ success: true, data: subscription });
  } catch (err) {
    console.error('Erro ao buscar assinatura:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/subscription/limits - Verificar limites do plano
router.get('/subscription/limits/:resource', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { resource } = req.params;
    const { count } = req.query;
    
    const limits = await saasModel.checkPlanLimits(tenantId, resource, parseInt(count) || 0);
    res.json({ success: true, data: limits });
  } catch (err) {
    console.error('Erro ao verificar limites:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/activity - Listar logs de atividades com filtros
router.get('/activity', requireHistory, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 30,
      user_id: req.query.user_id,
      module: req.query.module,
      entity_type: req.query.entity_type,
      action: req.query.action,
      status: req.query.status,
      from: /^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') ? req.query.from : null,
      to: /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '') ? req.query.to : null,
      days: Math.min(Math.max(parseInt(req.query.days, 10) || 0, 0), 3650),
      search: String(req.query.search || '').trim().substring(0, 120),
    };

    const [result, stats] = await Promise.all([
      auditModel.getAuditEvents(tenantId, filters),
      auditModel.getAuditStats(tenantId, filters),
    ]);

    result.stats = stats;
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Erro ao buscar atividades:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/activity/stats - Estatísticas de atividades
router.get('/activity/stats', requireHistory, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { days = 30 } = req.query;
    
    const stats = await auditModel.getAuditStats(tenantId, { days: Math.min(Math.max(parseInt(days, 10) || 30, 1), 3650) });
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('Erro ao buscar estatísticas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/activity/filters - Usuários e valores disponíveis nos filtros.
router.get('/activity/filters', requireHistory, async (req, res) => {
  try {
    const options = await auditModel.getAuditFilterOptions(req.tenantId);
    res.json({ success: true, data: options });
  } catch (err) {
    console.error('Erro ao buscar filtros de auditoria:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/activity/entity/:type/:id - Logs de uma entidade específica
router.get('/activity/entity/:type/:id', requireHistory, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { type, id } = req.params;
    
    const logs = await auditModel.getAuditEventsByEntity(tenantId, type, id);
    res.json({ success: true, data: logs });
  } catch (err) {
    console.error('Erro ao buscar logs da entidade:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// ROTAS DE ADMIN (apenas para usuários admin)
// ============================================

// Middleware para verificar se é admin
const requireAdmin = async (req, res, next) => {
  try {
    const userResult = await pool.query(
      'SELECT role FROM users WHERE id = $1',
      [req.userId]
    );
    
    // Endurecido: rotas cross-tenant antigas agora exigem super_admin (evita vazamento entre tenants)
    if (!userResult.rows[0] || userResult.rows[0].role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Acesso restrito ao painel master' });
    }
    
    next();
  } catch (err) {
    console.error('Erro ao verificar permissões:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/admin/tenants - Listar todas as empresas (apenas admin)
router.get('/admin/tenants', requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    // Buscar tenants com contagem de usuários e planos
    const result = await pool.query(
      `SELECT 
         t.id, t.name, t.email, t.created_at,
         COUNT(DISTINCT u.id) as users_count,
         COALESCE(p.name, 'Nenhum') as plan_name,
         COALESCE(cp.status, 'Nenhum') as subscription_status
       FROM tenants t
       LEFT JOIN users u ON u.tenant_id = t.id
       LEFT JOIN company_plans cp ON cp.tenant_id = t.id AND cp.status = 'active'
       LEFT JOIN plans p ON p.id = cp.plan_id
       GROUP BY t.id, t.name, t.email, t.created_at, p.name, cp.status
       ORDER BY t.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );
    
    // Contar total
    const countResult = await pool.query('SELECT COUNT(*) as total FROM tenants');
    
    res.json({ 
      success: true, 
      data: {
        tenants: result.rows,
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (err) {
    console.error('Erro ao listar tenants:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/tenants/:id - Detalhes de uma empresa
router.get('/admin/tenants/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Buscar tenant
    const tenantResult = await pool.query(
      'SELECT * FROM tenants WHERE id = $1',
      [id]
    );
    
    if (!tenantResult.rows[0]) {
      return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    }
    
    const tenant = tenantResult.rows[0];
    
    // Buscar usuários
    const usersResult = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE tenant_id = $1',
      [id]
    );
    
    // Buscar assinatura
    const subscription = await saasModel.getActiveSubscription(id);
    
    // Estatísticas
    const stats = {
      clients: await pool.query('SELECT COUNT(*) as count FROM clients WHERE tenant_id = $1', [id]),
      contracts: await pool.query('SELECT COUNT(*) as count FROM contracts WHERE tenant_id = $1', [id]),
      leads: await pool.query('SELECT COUNT(*) as count FROM leads WHERE tenant_id = $1', [id])
    };
    
    res.json({ 
      success: true, 
      data: {
        ...tenant,
        users: usersResult.rows,
        subscription,
        stats: {
          clients: parseInt(stats.clients.rows[0].count),
          contracts: parseInt(stats.contracts.rows[0].count),
          leads: parseInt(stats.leads.rows[0].count)
        }
      }
    });
  } catch (err) {
    console.error('Erro ao buscar tenant:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/tenants - Criar nova empresa (e gerar usuário admin)
router.post('/admin/tenants', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { name, email, phone, adminName, adminEmail, adminPassword, planId } = req.body;
    
    await client.query('BEGIN');
    
    // 1. Criar tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, email, phone) VALUES ($1, $2, $3) RETURNING *`,
      [name, email, phone]
    );
    const tenant = tenantResult.rows[0];
    
    // 2. Criar usuário admin
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'master') RETURNING id, name, email, role`,
      [tenant.id, adminName, adminEmail, passwordHash]
    );
    
    // 3. Criar assinatura (se plano especificado)
    if (planId) {
      await client.query(
        `INSERT INTO company_plans (tenant_id, plan_id, status, end_date)
         VALUES ($1, $2, 'active', NOW() + INTERVAL '30 days')`,
        [tenant.id, planId]
      );
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ 
      success: true, 
      data: {
        tenant,
        admin: userResult.rows[0]
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erro ao criar tenant:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/admin/tenants/:id/status - Ativar/desativar empresa
router.patch('/admin/tenants/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;
    
    const result = await pool.query(
      'UPDATE tenants SET is_active = $1 WHERE id = $2 RETURNING *',
      [is_active, id]
    );
    
    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
