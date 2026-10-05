const express = require('express');
const router = express.Router();
const serviceModel = require('../models/serviceModels');

// GET /api/services/types — todos os tipos de serviço disponíveis (sem filtro de tenant)
router.get('/types', async (req, res) => {
  try {
    const types = await serviceModel.getAllServiceTypes();
    res.json({ success: true, data: types });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/services
router.get('/', async (req, res) => {
  try {
    const services = await serviceModel.getAllServices(req.tenantId);
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/services/client/:clientId
router.get('/client/:clientId', async (req, res) => {
  try {
    const services = await serviceModel.getServicesByClient(req.params.clientId, req.tenantId);
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/services
router.post('/', async (req, res) => {
  try {
    const { client_id, name } = req.body;
    if (!client_id) return res.status(400).json({ success: false, error: 'Cliente é obrigatório' });
    if (!name) return res.status(400).json({ success: false, error: 'Nome do serviço é obrigatório' });
    const service = await serviceModel.createService({ tenant_id: req.tenantId, client_id, name });
    res.status(201).json({ success: true, data: service });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/services/:id?client_id=xxx
router.delete('/:id', async (req, res) => {
  try {
    const { client_id } = req.query;
    if (!client_id) return res.status(400).json({ success: false, error: 'client_id é obrigatório' });
    await serviceModel.deleteService(req.params.id, req.tenantId, client_id);
    res.json({ success: true, message: 'Serviço deletado com sucesso' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;