const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fineProtocolModel = require('../models/fineProtocolModels');
const emailService = require('./emailService');

function resolveTenantUploadPath(fileUrl, tenantId) {
  try {
    if (!fileUrl) return null;
    let pathname;
    try { pathname = new URL(fileUrl).pathname; }
    catch { pathname = String(fileUrl); }
    pathname = decodeURIComponent(pathname);
    const marker = `/uploads/${tenantId}/`;
    if (!pathname.includes(marker)) return null;
    const filename = path.basename(pathname);
    if (!filename || filename.includes('..')) return null;
    const baseDir = path.resolve(__dirname, '..', 'uploads', String(tenantId));
    const resolved = path.resolve(baseDir, filename);
    if (!resolved.startsWith(`${baseDir}${path.sep}`)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function buildAttachmentName(data) {
  const clean = (value) => String(value || '').replace(/[^\w.-]+/g, '_');
  const ext = path.extname(String(data.protocol_file_url || '').split('?')[0]) || '';
  const base = data.protocol_number
    ? `Protocolo-${clean(data.protocol_number)}`
    : `Protocolo-${clean(data.fine_number || data.fine_id || 'documento')}`;
  return `${base}${ext}`;
}

async function queueProtocolEmail(protocolId, tenantId, { createdBy = null, requireConfigured = true } = {}) {
  if (requireConfigured) emailService.assertProviderConfigured();
  const data = await fineProtocolModel.getForEmail(protocolId, tenantId);
  if (!data) {
    const error = new Error('Protocolo não encontrado.'); error.status = 404; throw error;
  }
  if (!data.client_email) {
    const error = new Error('Cliente não possui e-mail cadastrado.'); error.status = 400; throw error;
  }
  if (!data.protocol_file_url) {
    const error = new Error('Este protocolo não possui arquivo anexado.'); error.status = 400; throw error;
  }
  const filePath = resolveTenantUploadPath(data.protocol_file_url, tenantId);
  if (!filePath || !fs.existsSync(filePath)) {
    const error = new Error('Arquivo do protocolo não encontrado no servidor.'); error.status = 400; throw error;
  }
  const appUrl = String(process.env.APP_URL || '').replace(/\/$/, '');
  const version = crypto.createHash('sha256')
    .update([data.id, data.protocol_file_url, data.updated_at || data.created_at || 'v1'].join('|'))
    .digest('hex')
    .slice(0, 24);
  return emailService.enqueueEmail({
    tenantId,
    clientId: data.client_id,
    processId: data.fine_id,
    createdBy,
    eventType: 'protocol.available',
    recipient: data.client_email,
    recipientName: data.client_name,
    templateKey: 'protocol_available',
    templateData: {
      protocol_id: data.id,
      client_name: data.client_name,
      protocol_number: data.protocol_number,
      process_number: data.fine_number,
      tenant_name: data.tenant_name,
      contact_email: process.env.EMAIL_REPLY_TO || data.tenant_email || null,
      process_url: appUrl ? `${appUrl}/multas/clients/${data.client_id}` : null,
    },
    attachments: [{ filename: buildAttachmentName(data), path: filePath }],
    eventVersion: version,
  });
}

module.exports = { queueProtocolEmail, resolveTenantUploadPath, buildAttachmentName };
