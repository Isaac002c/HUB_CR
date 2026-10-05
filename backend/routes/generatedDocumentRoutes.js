const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const clientModel = require('../models/clientModels');
const documentModel = require('../models/documentModels');
const { requireModule, access } = require('../middlewares/authorize');
const { TEMPLATE_CATALOG, buildAgreementPdf, buildPowerOfAttorneyPdf, parseAmount } = require('../services/generatedDocumentService');

router.use(requireModule('clients'));

const REQUIRED_CLIENT_FIELDS = [
  ['name', 'nome'], ['cpf', 'CPF'], ['cnh', 'CNH'], ['birth_date', 'data de nascimento'],
  ['first_cnh', 'primeira habilitação'], ['phone', 'telefone'], ['email', 'e-mail'], ['address', 'endereço'],
];

function canAccessClient(req, client) {
  const level = access.accessLevel(req.userRole, 'clients');
  if (level === 'full') return true;
  return client.created_by === req.userId;
}

function safeFilename(value) {
  return String(value || 'cliente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .toLowerCase() || 'cliente';
}

function safeDisplayFilename(value, fallback = 'Documento') {
  return String(value || fallback)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 100) || fallback;
}

router.get('/templates', (req, res) => {
  res.json({ success: true, data: TEMPLATE_CATALOG });
});

router.post('/client/:clientId', async (req, res) => {
  const { clientId } = req.params;
  try {
    const client = await clientModel.getClientById(clientId, req.tenantId);
    if (!client) return res.status(404).json({ success: false, error: 'Cliente não encontrado.' });
    if (!canAccessClient(req, client)) return res.status(403).json({ success: false, error: 'Acesso negado a este cliente.' });

    const { template_type, contract_object, amount: rawAmount, payment_terms } = req.body || {};
    const template = TEMPLATE_CATALOG.find((item) => item.id === template_type);
    if (!template) return res.status(400).json({ success: false, error: 'Selecione um modelo de documento válido.' });
    if (!template.available) return res.status(409).json({ success: false, error: template.unavailable_reason });

    const requiredFields = template.document_kind === 'power_of_attorney'
      ? REQUIRED_CLIENT_FIELDS.filter(([field]) => field !== 'email')
      : REQUIRED_CLIENT_FIELDS;
    const missing = requiredFields.filter(([field]) => !String(client[field] || '').trim()).map(([, label]) => label);
    if (missing.length) {
      return res.status(422).json({
        success: false,
        error: `Complete os dados do cliente antes de emitir: ${missing.join(', ')}.`,
        missing_fields: missing,
      });
    }
    let pdf;
    if (template.document_kind === 'power_of_attorney') {
      pdf = await buildPowerOfAttorneyPdf({ client, template });
    } else {
      if (!String(contract_object || '').trim()) return res.status(400).json({ success: false, error: 'Informe o objeto do contrato.' });
      if (String(contract_object).trim().length > 2000) return res.status(400).json({ success: false, error: 'O objeto do contrato deve ter no máximo 2.000 caracteres.' });
      if (!String(payment_terms || '').trim()) return res.status(400).json({ success: false, error: 'Informe a forma/condição de pagamento.' });
      if (String(payment_terms).trim().length > 500) return res.status(400).json({ success: false, error: 'A condição de pagamento deve ter no máximo 500 caracteres.' });
      const amount = parseAmount(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
        return res.status(400).json({ success: false, error: 'Informe um valor de contrato válido.' });
      }
      pdf = await buildAgreementPdf({
        client,
        template,
        contractObject: String(contract_object).trim(),
        amount,
        paymentTerms: String(payment_terms).trim(),
      });
    }

    const displayName = `${safeDisplayFilename(template.label, 'Contrato')} - ${safeDisplayFilename(client.name, 'Cliente')}.pdf`;
    const encodedName = encodeURIComponent(displayName);
    res.status(200)
      .set('Content-Type', 'application/pdf')
      .set('Content-Length', String(pdf.length))
      .set('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}`)
      .set('Cache-Control', 'no-store')
      .send(pdf);
  } catch (err) {
    console.error('Erro ao emitir documento:', err);
    res.status(500).json({ success: false, error: 'Não foi possível emitir o documento.' });
  }
});

router.get('/:documentId/download', async (req, res) => {
  try {
    const document = await documentModel.getDocumentByIdRaw(req.params.documentId, req.tenantId);
    if (!document || document.category !== 'Contrato gerado' || !document.client_id) {
      return res.status(404).json({ success: false, error: 'Contrato gerado não encontrado.' });
    }
    const client = await clientModel.getClientById(document.client_id, req.tenantId);
    if (!client || !canAccessClient(req, client)) {
      return res.status(403).json({ success: false, error: 'Acesso negado a este documento.' });
    }

    const marker = `/uploads/${req.tenantId}/`;
    const markerIndex = String(document.file_url || '').indexOf(marker);
    if (markerIndex < 0) return res.status(404).json({ success: false, error: 'Arquivo do contrato não encontrado.' });
    const storedName = path.basename(String(document.file_url).slice(markerIndex + marker.length));
    const uploadRoot = path.resolve(__dirname, '..', 'uploads', String(req.tenantId));
    const filePath = path.resolve(uploadRoot, storedName);
    if (!filePath.startsWith(`${uploadRoot}${path.sep}`) || !fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Arquivo do contrato não encontrado.' });
    }

    const filename = safeDisplayFilename(document.file_name || `contrato-${safeFilename(client.name)}.pdf`, 'contrato.pdf');
    res.type('application/pdf');
    res.download(filePath, filename);
  } catch (err) {
    console.error('Erro ao baixar contrato:', err);
    res.status(500).json({ success: false, error: 'Não foi possível baixar o contrato.' });
  }
});

module.exports = router;
