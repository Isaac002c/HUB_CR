const express = require('express');
const router = express.Router();
const forecastModel = require('../models/forecastModels');
const leadModel = require('../models/leadModels');

// GET /api/forecast/config - Buscar configuração de forecast
router.get('/config', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = await forecastModel.getForecastConfig(tenantId);
    res.json({ success: true, data: config });
  } catch (err) {
    console.error('Erro ao buscar config de forecast:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/forecast/config - Atualizar configuração de forecast
router.put('/config', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { probabilities } = req.body;
    
    if (!Array.isArray(probabilities)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Array de probabilidades é obrigatório' 
      });
    }
    
    // Validar cada probabilidade
    for (const p of probabilities) {
      if (!p.stage || p.probability === undefined) {
        return res.status(400).json({ 
          success: false, 
          error: 'Cada probabilidade deve ter stage e probability' 
        });
      }
      if (p.probability < 0 || p.probability > 100) {
        return res.status(400).json({ 
          success: false, 
          error: 'Probabilidade deve estar entre 0 e 100' 
        });
      }
    }
    
    const config = await forecastModel.updateForecastConfig(tenantId, probabilities);
    res.json({ success: true, data: config, message: 'Configuração salva com sucesso!' });
  } catch (err) {
    console.error('Erro ao salvar config de forecast:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/forecast/config/reset - Resetar para padrão
router.post('/config/reset', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const config = await forecastModel.resetForecastConfig(tenantId);
    res.json({ success: true, data: config, message: 'Configuração resetada para padrão!' });
  } catch (err) {
    console.error('Erro ao resetar config de forecast:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/forecast/calculate - Calcular forecast com probabilidades customizadas
router.get('/calculate', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userRole = req.userRole || 'seller';
    const sellerId = req.sellerId;
    
    // Filtrar leads conforme role
    const filter = userRole === 'admin' 
      ? { tenantId } 
      : { tenantId, sellerId };
    
    const leads = await leadModel.getLeadsByFilter(filter);
    const config = await forecastModel.getForecastConfig(tenantId);
    
    const forecast = forecastModel.calculateWeightedForecast(leads, config);
    
    res.json({ 
      success: true, 
      data: {
        ...forecast,
        config
      }
    });
  } catch (err) {
    console.error('Erro ao calcular forecast:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

