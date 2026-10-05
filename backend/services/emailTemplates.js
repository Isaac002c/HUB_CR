const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const cleanText = (value, fallback = '') => String(value ?? fallback).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

function layout({ title, preheader, body, tenantName, contactEmail }) {
  const safeTitle = escapeHtml(title);
  const safePreheader = escapeHtml(preheader || title);
  const safeTenant = escapeHtml(cleanText(tenantName, 'Assessoria de Trânsito'));
  const safeContact = escapeHtml(cleanText(contactEmail));
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head>
<body style="margin:0;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${safePreheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fb;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <tr><td style="background:#751518;padding:22px 28px;color:#ffffff;font-size:20px;font-weight:700">${safeTenant}</td></tr>
        <tr><td style="padding:30px 28px">${body}</td></tr>
        <tr><td style="border-top:1px solid #e2e8f0;padding:18px 28px;color:#64748b;font-size:12px;line-height:1.5">
          Mensagem transacional enviada por ${safeTenant}.${safeContact ? `<br>Contato: ${safeContact}` : ''}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function protocolAvailable(data) {
  const clientName = cleanText(data.client_name, 'Cliente');
  const tenantName = cleanText(data.tenant_name, 'Assessoria de Trânsito');
  const protocolNumber = cleanText(data.protocol_number);
  const processNumber = cleanText(data.process_number);
  const appUrl = cleanText(data.process_url);
  const identifier = protocolNumber || processNumber || 'seu processo';
  const subject = `Protocolo disponível${protocolNumber ? ` — ${protocolNumber}` : ''}`;
  const details = [
    protocolNumber ? `Protocolo: ${protocolNumber}` : null,
    processNumber ? `Processo: ${processNumber}` : null,
  ].filter(Boolean);
  const htmlDetails = details.length
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin:20px 0;line-height:1.7">${details.map((item) => escapeHtml(item)).join('<br>')}</div>`
    : '';
  const htmlButton = /^https:\/\//i.test(appUrl)
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#751518;color:#fff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:700">Acompanhar processo</a></p>`
    : '';
  const html = layout({
    title: subject,
    preheader: `O protocolo de ${identifier} está disponível.`,
    tenantName,
    contactEmail: data.contact_email,
    body: `<h1 style="font-size:22px;margin:0 0 16px;color:#0f172a">Olá, ${escapeHtml(clientName)}.</h1>
      <p style="font-size:15px;line-height:1.7;margin:0">O protocolo referente ao seu processo está disponível e segue anexado a este e-mail.</p>
      ${htmlDetails}${htmlButton}
      <p style="font-size:15px;line-height:1.7;margin:24px 0 0">Atenciosamente,<br><strong>${escapeHtml(tenantName)}</strong></p>`,
  });
  const text = [
    `Olá, ${clientName}.`, '',
    'O protocolo referente ao seu processo está disponível e segue anexado a este e-mail.',
    '', ...details,
    appUrl && /^https:\/\//i.test(appUrl) ? `Acompanhe em: ${appUrl}` : null,
    '', `Atenciosamente,`, tenantName,
    data.contact_email ? `Contato: ${cleanText(data.contact_email)}` : null,
  ].filter((line) => line !== null).join('\n');
  return { subject, html, text };
}

function systemTest(data) {
  const tenantName = cleanText(data.tenant_name, 'Assessoria de Trânsito');
  const sentAt = cleanText(data.sent_at, new Date().toISOString());
  const subject = 'Teste de e-mail transacional';
  const html = layout({
    title: subject,
    preheader: 'A integração com o provedor de e-mail está operacional.',
    tenantName,
    contactEmail: data.contact_email,
    body: `<h1 style="font-size:22px;margin:0 0 16px;color:#0f172a">Teste concluído</h1>
      <p style="font-size:15px;line-height:1.7;margin:0">Este e-mail confirma que a caixa de saída e o provedor transacional conseguiram processar uma mensagem de teste.</p>
      <p style="font-size:13px;color:#64748b;margin:20px 0 0">Gerado em ${escapeHtml(sentAt)}.</p>`,
  });
  const text = `Teste concluído\n\nEste e-mail confirma que a caixa de saída e o provedor transacional conseguiram processar uma mensagem de teste.\n\nGerado em ${sentAt}.\n\n${tenantName}`;
  return { subject, html, text };
}

const TEMPLATES = {
  protocol_available: protocolAvailable,
  system_test: systemTest,
};

function renderEmailTemplate(templateKey, data = {}) {
  const render = TEMPLATES[templateKey];
  if (!render) {
    const error = new Error(`Template de e-mail desconhecido: ${templateKey}`);
    error.code = 'EMAIL_TEMPLATE_NOT_FOUND';
    throw error;
  }
  return render(data || {});
}

module.exports = { renderEmailTemplate, escapeHtml, TEMPLATES };
