const express = require('express');
const router = express.Router();
const sellerModel = require('../models/sellerModels');

// ========== DEBUG ENDPOINTS ==========

// Debug: Get all sellers (no tenant filter) - FOR TESTING ONLY
router.get('/debug/all', async (req, res) => {
  try {
    const result = await require('../config/db').query(
      'SELECT id, tenant_id, name, email, avatar, monthly_target, active FROM sellers ORDER BY name'
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== SELLERS ROUTES ==========

// GET /api/sellers - Buscar todos os vendedores
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    console.log('[sellersRoutes] GET / - tenantId:', tenantId, 'type:', typeof tenantId);
    
    const sellers = await sellerModel.getAll(tenantId);
    console.log('[sellersRoutes] GET / - sellers found:', sellers.length);
    console.log('[sellersRoutes] GET / - sellers data:', JSON.stringify(sellers));
    
    res.json({ success: true, data: sellers || [] });
  } catch (err) {
    console.error('[sellersRoutes] Erro ao buscar vendedores:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sellers/metrics - Buscar vendedores com métricas
router.get('/metrics', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    console.log('[sellersRoutes] GET /metrics - tenantId:', tenantId);
    
    const sellers = await sellerModel.getSellersWithMetrics(tenantId);
    console.log('[sellersRoutes] GET /metrics - sellers found:', sellers.length);
    
    res.json({ success: true, data: sellers || [] });
  } catch (err) {
    console.error('[sellersRoutes] Erro ao buscar métricas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/sellers/:id - Buscar vendedor por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    // Verificar se o ID é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ success: false, error: 'ID de vendedor inválido' });
    }
    
    const seller = await sellerModel.getById(id, tenantId);
    
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Vendedor não encontrado' });
    }
    
    res.json({ success: true, data: seller });
  } catch (err) {
    console.error('[sellersRoutes] Erro ao buscar vendedor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/sellers - Criar vendedor
router.post('/', async (req, res) => {
  try {
    const { name, email, avatar, monthly_target } = req.body;
    const tenantId = req.tenantId;
    
    console.log('[sellersRoutes] POST / - Creating seller:', name, 'tenantId:', tenantId, 'type:', typeof tenantId);
    
    // VALIDAÇÃO CRÍTICA - Verificar se tenantId está presente
    if (!tenantId) {
      console.error('[sellersRoutes] ERRO: tenantId está undefined ou null!');
      return res.status(400).json({ success: false, error: 'Tenant não identificado. Faça login novamente.' });
    }
    
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }
    
    console.log('[sellersRoutes] POST / - Validando tenantId:', tenantId);
    
    const seller = await sellerModel.create({
      tenant_id: tenantId,
      name,
      email,
      avatar,
      monthly_target: monthly_target || 50000
    });
    
    console.log('[sellersRoutes] POST / - Seller created:', seller);
    console.log('[sellersRoutes] POST / - Seller tenant_id:', seller?.tenant_id);
    
    res.status(201).json({ success: true, data: seller });
  } catch (err) {
    console.error('[sellersRoutes] Erro ao criar vendedor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/sellers/:id - Atualizar vendedor
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, avatar, monthly_target, active } = req.body;
    const tenantId = req.tenantId;
    
    const seller = await sellerModel.update(id, {
      name,
      email,
      avatar,
      monthly_target,
      active
    }, tenantId);
    
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Vendedor não encontrado' });
    }
    
    res.json({ success: true, data: seller });
  } catch (err) {
    console.error('[sellersRoutes] Erro ao atualizar vendedor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/sellers/:id - Deletar vendedor
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    // Verificar se o ID é um UUID válido
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ success: false, error: 'ID de vendedor inválido' });
    }
    
    const seller = await sellerModel.delete(id, tenantId);
    
    if (!seller) {
      return res.status(404).json({ success: false, error: 'Vendedor não encontrado' });
    }
    
    res.json({ success: true, data: seller, message: 'Vendedor deletado com sucesso' });
  } catch (err) {
    console.error('[sellersRoutes] Erro ao deletar vendedor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

