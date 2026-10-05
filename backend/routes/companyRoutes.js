const express = require('express');
const router  = express.Router();
const model        = require('../models/companyModels');
const vehicleModel = require('../models/companyVehicleModels');
const contractModel = require('../models/contractModels');
const { checkPermission } = require('../middlewares/checkPermission');
const { requireModule, access } = require('../middlewares/authorize');

const normalizeCnpj = (v) => (v || '').replace(/\D/g, '');
const isValidEmail  = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Módulo Empresas: master/admin (tenant), supervisor (equipe), consultor (dono)
router.use(requireModule('companies'));

const companyScope = (req) => {
  const level = access.accessLevel(req.userRole, 'companies');
  if (level === 'full') return {};
  if (level === 'team') return req.teamId ? { teamId: req.teamId } : { ownerId: req.userId };
  return { ownerId: req.userId };
};
const canAccessCompany = (req, company) => {
  const level = access.accessLevel(req.userRole, 'companies');
  if (level === 'full') return true;
  return company.created_by === req.userId; // consultor/supervisor: dono
};

// Ownership guard para TODAS as subrotas de empresa (:id = company id).
// Consultor/supervisor não acessam empresa de outro (403), mesmo por URL/API direta.
router.param('id', async (req, res, next, id) => {
  try {
    const company = await model.getCompanyById(id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    if (!canAccessCompany(req, company)) {
      return res.status(403).json({ success: false, error: 'Acesso negado a esta empresa' });
    }
    req.company = company;
    next();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// EMPRESAS — CRUD (tenant-scoped via req.tenantId)
// ============================================================

// GET /api/companies?q=  — lista + busca
router.get('/', checkPermission('companies:read'), async (req, res) => {
  try {
    const data = await model.getAllCompanies(req.tenantId, req.query.q || '', companyScope(req));
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/companies
router.post('/', checkPermission('companies:create'), async (req, res) => {
  try {
    const { razao_social, nome_fantasia, cnpj, responsavel, phone, email, address, notes, status } = req.body;
    if (!razao_social || !razao_social.trim()) {
      return res.status(400).json({ success: false, error: 'Razão social é obrigatória' });
    }
    const cnpjNorm = normalizeCnpj(cnpj);
    if (!cnpjNorm)                 return res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
    if (cnpjNorm.length !== 14)    return res.status(400).json({ success: false, error: 'CNPJ deve ter 14 dígitos' });
    if (email && !isValidEmail(email)) return res.status(400).json({ success: false, error: 'E-mail inválido' });

    const dup = await model.getCompanyByCnpj(cnpjNorm, req.tenantId);
    if (dup) return res.status(400).json({ success: false, error: 'CNPJ já cadastrado' });

    const company = await model.createCompany({
      tenant_id: req.tenantId, razao_social: razao_social.trim(), nome_fantasia,
      cnpj: cnpjNorm, responsavel, phone, email, address, notes, status: status || 'ativo',
      created_by: req.userId,
    });
    res.status(201).json({ success: true, data: company });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ---- Veículos da empresa (rotas mais específicas antes de '/:id') ----

// GET /api/companies/:id/vehicles
router.get('/:id/vehicles', checkPermission('companies:read'), async (req, res) => {
  try {
    const company = await model.getCompanyById(req.params.id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    const data = await vehicleModel.listByCompany(req.params.id, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/companies/:id/vehicles
router.post('/:id/vehicles', checkPermission('companies:update'), async (req, res) => {
  try {
    const company = await model.getCompanyById(req.params.id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    const v = await vehicleModel.create({ ...req.body, tenant_id: req.tenantId, company_id: req.params.id });
    res.status(201).json({ success: true, data: v });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/companies/:id/vehicles/:vid
router.put('/:id/vehicles/:vid', checkPermission('companies:update'), async (req, res) => {
  try {
    const existing = await vehicleModel.getById(req.params.vid, req.tenantId);
    if (!existing || existing.company_id !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    }
    const v = await vehicleModel.update(req.params.vid, req.body, req.tenantId);
    res.json({ success: true, data: v });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/companies/:id/vehicles/:vid/status  (ativar/inativar)
router.patch('/:id/vehicles/:vid/status', checkPermission('companies:update'), async (req, res) => {
  try {
    const status = req.body.status === 'inativo' ? 'inativo' : 'ativo';
    const v = await vehicleModel.setStatus(req.params.vid, status, req.tenantId);
    if (!v) return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    res.json({ success: true, data: v });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/companies/:id/vehicles/:vid  (bloqueia se houver processo vinculado)
router.delete('/:id/vehicles/:vid', checkPermission('companies:delete'), async (req, res) => {
  try {
    const linked = await vehicleModel.countVehicleFines(req.params.vid, req.tenantId);
    if (linked > 0) {
      return res.status(409).json({ success: false, error: 'Veículo possui processos vinculados. Inative em vez de excluir.' });
    }
    const v = await vehicleModel.remove(req.params.vid, req.tenantId);
    if (!v) return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    res.json({ success: true, data: v });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/companies/:id/vehicle-fine-counts — contagem leve de processos por veículo (sem N+1)
router.get('/:id/vehicle-fine-counts', checkPermission('companies:read'), async (req, res) => {
  try {
    const company = await model.getCompanyById(req.params.id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    const data = await vehicleModel.getVehicleFineCounts(req.params.id, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/companies/:id/unlinked-fines — processos da empresa SEM veículo vinculado
router.get('/:id/unlinked-fines', checkPermission('contracts:read'), async (req, res) => {
  try {
    const company = await model.getCompanyById(req.params.id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    const data = await model.getUnlinkedCompanyFines(req.params.id, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/companies/:id/vehicles/:vid — detalhe de um veículo (tenant + empresa)
router.get('/:id/vehicles/:vid', checkPermission('companies:read'), async (req, res) => {
  try {
    const vehicle = await vehicleModel.getById(req.params.vid, req.tenantId);
    if (!vehicle || vehicle.company_id !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    }
    res.json({ success: true, data: vehicle });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/companies/:id/vehicles/:vid/fines?status=&limit=&offset= — processos do veículo (paginado)
router.get('/:id/vehicles/:vid/fines', checkPermission('contracts:read'), async (req, res) => {
  try {
    const vehicle = await vehicleModel.getById(req.params.vid, req.tenantId);
    if (!vehicle || vehicle.company_id !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    }
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const status = req.query.status || '';
    const [items, total] = await Promise.all([
      vehicleModel.getVehicleFines(req.params.vid, req.tenantId, vehicle.plate, { status, limit, offset }),
      vehicleModel.countVehicleFinesView(req.params.vid, req.tenantId, vehicle.plate, { status }),
    ]);
    res.json({ success: true, data: { items, total, limit, offset } });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// POST /api/companies/:id/vehicles/:vid/fines/:fid/link — vincula processo legado ao veículo
router.post('/:id/vehicles/:vid/fines/:fid/link', checkPermission('contracts:update'), async (req, res) => {
  try {
    const vehicle = await vehicleModel.getById(req.params.vid, req.tenantId);
    if (!vehicle || vehicle.company_id !== req.params.id) {
      return res.status(404).json({ success: false, error: 'Veículo não encontrado' });
    }
    const fine = await contractModel.getContractById(req.params.fid, req.tenantId);
    if (!fine) return res.status(404).json({ success: false, error: 'Processo não encontrado' });
    if (fine.company_id && fine.company_id !== req.params.id) {
      return res.status(400).json({ success: false, error: 'Processo pertence a outra empresa' });
    }
    const updated = await vehicleModel.linkFineToVehicle(req.params.fid, req.params.vid, req.params.id, req.tenantId);
    res.json({ success: true, data: updated });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/companies/:id/fines — processos vinculados
router.get('/:id/fines', checkPermission('contracts:read'), async (req, res) => {
  try {
    const company = await model.getCompanyById(req.params.id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    const data = await model.getCompanyFines(req.params.id, req.tenantId);
    res.json({ success: true, data });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// GET /api/companies/:id
router.get('/:id', checkPermission('companies:read'), async (req, res) => {
  try {
    const company = await model.getCompanyById(req.params.id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    res.json({ success: true, data: company });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PUT /api/companies/:id
router.put('/:id', checkPermission('companies:update'), async (req, res) => {
  try {
    const existing = await model.getCompanyById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

    const { razao_social, nome_fantasia, cnpj, responsavel, phone, email, address, notes, status } = req.body;
    if (!razao_social || !razao_social.trim()) {
      return res.status(400).json({ success: false, error: 'Razão social é obrigatória' });
    }
    const cnpjNorm = normalizeCnpj(cnpj);
    if (!cnpjNorm)              return res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
    if (cnpjNorm.length !== 14) return res.status(400).json({ success: false, error: 'CNPJ deve ter 14 dígitos' });
    if (email && !isValidEmail(email)) return res.status(400).json({ success: false, error: 'E-mail inválido' });

    if (cnpjNorm !== existing.cnpj) {
      const dup = await model.getCompanyByCnpj(cnpjNorm, req.tenantId);
      if (dup) return res.status(400).json({ success: false, error: 'CNPJ já cadastrado para outra empresa' });
    }

    const company = await model.updateCompany(req.params.id, {
      razao_social: razao_social.trim(), nome_fantasia, cnpj: cnpjNorm, responsavel,
      phone, email, address, notes, status: status || existing.status || 'ativo',
    }, req.tenantId);
    res.json({ success: true, data: company });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// PATCH /api/companies/:id/status  (ativar/inativar)
router.patch('/:id/status', checkPermission('companies:update'), async (req, res) => {
  try {
    const status = req.body.status === 'inativo' ? 'inativo' : 'ativo';
    const company = await model.setCompanyStatus(req.params.id, status, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    res.json({ success: true, data: company });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// DELETE /api/companies/:id  (bloqueia se houver processos; usar inativar)
router.delete('/:id', checkPermission('companies:delete'), async (req, res) => {
  try {
    const linked = await model.countCompanyFines(req.params.id, req.tenantId);
    if (linked > 0) {
      return res.status(409).json({ success: false, error: 'Empresa possui processos vinculados. Inative em vez de excluir.' });
    }
    const company = await model.deleteCompany(req.params.id, req.tenantId);
    if (!company) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });
    res.json({ success: true, data: company });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

module.exports = router;
