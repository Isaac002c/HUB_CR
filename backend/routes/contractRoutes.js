const express = require('express');
const router = express.Router();
const fs = require('fs/promises');
const path = require('path');
const contractModel = require('../models/contractModels');
const companyModel = require('../models/companyModels');
const vehicleModel = require('../models/companyVehicleModels');
const { checkPermission, requireAdmin } = require('../middlewares/checkPermission');
const { requireModule, requireRole, access } = require('../middlewares/authorize');
const { validateProcessStage } = require('../config/processStages');
const { validateBusinessDeadline } = require('../config/businessDays');

const plateKey = (p) => String(p || '').replace(/[^a-z0-9]/gi, '').toUpperCase();

// Valida vínculo empresa/veículo de um processo contra o tenant autenticado.
// Só atua quando company_id/vehicle_id são informados (não afeta o fluxo de cliente).
async function validateContractLink(body, tenantId) {
  const { company_id, vehicle_id, vehicle_plate } = body;
  if (!company_id && !vehicle_id) return { ok: true };

  if (company_id) {
    const company = await companyModel.getCompanyById(company_id, tenantId);
    if (!company) return { ok: false, status: 400, error: 'Empresa inválida para este tenant' };
  }
  if (vehicle_id) {
    const vehicle = await vehicleModel.getById(vehicle_id, tenantId);
    if (!vehicle) return { ok: false, status: 400, error: 'Veículo inválido para este tenant' };
    if (company_id && vehicle.company_id !== company_id) {
      return { ok: false, status: 400, error: 'Veículo não pertence à empresa informada' };
    }
    // Coerência de placa: quando o veículo tem placa e o processo informa outra, bloqueia.
    if (vehicle.plate && vehicle_plate && plateKey(vehicle.plate) !== plateKey(vehicle_plate)) {
      return { ok: false, status: 400, error: 'Placa informada não corresponde ao veículo selecionado' };
    }
  }
  return { ok: true };
}

async function validateTriDetails(body, resolvedServiceCode = null) {
  const serviceCode = String(
    resolvedServiceCode || await contractModel.getServiceTypeCode(body.service_id) || ''
  ).toUpperCase();
  if (!serviceCode) return { ok: false, status: 400, error: 'Tipo de serviço inválido.' };
  if (serviceCode !== 'TRI') return { ok: true };
  if (!String(body.numero_multa || '').trim()) {
    return { ok: false, status: 400, error: 'Informe o número do Auto de Infração do Real Infrator.' };
  }
  if (!String(body.vehicle_plate || '').trim()) {
    return { ok: false, status: 400, error: 'Informe a placa do veículo do Real Infrator.' };
  }
  if (!String(body.real_infractor_name || '').trim()) {
    return { ok: false, status: 400, error: 'Informe o nome do real infrator.' };
  }
  return { ok: true };
}

// GET /api/contracts/stage-clients — clientes agrupados por macro-etapa
router.get('/stage-clients', checkPermission('contracts:read'), async (req, res) => {
  try {
    const rows = await contractModel.getClientsByStageGroup(req.tenantId);
    // Agrupa por sub_group
    const groups = {};
    for (const r of rows) {
      if (!r.sub_group) continue;
      if (!groups[r.sub_group]) groups[r.sub_group] = [];
      groups[r.sub_group].push(r);
    }
    res.json({ success: true, data: groups });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/aprs-stats', checkPermission('contracts:read'), async (req, res) => {
  try {
    const stats = await contractModel.getAPRsByStage(req.tenantId);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/by-organ', checkPermission('contracts:read'), async (req, res) => {
  try {
    const data = await contractModel.getContractsGroupedByOrgan(req.tenantId);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/dashboard', checkPermission('contracts:read'), async (req, res) => {
  try {
    const [dashboard, alerts] = await Promise.all([
      contractModel.getDashboardStats(req.tenantId),
      contractModel.getAlerts(req.tenantId),
    ]);
    res.json({ success: true, data: { dashboard, alerts } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/contracts/deadlines?days=30&real_infractor=client|company — Prazos
// Módulo "prazos": master/admin ✅, supervisor ❌ (403), consultor (dono).
router.get('/deadlines', requireModule('prazos'), checkPermission('contracts:read'), async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
    // Consultor: escopa por dono (seller_id). master/admin: tenant inteiro.
    const level = access.accessLevel(req.userRole, 'prazos');
    const ownerId = level === 'own' ? req.userId : null;
    const realInfractor = ['client', 'company'].includes(req.query.real_infractor) ? req.query.real_infractor : null;
    const opts = { ownerId, realInfractor };
    const [overdue, upcoming] = await Promise.all([
      contractModel.getOverdueContracts(req.tenantId, opts),
      contractModel.getContractsNearDueDate(req.tenantId, days, opts),
    ]);
    res.json({ success: true, data: { overdue, upcoming, days } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/contracts/deferred — processos DEFERIDOS (cliente OU empresa), tenant-scoped
router.get('/deferred', requireModule('deferidos'), checkPermission('contracts:read'), async (req, res) => {
  try {
    const rows = await contractModel.getDeferred(req.tenantId);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/contracts/real-infractor-alerts — todos os processos TRI do dashboard,
// com nome preenchido ou pendente. Consultor vê só os próprios;
// supervisão/master têm a visão operacional completa.
router.get('/real-infractor-alerts', requireModule('clients'), checkPermission('contracts:read'), async (req, res) => {
  try {
    const level = access.accessLevel(req.userRole, 'clients');
    const rows = await contractModel.getRealInfractorAlerts(req.tenantId, {
      ownerId: level === 'own' ? req.userId : null,
    });
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// A imagem é administrada na própria vitrine de deferidos. Consultores apenas a visualizam.
router.patch('/:id/deferred-image', requireRole('master', 'admin', 'supervisor'), async (req, res) => {
  try {
    const value = req.body.deferred_image_url;
    let imageUrl = null;
    if (value !== null && value !== undefined && value !== '') {
      imageUrl = String(value).trim();
      if (imageUrl.length > 2000) {
        return res.status(400).json({ success: false, error: 'URL da imagem muito longa.' });
      }
      let parsed;
      try { parsed = new URL(imageUrl); } catch {
        return res.status(400).json({ success: false, error: 'URL da imagem inválida.' });
      }
      const expectedPath = `/uploads/${req.tenantId}/`;
      if (!['http:', 'https:'].includes(parsed.protocol)
        || !parsed.pathname.startsWith(expectedPath)
        || !/\.(jpe?g|png|webp)$/i.test(parsed.pathname)) {
        return res.status(400).json({ success: false, error: 'Use uma imagem JPG, PNG ou WEBP enviada pelo sistema.' });
      }
    }
    const updated = await contractModel.updateDeferredImage(req.params.id, req.tenantId, imageUrl);
    if (!updated) return res.status(404).json({ success: false, error: 'Processo deferido não encontrado.' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// A remoção da imagem é propositalmente mais restrita do que a substituição:
// somente Master e ADM podem apagar uma prova enviada por engano. O processo
// deferido nunca é excluído por esta ação.
router.delete('/:id/deferred-image', requireRole('master', 'admin'), async (req, res) => {
  try {
    const removed = await contractModel.removeDeferredImage(req.params.id, req.tenantId);
    if (!removed) return res.status(404).json({ success: false, error: 'Processo deferido não encontrado.' });

    // Exclui do disco somente arquivo local que pertence ao tenant atual.
    // URLs legadas ou externas são apenas desvinculadas do processo.
    const imageUrl = removed.removed_image_url;
    if (imageUrl) {
      try {
        const parsed = new URL(imageUrl);
        const expectedPath = `/uploads/${req.tenantId}/`;
        if (parsed.pathname.startsWith(expectedPath)) {
          const uploadRoot = path.resolve(__dirname, '..', 'uploads', String(req.tenantId));
          const filename = path.basename(parsed.pathname);
          const filePath = path.resolve(uploadRoot, filename);
          if (filePath.startsWith(`${uploadRoot}${path.sep}`)) {
            await fs.unlink(filePath).catch((err) => {
              if (err.code !== 'ENOENT') throw err;
            });
          }
        }
      } catch (err) {
        // A desvinculação no banco já foi concluída. Uma falha no arquivo não
        // deve expor a URL nem impedir que o dado sensível saia da vitrine.
        console.error('[deferred-image delete]', err.message);
      }
    }

    res.json({ success: true, data: { id: removed.id } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/client/:clientId', checkPermission('contracts:read'), async (req, res) => {
  try {
    const contracts = await contractModel.getContractsByClient(req.params.clientId, req.tenantId);
    res.json({ success: true, data: contracts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/service/:serviceId', checkPermission('contracts:read'), async (req, res) => {
  try {
    const contracts = await contractModel.getContractsByService(
      req.params.serviceId,
      req.tenantId,
      req.query.client_id || null
    );
    res.json({ success: true, data: contracts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const contracts = await contractModel.getAllContracts(req.tenantId);
    res.json({ success: true, data: contracts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', checkPermission('contracts:create'), async (req, res) => {
  try {
    const serviceCode = await contractModel.getServiceTypeCode(req.body.service_id);
    if (!serviceCode) return res.status(400).json({ success: false, error: 'Tipo de serviço inválido.' });
    const stageCheck = validateProcessStage(req.userRole, req.body.status, serviceCode);
    if (!stageCheck.ok) return res.status(stageCheck.status).json({ success: false, error: stageCheck.error });
    const triCheck = await validateTriDetails(req.body, serviceCode);
    if (!triCheck.ok) return res.status(triCheck.status).json({ success: false, error: triCheck.error });
    const linkCheck = await validateContractLink(req.body, req.tenantId);
    if (!linkCheck.ok) return res.status(linkCheck.status).json({ success: false, error: linkCheck.error });
    const deadlineCheck = validateBusinessDeadline(req.body.due_date);
    if (!deadlineCheck.ok) return res.status(deadlineCheck.status).json({ success: false, error: deadlineCheck.error });
    const contract = await contractModel.createContract({
      ...req.body,
      status: stageCheck.stage,
      due_date: deadlineCheck.date,
      tenant_id: req.tenantId,
      seller_id: req.userRole === 'seller' ? req.userId : (req.body.seller_id || null),
    });
    res.status(201).json({ success: true, data: contract });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', checkPermission('contracts:update'), async (req, res) => {
  try {
    const serviceCode = await contractModel.getServiceTypeCode(req.body.service_id);
    if (!serviceCode) return res.status(400).json({ success: false, error: 'Tipo de serviço inválido.' });
    const stageCheck = validateProcessStage(req.userRole, req.body.status, serviceCode);
    if (!stageCheck.ok) return res.status(stageCheck.status).json({ success: false, error: stageCheck.error });
    const triCheck = await validateTriDetails(req.body, serviceCode);
    if (!triCheck.ok) return res.status(triCheck.status).json({ success: false, error: triCheck.error });
    const linkCheck = await validateContractLink(req.body, req.tenantId);
    if (!linkCheck.ok) return res.status(linkCheck.status).json({ success: false, error: linkCheck.error });
    const deadlineCheck = validateBusinessDeadline(req.body.due_date);
    if (!deadlineCheck.ok) return res.status(deadlineCheck.status).json({ success: false, error: deadlineCheck.error });
    const contract = await contractModel.updateContract(req.params.id, {
      ...req.body,
      status: stageCheck.stage,
      due_date: deadlineCheck.date,
    }, req.tenantId);
    if (!contract) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: contract });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/contracts/:id/protocol — atualiza apenas campos de protocolo
router.patch('/:id/protocol', checkPermission('contracts:update'), async (req, res) => {
  try {
    const contract = await contractModel.patchContractProtocol(req.params.id, req.body, req.tenantId);
    if (!contract) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: contract });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', checkPermission('contracts:delete'), async (req, res) => {
  try {
    const contract = await contractModel.deleteContract(req.params.id, req.tenantId);
    if (!contract) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: contract });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', checkPermission('contracts:read'), async (req, res) => {
  try {
    const contract = await contractModel.getContractById(req.params.id, req.tenantId);
    if (!contract) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: contract });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
