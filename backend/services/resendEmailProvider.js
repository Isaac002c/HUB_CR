const { Resend } = require('resend');

class EmailProviderError extends Error {
  constructor(message, { code = 'EMAIL_PROVIDER_ERROR', statusCode = null, providerName = null } = {}) {
    super(message || 'Falha no provedor de e-mail.');
    this.name = 'EmailProviderError';
    this.code = code;
    this.statusCode = statusCode;
    this.providerName = providerName;
  }
}

const safeHeader = (value) => String(value || '').replace(/[\r\n]/g, ' ').trim();
const safeTag = (value, fallback) => safeHeader(value).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 256) || fallback;

function createResendEmailProvider({ apiKey = process.env.RESEND_API_KEY } = {}) {
  if (!apiKey) {
    throw new EmailProviderError('RESEND_API_KEY não configurada.', { code: 'RESEND_API_KEY_MISSING' });
  }
  const resend = new Resend(apiKey);
  return {
    name: 'resend',
    async sendEmail(message) {
      const fromName = safeHeader(message.fromName);
      const fromAddress = safeHeader(message.fromAddress);
      const payload = {
        from: fromName ? `${fromName} <${fromAddress}>` : fromAddress,
        to: [message.to],
        subject: safeHeader(message.subject),
        html: message.html,
        text: message.text,
        ...(message.replyTo ? { replyTo: safeHeader(message.replyTo) } : {}),
        ...(message.attachments?.length ? { attachments: message.attachments } : {}),
        tags: [
          { name: 'event', value: safeTag(message.eventType, 'transactional') },
          { name: 'template', value: safeTag(message.templateKey, 'system') },
        ],
      };
      const { data, error } = await resend.emails.send(payload, { idempotencyKey: message.idempotencyKey });
      if (error) {
        throw new EmailProviderError(error.message, {
          code: error.name || 'RESEND_ERROR',
          statusCode: error.statusCode ?? null,
          providerName: error.name || null,
        });
      }
      if (!data?.id) {
        throw new EmailProviderError('O Resend não retornou o identificador do e-mail.', { code: 'RESEND_ID_MISSING' });
      }
      return { id: data.id };
    },
    verifyWebhook({ payload, headers, webhookSecret }) {
      if (!webhookSecret) {
        throw new EmailProviderError('RESEND_WEBHOOK_SECRET não configurado.', { code: 'RESEND_WEBHOOK_SECRET_MISSING' });
      }
      return resend.webhooks.verify({ payload, headers, webhookSecret });
    },
  };
}

module.exports = { createResendEmailProvider, EmailProviderError };
