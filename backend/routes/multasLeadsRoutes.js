const express = require('express');
const router  = express.Router();
const model   = require('../models/multasLeadModels');
const clientModel = require('../models/clientModels');
const pool    = require('../config/db');
const { requireModule, access } = require('../middlewares/authorize');
const {
  normalizeCPF,
  findCpfConflict,
  cpfConflictMessage,
  isCpfConflictDatabaseError,
} = require('../services/cpfIdentityService');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Módulo Tarefas: master ✅, admin ❌ (403), supervisor (equipe), consultor (dono)
router.use(requireModule('tarefas'));

// Escopo de listagem conforme o role (backend, autoritativo)
const tarefaScope = (req) => {
  const level = access.accessLevel(req.userRole, 'tarefas');
  if (level === 'full') return {};
  if (level === 'team') return req.teamId ? { teamId: req.teamId } : { ownerId: req.userId };
  return { ownerId: req.userId };
};
const canAccessTarefa = (req, item) => {
  const level = access.accessLevel(req.userRole, 'tarefas');
  if (level === 'full') return true;
  if (level === 'own')  return item.created_by === req.userId;
  return item.created_by === req.userId; // supervisor valida via equipe na listagem
};

// Helper: busca nome do usuário logado
async function getUserName(userId) {
  if (!userId) return null;
  try {
    const res = await pool.query('SELECT name FROM users WHERE id = $1', [userId]);
    return res.rows[0]?.name || null;
  } catch { return null; }
}

// Quando um lead entra em "negociação" ou vira "fechado", cria/atualiza uma
// única ficha correspondente em Clientes.
// Best-effort: uma falha aqui NUNCA quebra a atualização do lead (o move do
// Kanban continua funcionando). Como é idempotente, um novo save de "fechado"
// tenta de novo. Respeita o tenant.
async function maybeCreateClientFromLead(lead, tenantId) {
  if (!lead) return;
  try {
    if (['negociacao', 'fechado'].includes(lead.status)) {
      await clientModel.ensureClientFromLead(lead, tenantId, lead.status);
    } else {
      await clientModel.syncLinkedClientStatusFromLead(lead, tenantId);
    }
  } catch (e) {
    console.error('[multas-leads] Falha ao sincronizar cliente do lead:', e.message);
  }
}

// GET /api/multas-leads — lista todos
router.get('/', async (req, res) => {
  try {
    const data = await model.getAllMultasLeads(req.tenantId, tarefaScope(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/multas-leads/stats — contagem por status
router.get('/stats', async (req, res) => {
  try {
    const data = await model.countMultasLeadsByStatus(req.tenantId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/multas-leads/kanban — leads visíveis no kanban (regra 7/30 por stage_changed_at)
router.get('/kanban', async (req, res) => {
  try {
    const data = await model.getKanbanLeads(req.tenantId, tarefaScope(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/multas-leads/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await model.getMultasLeadById(req.params.id, req.tenantId);
    if (!item) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    if (!canAccessTarefa(req, item)) return res.status(403).json({ success: false, error: 'Acesso negado a esta tarefa' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/multas-leads
router.post('/', async (req, res) => {
  try {
    const {
      name, cpf, cnh, first_license_date, birth_date,
      phone, source, status, notes, motivo
    } = req.body;

    const cpfNormalized = cpf ? normalizeCPF(cpf) : null;
    if (cpfNormalized && cpfNormalized.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF deve ter 11 dígitos' });
    }
    if (cpfNormalized) {
      const conflict = await findCpfConflict({ tenantId: req.tenantId, cpf: cpfNormalized });
      if (conflict) {
        return res.status(409).json({ success: false, error: cpfConflictMessage(conflict) });
      }
    }

    // Pega o usuário logado como created_by
    const userId   = req.userId || null;
    const userName = await getUserName(userId);

    const item = await model.createMultasLead({
      tenant_id:         req.tenantId,
      name, cpf: cpfNormalized, cnh,
      first_license_date,
      birth_date,
      phone, source, status, notes, motivo,
      created_by:        userId,
      created_by_name:   userName,
    });
    await maybeCreateClientFromLead(item, req.tenantId);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    if (isCpfConflictDatabaseError(err)) {
      return res.status(409).json({ success: false, error: cpfConflictMessage(null) });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/multas-leads/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await model.getMultasLeadById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    const consultantWasSent = Object.prototype.hasOwnProperty.call(req.body, 'consultant_id');
    const requestedConsultantId = req.body.consultant_id || null;
    const changesConsultant = consultantWasSent && requestedConsultantId !== existing.created_by;
    let requestedConsultant = null;
    if (changesConsultant) {
      const role = String(req.userRole || '').toLowerCase();
      if (!['master', 'supervisor'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Somente o MASTER ou a Supervisão podem alterar o consultor de um lead' });
      }
      if (!requestedConsultantId || !UUID_PATTERN.test(requestedConsultantId)) {
        return res.status(400).json({ success: false, error: 'Selecione um consultor válido' });
      }
      requestedConsultant = await clientModel.getAssignableConsultant(requestedConsultantId, req.tenantId);
      if (!requestedConsultant) {
        return res.status(400).json({ success: false, error: 'Consultor não encontrado ou inativo' });
      }
    }

    const cpfNormalized = req.body.cpf ? normalizeCPF(req.body.cpf) : null;
    if (cpfNormalized && cpfNormalized.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF deve ter 11 dígitos' });
    }
    if (cpfNormalized && cpfNormalized !== normalizeCPF(existing.cpf)) {
      const conflict = await findCpfConflict({
        tenantId: req.tenantId,
        cpf: cpfNormalized,
        excludeLeadId: existing.id,
      });
      if (conflict) {
        return res.status(409).json({ success: false, error: cpfConflictMessage(conflict) });
      }
    }

    const item = await model.updateMultasLead(
      req.params.id,
      {
        ...req.body,
        cpf: cpfNormalized,
        consultant_id: changesConsultant ? requestedConsultantId : undefined,
        consultant_name: changesConsultant ? requestedConsultant.name : undefined,
      },
      req.tenantId
    );
    await maybeCreateClientFromLead(item, req.tenantId);
    res.json({ success: true, data: item });
  } catch (err) {
    if (isCpfConflictDatabaseError(err)) {
      return res.status(409).json({ success: false, error: cpfConflictMessage(null) });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/multas-leads/:id/status — atualiza só o status (Kanban drag)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status é obrigatório' });
    const item = await model.updateMultasLeadStatus(req.params.id, status, req.tenantId);
    if (!item) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    await maybeCreateClientFromLead(item, req.tenantId);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/multas-leads/archive-old — arquiva leads antigos (admin only)
router.post('/archive-old', async (req, res) => {
  if (access.accessLevel(req.userRole, 'tarefas') !== 'full') {
    return res.status(403).json({ success: false, error: 'Apenas master pode arquivar leads' });
  }
  try {
    const archived = await model.archiveOldLeads(req.tenantId);
    res.json({ success: true, data: archived, count: archived.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/multas-leads/:id
router.delete('/:id', async (req, res) => {
  try {
    const item = await model.deleteMultasLead(req.params.id, req.tenantId);
    if (!item) return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
