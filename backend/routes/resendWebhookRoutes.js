const express = require('express');
const emailService = require('../services/emailService');

const router = express.Router();

router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    const headers = {
      id: String(req.headers['svix-id'] || ''),
      timestamp: String(req.headers['svix-timestamp'] || ''),
      signature: String(req.headers['svix-signature'] || ''),
    };
    if (!rawBody || !headers.id || !headers.timestamp || !headers.signature) {
      return res.status(400).json({ success: false, error: 'Webhook incompleto.' });
    }
    const result = await emailService.handleResendWebhook({ rawBody, headers });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    const status = error.status || (error.code === 'INVALID_WEBHOOK_SIGNATURE' ? 400 : 500);
    if (status >= 500) console.error('[resend-webhook]', String(error.message || error).slice(0, 500));
    return res.status(status).json({ success: false, error: status === 400 ? error.message : 'Falha ao processar webhook.' });
  }
});

module.exports = router;
