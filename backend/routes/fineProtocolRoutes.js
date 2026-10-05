const express = require('express');
const router  = express.Router();
const model   = require('../models/fineProtocolModels');
const { checkPermission } = require('../middlewares/checkPermission');
const emailService = require('../services/emailService');
const { queueProtocolEmail } = require('../services/protocolEmailService');
const emailOutboxModel = require('../models/emailOutboxModels');

const accessContext = (req) => ({ role: req.userRole, userId: req.userId, teamId: req.teamId });

async function ensureFineAccess(req, res, fineId) {
  if (await model.canAccessFine(fineId, req.tenantId, accessContext(req))) return true;
  res.status(403).json({ success: false, error: 'Acesso negado a este processo.' });
  return false;
}

async function ensureProtocolAccess(req, res, protocolId) {
  const fineId = await model.getProtocolFineId(protocolId, req.tenantId);
  if (!fineId) {
    res.status(404).json({ success: false, error: 'Protocolo não encontrado.' });
    return false;
  }
  return ensureFineAccess(req, res, fineId);
}

// GET /api/fine-protocols?fine_id=X
router.get('/', checkPermission('contracts:read'), async (req, res) => {
  try {
    const { fine_id } = req.query;
    if (!fine_id) return res.status(400).json({ success: false, error: 'fine_id é obrigatório' });
    if (!await ensureFineAccess(req, res, fine_id)) return;
    const data = await model.listByFine(fine_id, req.tenantId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/fine-protocols/fine/:fineId/email-history — trilha de entrega do processo.
router.get('/fine/:fineId/email-history', checkPermission('contracts:read'), async (req, res) => {
  try {
    if (!await ensureFineAccess(req, res, req.params.fineId)) return;
    const data = await emailOutboxModel.listProcessEvents(
      req.tenantId,
      req.params.fineId,
      50
    );
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fine-protocols
router.post('/', checkPermission('contracts:update'), async (req, res) => {
  try {
    if (!req.body.fine_id) return res.status(400).json({ success: false, error: 'fine_id é obrigatório' });
    if (!await ensureFineAccess(req, res, req.body.fine_id)) return;
    const item = await model.create({ ...req.body, tenant_id: req.tenantId });
    let email = null;
    if (item.protocol_file_url && emailService.isAutomationEnabled()) {
      try { email = await queueProtocolEmail(item.id, req.tenantId, { createdBy: req.userId }); }
      catch (error) { email = { status: 'not_queued', error: String(error.message || error).slice(0, 300) }; }
    }
    res.status(201).json({ success: true, data: item, email });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/fine-protocols/:id
router.patch('/:id', checkPermission('contracts:update'), async (req, res) => {
  try {
    if (!await ensureProtocolAccess(req, res, req.params.id)) return;
    const before = await model.getForEmail(req.params.id, req.tenantId);
    const item = await model.update(req.params.id, req.body, req.tenantId);
    if (!item) return res.status(404).json({ success: false, error: 'Protocolo não encontrado' });
    let email = null;
    const fileChanged = item.protocol_file_url && item.protocol_file_url !== before?.protocol_file_url;
    if (fileChanged && emailService.isAutomationEnabled()) {
      try { email = await queueProtocolEmail(item.id, req.tenantId, { createdBy: req.userId }); }
      catch (error) { email = { status: 'not_queued', error: String(error.message || error).slice(0, 300) }; }
    }
    res.json({ success: true, data: item, email });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/fine-protocols/:id
router.delete('/:id', checkPermission('contracts:delete'), async (req, res) => {
  try {
    if (!await ensureProtocolAccess(req, res, req.params.id)) return;
    const item = await model.remove(req.params.id, req.tenantId);
    if (!item) return res.status(404).json({ success: false, error: 'Protocolo não encontrado' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/fine-protocols/:id/send-email — enfileira o protocolo para envio transacional.
router.post('/:id/send-email', checkPermission('contracts:update'), async (req, res) => {
  try {
    if (!await ensureProtocolAccess(req, res, req.params.id)) return;
    const outbox = await queueProtocolEmail(req.params.id, req.tenantId, { createdBy: req.userId });
    return res.status(outbox.duplicate ? 200 : 202).json({
      success: true,
      data: {
        id: outbox.id,
        status: outbox.status,
        duplicate: outbox.duplicate,
        queued_for: outbox.recipient,
      },
    });
  } catch (err) {
    console.error('[fine-protocols:send-email] erro:', err.message);
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Falha ao enfileirar o e-mail.' });
  }
});

module.exports = router;
