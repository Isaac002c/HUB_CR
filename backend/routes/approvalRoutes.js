const express = require('express');
const router  = express.Router();
const model   = require('../models/approvalModels');
const { requireModule } = require('../middlewares/authorize');

const isMaster = (role) => ['master', 'super_admin'].includes(role);

// Master revisa tudo. A supervisão revisa somente pedidos feitos por membros
// da própria equipe; nunca pedidos de outros times ou de consultores avulsos.
const requireReviewer = (req, res, next) => {
  if (isMaster(req.userRole)) return next();
  if (req.userRole !== 'supervisor') {
    return res.status(403).json({ success: false, error: 'Perfil sem permissão para revisar aprovações.' });
  }
  if (!req.teamId) {
    return res.status(403).json({ success: false, error: 'Supervisão sem equipe vinculada.' });
  }
  next();
};

// POST /api/approvals — a tela de Aprovações continua invisível para
// consultores, mas eles podem solicitar a exclusão de registros próprios.
// Isso cria a fila que será avaliada pelo Master ou pela supervisão da equipe.
router.post('/', async (req, res) => {
  try {
    const { target_type, target_id } = req.body;
    if (!target_type || !target_id) {
      return res.status(400).json({ success: false, error: 'Tipo e registro são obrigatórios.' });
    }

    if (!isMaster(req.userRole)) {
      const ownerId = await model.getTargetOwner(target_type, target_id, req.tenantId);
      const isOwnRecord = ownerId && ownerId === req.userId;
      const isTeamRecord = req.userRole === 'supervisor' && req.teamId
        && ownerId && await model.userBelongsToTeam(ownerId, req.tenantId, req.teamId);

      if (!isOwnRecord && !isTeamRecord) {
        return res.status(403).json({ success: false, error: 'Você só pode solicitar exclusão de registros sob sua responsabilidade.' });
      }
    }

    const item = await model.create({
      tenant_id:    req.tenantId,
      requested_by: req.userId,
      target_type:  req.body.target_type,
      target_id:    req.body.target_id,
      target_label: req.body.target_label,
      reason:       req.body.reason,
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.use(requireModule('approvals'));

// GET /api/approvals — Master vê tudo; supervisão vê a própria equipe.
router.get('/', requireReviewer, async (req, res) => {
  try {
    const { status } = req.query;
    const data = isMaster(req.userRole)
      ? await model.listByTenant(req.tenantId, status || null)
      : await model.listByTeam(req.tenantId, req.teamId, status || null);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/approvals/:id/approve — Master ou supervisão responsável.
router.patch('/:id/approve', requireReviewer, async (req, res) => {
  try {
    if (!isMaster(req.userRole)) {
      const request = await model.getByIdForTeam(req.params.id, req.tenantId, req.teamId);
      if (!request) return res.status(404).json({ success: false, error: 'Solicitação não encontrada nesta equipe.' });
    }
    const item = await model.approve(req.params.id, req.userId, req.tenantId);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PATCH /api/approvals/:id/reject — Master ou supervisão responsável.
router.patch('/:id/reject', requireReviewer, async (req, res) => {
  try {
    if (!isMaster(req.userRole)) {
      const request = await model.getByIdForTeam(req.params.id, req.tenantId, req.teamId);
      if (!request) return res.status(404).json({ success: false, error: 'Solicitação não encontrada nesta equipe.' });
    }
    const item = await model.reject(req.params.id, req.userId, req.tenantId);
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
