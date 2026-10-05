const express = require('express');
const router  = express.Router();
const model   = require('../models/calendarEventModels');

const VALID_STATUS = ['agendado', 'concluido', 'cancelado'];

const fmtT = (t) => (t ? String(t).substring(0, 5) : null);

// Bloqueio de salvamento (tenant inteiro). Dois fluxos:
//  - BLOQUEIO (type='bloqueio'): não pode sobrepor outro bloqueio nem conflitar com evento existente.
//  - EVENTO normal: barrado por dia fechado (bloqueio integral), bloqueio parcial sobreposto
//    ou conflito de horário com outro evento.
async function blockedReason(tenantId, body, excludeId = null) {
  const isBlock = (body.type || 'outro') === 'bloqueio';

  if (isBlock) {
    if (await model.blockOverlapsBlock(tenantId, body.event_date, body.start_time, body.end_time, excludeId)) {
      return 'Já existe um bloqueio sobreposto neste período. Ajuste o horário.';
    }
    const conflicts = await model.blockConflictEvents(tenantId, body.event_date, body.start_time, body.end_time, excludeId);
    if (conflicts.length > 0) {
      const lista = conflicts.map(c => {
        const ini = fmtT(c.start_time);
        const fim = fmtT(c.end_time);
        const hora = ini ? ` (${ini}${fim ? '–' + fim : ''})` : ' (dia inteiro)';
        return `${c.title}${hora}`;
      }).join(', ');
      return `Não é possível bloquear: há evento(s) neste período — ${lista}. Resolva o conflito antes.`;
    }
    return null;
  }

  if (await model.isDayClosed(tenantId, body.event_date, excludeId)) {
    return 'Agenda fechada neste dia. Reabra a agenda para poder agendar.';
  }
  const partial = await model.eventBlockedByPartial(tenantId, body.event_date, body.start_time, body.end_time, excludeId);
  if (partial) {
    const ini = fmtT(partial.start_time);
    const fim = fmtT(partial.end_time);
    return `Horário bloqueado na agenda (${ini ? `${ini}${fim ? '–' + fim : ''}` : 'dia inteiro'}). Escolha outro horário.`;
  }
  if (await model.hasTimeConflict(tenantId, body.event_date, body.start_time, body.end_time, excludeId)) {
    return 'Conflito de horário: já existe um agendamento ativo neste horário.';
  }
  return null;
}

// GET /api/calendar-events?scope=upcoming|past|all  (ou ?from=&to=)
router.get('/', async (req, res) => {
  try {
    const { scope, from, to } = req.query;
    const data = await model.list(req.tenantId, { scope: scope || 'upcoming', from, to });
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/calendar-events/upcoming?limit=5  (dashboard)
router.get('/upcoming', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);
    const data = await model.upcoming(req.tenantId, limit);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/calendar-events/consultants — usuários ativos do tenant p/ o select "Consultor"
router.get('/consultants', async (req, res) => {
  try {
    const data = await model.listConsultants(req.tenantId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/calendar-events
router.post('/', async (req, res) => {
  try {
    const { title, event_date } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'Título é obrigatório' });
    if (!event_date)             return res.status(400).json({ success: false, error: 'Data é obrigatória' });
    const reason = await blockedReason(req.tenantId, req.body, null);
    if (reason) return res.status(409).json({ success: false, error: reason });
    // responsável: usa o enviado ou, por padrão, o usuário logado
    const responsible = req.body.responsible_user_id || req.userId || null;
    const item = await model.create({
      ...req.body, title: title.trim(),
      tenant_id: req.tenantId, responsible_user_id: responsible, created_by: req.userId || null,
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/calendar-events/:id
router.put('/:id', async (req, res) => {
  try {
    const existing = await model.getById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ success: false, error: 'Evento não encontrado' });
    const { title, event_date } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'Título é obrigatório' });
    if (!event_date)             return res.status(400).json({ success: false, error: 'Data é obrigatória' });
    const reason = await blockedReason(req.tenantId, req.body, req.params.id);
    if (reason) return res.status(409).json({ success: false, error: reason });
    const item = await model.update(req.params.id, { ...req.body, title: title.trim() }, req.tenantId);
    res.json({ success: true, data: item });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/calendar-events/:id/status  (cancelar/concluir)
router.patch('/:id/status', async (req, res) => {
  try {
    const status = VALID_STATUS.includes(req.body.status) ? req.body.status : null;
    if (!status) return res.status(400).json({ success: false, error: 'Status inválido' });
    const item = await model.setStatus(req.params.id, status, req.tenantId);
    if (!item) return res.status(404).json({ success: false, error: 'Evento não encontrado' });
    res.json({ success: true, data: item });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/calendar-events/:id
router.delete('/:id', async (req, res) => {
  try {
    const item = await model.remove(req.params.id, req.tenantId);
    if (!item) return res.status(404).json({ success: false, error: 'Evento não encontrado' });
    res.json({ success: true, data: item });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
