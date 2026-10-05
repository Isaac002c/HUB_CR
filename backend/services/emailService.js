const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const outboxModel = require('../models/emailOutboxModels');
const { renderEmailTemplate } = require('./emailTemplates');
const { createResendEmailProvider, EmailProviderError } = require('./resendEmailProvider');

const PUBLIC_EMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'icloud.com']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = Math.max(1, Number(process.env.EMAIL_MAX_ATTEMPTS) || 5);
let providerOverride = null;

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function senderDomain(address = process.env.EMAIL_FROM_ADDRESS) {
  const normalized = normalizeEmail(address);
  return normalized.includes('@') ? normalized.split('@').pop() : '';
}

function isTestSender() {
  return senderDomain() === 'resend.dev';
}

function getConfigSnapshot() {
  const provider = String(process.env.EMAIL_PROVIDER || '').toLowerCase();
  const domain = senderDomain();
  const apiKeyConfigured = Boolean(process.env.RESEND_API_KEY);
  const webhookConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET);
  const fromNameConfigured = Boolean(String(process.env.EMAIL_FROM_NAME || '').trim());
  const fromAddressConfigured = EMAIL_RE.test(normalizeEmail(process.env.EMAIL_FROM_ADDRESS));
  const publicDomain = PUBLIC_EMAIL_DOMAINS.has(domain);
  const domainVerified = boolEnv('EMAIL_DOMAIN_VERIFIED', false);
  const testMode = domain === 'resend.dev';
  let operationalStatus = 'not_configured';
  let operationalLabel = 'Configuração incompleta';
  if (provider && provider !== 'resend') {
    operationalStatus = 'provider_disabled';
    operationalLabel = 'Provedor legado desativado';
  } else if (apiKeyConfigured && fromNameConfigured && fromAddressConfigured && publicDomain) {
    operationalStatus = 'invalid_sender';
    operationalLabel = 'Remetente público não permitido';
  } else if (apiKeyConfigured && fromNameConfigured && fromAddressConfigured && testMode) {
    operationalStatus = 'test_only';
    operationalLabel = 'Pronto somente para testes';
  } else if (apiKeyConfigured && fromNameConfigured && fromAddressConfigured && domainVerified) {
    operationalStatus = 'operational';
    operationalLabel = 'Operacional';
  } else if (apiKeyConfigured && fromNameConfigured && fromAddressConfigured) {
    operationalStatus = 'domain_pending';
    operationalLabel = 'Domínio pendente de verificação';
  }
  return {
    provider: provider || 'não configurado',
    automation_enabled: boolEnv('EMAIL_AUTOMATION_ENABLED', false),
    worker_enabled: boolEnv('EMAIL_WORKER_ENABLED', true),
    from_name: String(process.env.EMAIL_FROM_NAME || '').trim() || null,
    from_address: normalizeEmail(process.env.EMAIL_FROM_ADDRESS) || null,
    reply_to: normalizeEmail(process.env.EMAIL_REPLY_TO) || null,
    test_recipient: normalizeEmail(process.env.EMAIL_TEST_RECIPIENT) || null,
    api_key_configured: apiKeyConfigured,
    api_key_masked: apiKeyConfigured ? 're_••••••••••••' : null,
    webhook_secret_configured: webhookConfigured,
    domain: domain || null,
    domain_verified: domainVerified,
    test_mode: testMode,
    operational_status: operationalStatus,
    operational_label: operationalLabel,
  };
}

function configurationError(message, code) {
  const error = new Error(message);
  error.code = code;
  error.status = 503;
  return error;
}

function assertProviderConfigured({ allowTestMode = false } = {}) {
  const config = getConfigSnapshot();
  if (String(process.env.EMAIL_PROVIDER || '').toLowerCase() !== 'resend') {
    throw configurationError('EMAIL_PROVIDER deve estar configurado como resend.', 'EMAIL_PROVIDER_NOT_CONFIGURED');
  }
  if (!process.env.RESEND_API_KEY) throw configurationError('RESEND_API_KEY não configurada.', 'RESEND_API_KEY_MISSING');
  if (!config.from_name || !config.from_address) {
    throw configurationError('Nome e endereço do remetente não estão configurados.', 'EMAIL_FROM_MISSING');
  }
  if (PUBLIC_EMAIL_DOMAINS.has(config.domain)) {
    throw configurationError('O remetente deve usar um domínio próprio verificado, não Gmail/Outlook/Hotmail.', 'EMAIL_FROM_PUBLIC_DOMAIN');
  }
  if (!config.domain_verified && !(allowTestMode && config.test_mode)) {
    throw configurationError('Domínio pendente de verificação no Resend.', 'EMAIL_DOMAIN_NOT_VERIFIED');
  }
  return config;
}

function isAutomationEnabled() {
  return boolEnv('EMAIL_AUTOMATION_ENABLED', false);
}

function buildIdempotencyKey({ tenantId, eventType, processId, recipient, eventVersion }) {
  const canonical = [tenantId, eventType, processId || '-', normalizeEmail(recipient), eventVersion || 'v1'].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function sanitizeError(error) {
  const raw = String(error?.message || 'Falha desconhecida no envio.');
  return raw
    .replace(/\b(re|whsec)_[A-Za-z0-9_-]+\b/g, '[SEGREDO PROTEGIDO]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 500);
}

function classifyProviderError(error) {
  const statusCode = Number(error?.statusCode ?? error?.status);
  const code = String(error?.code || error?.providerName || '').toLowerCase();
  const permanentCodes = new Set([
    'email_provider_not_configured', 'resend_api_key_missing', 'email_from_missing',
    'email_from_public_domain', 'email_domain_not_verified', 'email_test_recipient_mismatch',
    'email_invalid_recipient', 'email_attachment_invalid', 'validation_error',
    'invalid_api_key', 'restricted_api_key', 'missing_required_field', 'invalid_idempotency_key',
  ]);
  const temporaryCodes = new Set([
    'application_error', 'concurrent_idempotent_requests', 'etimedout', 'econnreset',
    'eai_again', 'network_error', 'rate_limit_exceeded',
  ]);
  const permanent = permanentCodes.has(code) || (statusCode >= 400 && statusCode < 500 && statusCode !== 429);
  const temporary = !permanent && (
    !statusCode || statusCode === 429 || statusCode >= 500 || temporaryCodes.has(code)
  );
  return { temporary, statusCode: Number.isFinite(statusCode) ? statusCode : null, code: code || 'email_error' };
}

function retryDelayMs(attempts) {
  const base = Math.max(1, Number(process.env.EMAIL_RETRY_BASE_MS) || 60_000);
  return Math.min(base * (2 ** Math.max(0, Number(attempts || 1) - 1)), 6 * 60 * 60 * 1000);
}

async function enqueueEmail(input) {
  const recipient = normalizeEmail(input.recipient);
  if (!input.tenantId) throw new Error('tenantId é obrigatório para enfileirar e-mail.');
  if (!EMAIL_RE.test(recipient)) {
    const error = new Error('Destinatário de e-mail inválido.');
    error.code = 'EMAIL_INVALID_RECIPIENT';
    error.status = 400;
    throw error;
  }
  if (!input.eventType || !input.templateKey) throw new Error('Evento e template são obrigatórios.');
  const template = renderEmailTemplate(input.templateKey, input.templateData || {});
  const idempotencyKey = input.idempotencyKey || buildIdempotencyKey({
    tenantId: input.tenantId,
    eventType: input.eventType,
    processId: input.processId,
    recipient,
    eventVersion: input.eventVersion,
  });
  const suppression = await outboxModel.findSuppression(input.tenantId, recipient);
  const initialStatus = suppression ? 'suppressed' : 'queued';
  const inserted = await outboxModel.insertOutbox({
    tenant_id: input.tenantId,
    client_id: input.clientId,
    process_id: input.processId,
    created_by: input.createdBy,
    event_type: input.eventType,
    recipient,
    recipient_name: input.recipientName,
    subject: input.subject || template.subject,
    template_key: input.templateKey,
    template_data: input.templateData || {},
    attachments: input.attachments || [],
    status: initialStatus,
    provider: 'resend',
    idempotency_key: idempotencyKey,
    last_error: suppression ? `Endereço bloqueado por ${suppression.reason}.` : null,
  });
  if (inserted.inserted) {
    await outboxModel.recordEvent(inserted.row, initialStatus, suppression
      ? { message: `Envio bloqueado: endereço em suppression (${suppression.reason}).` }
      : undefined);
  }
  return { ...inserted.row, duplicate: !inserted.inserted };
}

function getProvider({ webhookOnly = false } = {}) {
  if (providerOverride) return providerOverride;
  return createResendEmailProvider({
    apiKey: process.env.RESEND_API_KEY || (webhookOnly ? 're_webhook_verification_only' : undefined),
  });
}

async function prepareAttachments(outbox) {
  const attachments = Array.isArray(outbox.attachments) ? outbox.attachments : [];
  if (!attachments.length) return [];
  const tenantRoot = path.resolve(__dirname, '..', 'uploads', String(outbox.tenant_id));
  const prepared = [];
  for (const attachment of attachments) {
    const resolved = path.resolve(String(attachment.path || ''));
    if (!resolved.startsWith(`${tenantRoot}${path.sep}`)) {
      const error = new Error('Anexo fora da área segura do tenant.');
      error.code = 'EMAIL_ATTACHMENT_INVALID';
      error.statusCode = 400;
      throw error;
    }
    const stat = await fs.promises.stat(resolved);
    if (!stat.isFile() || stat.size > 25 * 1024 * 1024) {
      const error = new Error('Anexo inválido ou maior que 25 MB.');
      error.code = 'EMAIL_ATTACHMENT_INVALID';
      error.statusCode = 400;
      throw error;
    }
    const content = await fs.promises.readFile(resolved, { encoding: 'base64' });
    prepared.push({
      content,
      filename: String(attachment.filename || path.basename(resolved)).slice(0, 255),
      ...(attachment.content_type ? { contentType: attachment.content_type } : {}),
    });
  }
  return prepared;
}

async function sendEmail(outbox) {
  const allowTestMode = outbox.event_type === 'system.test';
  const config = assertProviderConfigured({ allowTestMode });
  if (allowTestMode && normalizeEmail(outbox.recipient) !== config.test_recipient) {
    throw configurationError('O teste só pode ser enviado ao EMAIL_TEST_RECIPIENT autorizado.', 'EMAIL_TEST_RECIPIENT_MISMATCH');
  }
  const rendered = renderEmailTemplate(outbox.template_key, outbox.template_data || {});
  const attachments = await prepareAttachments(outbox);
  return getProvider().sendEmail({
    fromName: config.from_name,
    fromAddress: config.from_address,
    replyTo: config.reply_to,
    to: outbox.recipient,
    subject: outbox.subject || rendered.subject,
    html: rendered.html,
    text: rendered.text,
    attachments,
    idempotencyKey: outbox.idempotency_key,
    eventType: outbox.event_type,
    templateKey: outbox.template_key,
  });
}

async function processClaimed(outbox) {
  await outboxModel.recordEvent(outbox, 'processing');
  try {
    const providerResult = await sendEmail(outbox);
    const sent = await outboxModel.markSent(outbox, providerResult.id);
    await outboxModel.recordEvent(sent, 'sent', { metadata: { provider_email_id: providerResult.id } });
    return sent;
  } catch (error) {
    const safeMessage = sanitizeError(error);
    const classification = classifyProviderError(error);
    if (classification.temporary && Number(outbox.attempts) < MAX_ATTEMPTS) {
      const scheduledAt = new Date(Date.now() + retryDelayMs(outbox.attempts));
      const queued = await outboxModel.markRetry(outbox, safeMessage, scheduledAt);
      await outboxModel.recordEvent(queued, 'queued', {
        message: `Falha temporária; nova tentativa agendada (${outbox.attempts}/${MAX_ATTEMPTS}).`,
        metadata: { error_code: classification.code, retry_at: scheduledAt.toISOString() },
      });
      return queued;
    }
    const failed = await outboxModel.markFailed(outbox, safeMessage);
    await outboxModel.recordEvent(failed, 'failed', {
      message: `Falha no envio: ${safeMessage}`,
      metadata: { error_code: classification.code, temporary: classification.temporary },
    });
    return failed;
  }
}

async function processQueue(limit = 10) {
  const claimed = await outboxModel.claimBatch(limit);
  const processed = [];
  for (const item of claimed) processed.push(await processClaimed(item));
  return processed;
}

async function processEmailById(id, tenantId = null) {
  const claimed = await outboxModel.claimById(id, tenantId);
  if (!claimed) return outboxModel.getById(id, tenantId);
  return processClaimed(claimed);
}

async function sendTestEmail({ tenantId, createdBy }) {
  const config = assertProviderConfigured({ allowTestMode: true });
  if (!config.test_recipient || !EMAIL_RE.test(config.test_recipient)) {
    throw configurationError('EMAIL_TEST_RECIPIENT não configurado.', 'EMAIL_TEST_RECIPIENT_MISSING');
  }
  const tenant = await pool.query('SELECT name, email FROM tenants WHERE id=$1', [tenantId]);
  if (!tenant.rows[0]) {
    const error = new Error('Empresa não encontrada.'); error.status = 404; throw error;
  }
  const minute = new Date().toISOString().slice(0, 16);
  const outbox = await enqueueEmail({
    tenantId,
    createdBy,
    eventType: 'system.test',
    recipient: config.test_recipient,
    templateKey: 'system_test',
    templateData: {
      tenant_name: tenant.rows[0].name,
      contact_email: config.reply_to || tenant.rows[0].email,
      sent_at: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    },
    eventVersion: minute,
  });
  return processEmailById(outbox.id, tenantId);
}

async function retryEmail({ id, tenantId }) {
  const queued = await outboxModel.retry(id, tenantId);
  if (!queued) return null;
  await outboxModel.recordEvent(queued, 'queued', { message: 'Nova tentativa manual enfileirada.' });
  return queued;
}

async function getEmailStatus({ id, tenantId }) {
  return outboxModel.getById(id, tenantId);
}

async function getAdminDashboard(tenantId) {
  return { config: getConfigSnapshot(), ...(await outboxModel.getDashboard(tenantId)) };
}

async function handleResendWebhook({ rawBody, headers }) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) throw configurationError('RESEND_WEBHOOK_SECRET não configurado.', 'RESEND_WEBHOOK_SECRET_MISSING');
  let event;
  try {
    event = getProvider({ webhookOnly: true }).verifyWebhook({
      payload: rawBody,
      headers,
      webhookSecret,
    });
  } catch (error) {
    const invalid = new Error('Assinatura de webhook inválida.');
    invalid.code = 'INVALID_WEBHOOK_SIGNATURE';
    invalid.status = 400;
    throw invalid;
  }
  const statusByType = {
    'email.sent': 'sent',
    'email.delivered': 'delivered',
    'email.delivery_delayed': 'delivery_delayed',
    'email.failed': 'failed',
    'email.bounced': 'bounced',
    'email.complained': 'complained',
    'email.suppressed': 'suppressed',
  };
  const status = statusByType[event.type];
  if (!status) return { ignored: true, type: event.type };
  const providerEmailId = event.data?.email_id;
  if (!providerEmailId) {
    const error = new Error('Webhook sem email_id.'); error.status = 400; throw error;
  }
  return outboxModel.applyWebhook({
    svixId: headers.id,
    eventType: event.type,
    providerEmailId,
    payloadHash: crypto.createHash('sha256').update(rawBody).digest('hex'),
    status,
    providerCreatedAt: event.created_at ? new Date(event.created_at) : new Date(),
  });
}

function setProviderForTests(provider) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Provider de teste só pode ser injetado em NODE_ENV=test.');
  providerOverride = provider;
}

module.exports = {
  sendEmail,
  enqueueEmail,
  sendTestEmail,
  retryEmail,
  getEmailStatus,
  getAdminDashboard,
  getConfigSnapshot,
  assertProviderConfigured,
  isAutomationEnabled,
  buildIdempotencyKey,
  classifyProviderError,
  retryDelayMs,
  processQueue,
  processEmailById,
  handleResendWebhook,
  setProviderForTests,
  MAX_ATTEMPTS,
};
