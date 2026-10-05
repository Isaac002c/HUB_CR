const express = require('express');
const router = express.Router();
const targetModel = require('../models/targetModels');
const { requireRole } = require('../middlewares/authorize');

// ========== COMPANY TARGETS ROUTES ==========

// GET /api/targets - Buscar metas do ano atual
router.get('/', requireRole('master'), async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const targets = await targetModel.getCurrentYearTargets(tenantId);
        res.json({ success: true, data: targets });
    } catch (err) {
        console.error('Erro ao buscar metas:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/targets/:year - Buscar metas de um ano específico
router.get('/:year(\\d{4})', requireRole('master'), async (req, res) => {
    try {
        const { year } = req.params;
        const tenantId = req.tenantId;
        const targets = await targetModel.getTargetsByYear(tenantId, parseInt(year));
        res.json({ success: true, data: targets });
    } catch (err) {
        console.error('Erro ao buscar metas:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/targets - Criar ou atualizar meta
router.post('/', requireRole('master'), async (req, res) => {
    try {
        const { month, year, target_value } = req.body;
        const tenantId = req.tenantId;
        
        if (!month || !year || target_value === undefined || Number(target_value) < 0) {
            return res.status(400).json({ success: false, error: 'Mês, ano e valor são obrigatórios' });
        }
        
        const target = await targetModel.createOrUpdateTarget({
            tenant_id: tenantId,
            month: parseInt(month),
            year: parseInt(year),
            target_value: parseFloat(target_value),
            user_id: req.userId,
        });
        
        res.status(201).json({ success: true, data: target });
    } catch (err) {
        console.error('Erro ao criar meta:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ========== LEAD ACTIVITIES ROUTES ==========

// GET /api/targets/activities - Listar todas as atividades
router.get('/activities', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const activities = await targetModel.getAllActivities(tenantId);
        res.json({ success: true, data: activities });
    } catch (err) {
        console.error('Erro ao buscar atividades:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/targets/activities/overdue - Atividades atrasadas
router.get('/activities/overdue', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const activities = await targetModel.getOverdueActivities(tenantId);
        res.json({ success: true, data: activities });
    } catch (err) {
        console.error('Erro ao buscar atividades atrasadas:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/targets/activities/upcoming - Próximas atividades
router.get('/activities/upcoming', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const activities = await targetModel.getUpcomingActivities(tenantId);
        res.json({ success: true, data: activities });
    } catch (err) {
        console.error('Erro ao buscar próximas atividades:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/targets/activities/inactive/:days - Leads sem atividade
router.get('/activities/inactive/:days', async (req, res) => {
    try {
        const { days } = req.params;
        const tenantId = req.tenantId;
        const leads = await targetModel.getInactiveLeads(tenantId, parseInt(days) || 7);
        res.json({ success: true, data: leads });
    } catch (err) {
        console.error('Erro ao buscar leads inativos:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/targets/activities/stats - Estatísticas de atividades
router.get('/activities/stats', async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const stats = await targetModel.getActivityStats(tenantId);
        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('Erro ao buscar estatísticas:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/targets/activities/:leadId - Atividades de um lead específico
router.get('/activities/lead/:leadId', async (req, res) => {
    try {
        const { leadId } = req.params;
        const tenantId = req.tenantId;
        const activities = await targetModel.getActivitiesByLead(leadId, tenantId);
        res.json({ success: true, data: activities });
    } catch (err) {
        console.error('Erro ao buscar atividades do lead:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/targets/activities - Criar atividade
router.post('/activities', async (req, res) => {
    try {
        const { lead_id, type, description, due_date } = req.body;
        const tenantId = req.tenantId;
        
        if (!lead_id || !type) {
            return res.status(400).json({ success: false, error: 'Lead e tipo são obrigatórios' });
        }
        
        const activity = await targetModel.createActivity({
            lead_id,
            tenant_id: tenantId,
            type,
            description,
            due_date: due_date || null,
            created_by: null // Em produção, pegaria do auth
        });
        
        res.status(201).json({ success: true, data: activity });
    } catch (err) {
        console.error('Erro ao criar atividade:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/targets/activities/:id/complete - Marcar como completa
router.put('/activities/:id/complete', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        
        const activity = await targetModel.completeActivity(id, tenantId);
        
        if (!activity) {
            return res.status(404).json({ success: false, error: 'Atividade não encontrada' });
        }
        
        res.json({ success: true, data: activity });
    } catch (err) {
        console.error('Erro ao completar atividade:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/targets/activities/:id - Atualizar atividade
router.put('/activities/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { type, description, due_date, completed } = req.body;
        const tenantId = req.tenantId;
        
        const activity = await targetModel.updateActivity(id, {
            type,
            description,
            due_date,
            completed
        }, tenantId);
        
        if (!activity) {
            return res.status(404).json({ success: false, error: 'Atividade não encontrada' });
        }
        
        res.json({ success: true, data: activity });
    } catch (err) {
        console.error('Erro ao atualizar atividade:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/targets/activities/:id - Deletar atividade
router.delete('/activities/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const tenantId = req.tenantId;
        
        const activity = await targetModel.deleteActivity(id, tenantId);
        
        if (!activity) {
            return res.status(404).json({ success: false, error: 'Atividade não encontrada' });
        }
        
        res.json({ success: true, data: activity, message: 'Atividade deletada com sucesso' });
    } catch (err) {
        console.error('Erro ao deletar atividade:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
