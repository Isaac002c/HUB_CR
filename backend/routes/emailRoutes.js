const express = require('express');
const router = express.Router();
const emailService = require('../services/emailService');
const { requireModule, requireRole } = require('../middlewares/authorize');

router.use(requireModule('settings'));
router.use(requireRole('master', 'admin', 'super_admin'));

router.get('/dashboard', async (req, res) => {
  try {
    res.json({ success: true, data: await emailService.getAdminDashboard(req.tenantId) });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/test', async (req, res) => {
  try {
    const outbox = await emailService.sendTestEmail({ tenantId: req.tenantId, createdBy: req.userId });
    const success = ['sent', 'delivered'].includes(outbox?.status);
    res.status(success ? 200 : 502).json({
      success,
      data: outbox ? {
        id: outbox.id,
        status: outbox.status,
        provider_email_id: outbox.provider_email_id,
        recipient: outbox.recipient,
        last_error: outbox.last_error,
      } : null,
      ...(!success ? { error: outbox?.last_error || 'O teste não foi aceito pelo provedor.' } : {}),
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.post('/:id/retry', async (req, res) => {
  try {
    const outbox = await emailService.retryEmail({ id: req.params.id, tenantId: req.tenantId });
    if (!outbox) return res.status(409).json({ success: false, error: 'Este e-mail não pode ser reenviado nesse status.' });
    res.status(202).json({ success: true, data: outbox });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const outbox = await emailService.getEmailStatus({ id: req.params.id, tenantId: req.tenantId });
    if (!outbox) return res.status(404).json({ success: false, error: 'E-mail não encontrado.' });
    res.json({ success: true, data: outbox });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

module.exports = router;
