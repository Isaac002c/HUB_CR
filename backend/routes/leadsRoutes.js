const express = require('express');
const router = express.Router();
const leadModel = require('../models/leadModels');
const { requireModule, access } = require('../middlewares/authorize');

// Módulo Leads: master ✅, admin ❌ (403), supervisor (equipe), consultor (dono)
router.use(requireModule('leads'));

// Constrói o filtro de leads conforme o ESCOPO do role (backend, autoritativo).
const leadScopeFilter = (req) => {
  const level = access.accessLevel(req.userRole, 'leads'); // full | team | own
  if (level === 'full') return { tenantId: req.tenantId };
  if (level === 'team') {
    return req.teamId
      ? { tenantId: req.tenantId, teamId: req.teamId }
      : { tenantId: req.tenantId, createdBy: req.userId }; // supervisor sem equipe → só dele
  }
  // own (consultor)
  return { tenantId: req.tenantId, createdBy: req.userId };
};

// Verdadeiro se o usuário pode acessar um lead específico (dono/equipe/full)
const canAccessLead = (req, lead) => {
  const level = access.accessLevel(req.userRole, 'leads');
  if (level === 'full') return true;
  if (level === 'own') return lead.created_by === req.userId;
  // team: dono na mesma equipe — validação simples pelo próprio dono ou equipe
  return lead.created_by === req.userId || (!!req.teamId && lead.team_scope === true);
};

// GET /api/leads - Listar todos os leads do tenant (filtrado por role)
router.get('/', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userRole = req.userRole || 'seller';
        const sellerId = req.sellerId;
        
        console.log('[leadsRoutes] GET / - tenantId:', tenantId, 'role:', userRole, 'sellerId:', sellerId);
        
        const filter = leadScopeFilter(req);
        const leads = await leadModel.getLeadsByFilter(filter);
        
        res.json({ success: true, data: leads, meta: { role: userRole } });
    } catch (err) {
        console.error('Erro ao buscar leads:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/leads/stats - Métricas de leads (filtrado por role)
router.get('/stats', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userRole = req.userRole || 'seller';
        const sellerId = req.sellerId;
        
        const filter = leadScopeFilter(req);
        
        const byStatus = await leadModel.getLeadsCountByStatus(filter);
        const bySource = await leadModel.getLeadsCountBySource(filter);
        const allLeads = await leadModel.getLeadsByFilter(filter);
        
        res.json({
            success: true,
            data: {
                total: allLeads.length,
                byStatus,
                bySource
            },
            meta: { role: userRole }
        });
    } catch (err) {
        console.error('Erro ao buscar stats:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/leads/pipeline - Métricas financeiras do pipeline (filtrado por role)
router.get('/pipeline', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userRole = req.userRole || 'seller';
        const sellerId = req.sellerId;
        
        const filter = leadScopeFilter(req);
        const metrics = await leadModel.getPipelineMetrics(filter);
        
        res.json({ success: true, data: metrics, meta: { role: userRole } });
    } catch (err) {
        console.error('Erro ao buscar pipeline:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/leads/monthly - Métricas mensais (histórico) (filtrado por role)
router.get('/monthly', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userRole = req.userRole || 'seller';
        const sellerId = req.sellerId;
        const months = parseInt(req.query.months) || 12;
        
        const filter = leadScopeFilter(req);
        const metrics = await leadModel.getMonthlyMetrics(filter, months);
        
        res.json({ success: true, data: metrics, meta: { role: userRole } });
    } catch (err) {
        console.error('Erro ao buscar métricas mensais:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/leads/inactive - Leads inativos (filtrado por role)
router.get('/inactive/:days', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userRole = req.userRole || 'seller';
        const sellerId = req.sellerId;
        const days = parseInt(req.params.days) || 7;
        
        const filter = leadScopeFilter(req);
        const inactiveLeads = await leadModel.getInactiveLeads(filter, days);
        
        res.json({ success: true, data: inactiveLeads });
    } catch (err) {
        console.error('Erro ao buscar leads inativos:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/leads/:id - Buscar lead por ID (filtrado por role)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        const userRole = req.userRole || 'seller';
        const sellerId = req.sellerId;
        
        const lead = await leadModel.getLeadById(id, tenantId);
        
        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        }

        // Consultor só acessa o que criou; supervisor só a equipe (backend, autoritativo)
        if (!canAccessLead(req, lead)) {
            return res.status(403).json({ success: false, error: 'Acesso negado a este lead' });
        }

        res.json({ success: true, data: lead });
    } catch (err) {
        console.error('Erro ao buscar lead:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/leads - Criar novo lead
router.post('/', async (req, res) => {
    try {
        const { name, email, phone, company, value, status, source, stage, seller_id } = req.body;
        const tenantId = req.tenantId;
        
        // DEBUG: Log para rastrear tenant_id
        console.log('[leadsRoutes] POST / - tenantId:', tenantId, 'type:', typeof tenantId);
        console.log('[leadsRoutes] body:', JSON.stringify(req.body));
        
        if (!tenantId) {
            console.error('[leadsRoutes] ERRO: tenantId não encontrado em req.tenantId!');
            return res.status(401).json({ success: false, error: 'Tenant não identificado. Faça login novamente.' });
        }
        
        if (!name || !email) {
            return res.status(400).json({ success: false, error: 'Nome e email são obrigatórios' });
        }
        
        // Dono do registro = usuário autenticado (regra de ownership do Consultor)
        const userRole = req.userRole || 'seller';
        const assignedSellerId = userRole === 'seller' ? (req.sellerId || null) : (seller_id || null);

        const lead = await leadModel.createLead({
            name,
            email,
            phone,
            company,
            value: value || 0,
            status,
            source,
            stage: stage || 'lead',
            tenant_id: tenantId,
            seller_id: assignedSellerId,
            created_by: req.userId
        });

        res.status(201).json({ success: true, data: lead });
    } catch (err) {
        console.error('Erro ao criar lead:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/leads/:id - Atualizar lead
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, company, value, status, source, stage, seller_id } = req.body;
        const tenantId = req.tenantId;
        const userRole = req.userRole || 'seller';
        const sellerId = req.sellerId;
        
        // Verificar se o lead existe e se o seller tem acesso
        const existingLead = await leadModel.getLeadById(id, tenantId);
        
        if (!existingLead) {
            return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        }

        // Consultor só edita o que criou; supervisor só a equipe
        if (!canAccessLead(req, existingLead)) {
            return res.status(403).json({ success: false, error: 'Acesso negado a este lead' });
        }

        const lead = await leadModel.updateLead(id, {
            name,
            email,
            phone,
            company,
            value: value || 0,
            status,
            source,
            stage: stage || 'lead',
            seller_id: seller_id || null
        }, tenantId);
        
        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        }
        
        res.json({ success: true, data: lead });
    } catch (err) {
        console.error('Erro ao atualizar lead:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/leads/:id - Deletar lead
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;

        // Exclusão exige acesso ao lead (dono/equipe/master). ADM já é 403 no módulo.
        const existingLead = await leadModel.getLeadById(id, tenantId);
        if (!existingLead) {
            return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        }
        if (!canAccessLead(req, existingLead)) {
            return res.status(403).json({ success: false, error: 'Acesso negado a este lead' });
        }

        const lead = await leadModel.deleteLead(id, tenantId);
        
        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead não encontrado' });
        }
        
        res.json({ success: true, data: lead, message: 'Lead deletado com sucesso' });
    } catch (err) {
        console.error('Erro ao deletar lead:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
