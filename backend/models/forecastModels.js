const pool = require('../config/db');

// Probabilidades padrão
const defaultProbabilities = {
  novo: 10,
  contactado: 20,
  qualificado: 30,
  proposta: 60,
  negociacao: 80,
  ganho: 100
};

// Buscar configuração de forecast por tenant
const getForecastConfig = async (tenantId) => {
  try {
    const result = await pool.query(
      'SELECT * FROM forecast_config WHERE tenant_id = $1 ORDER BY stage',
      [tenantId]
    );
    
    if (result.rows.length === 0) {
      // Retornar probabilidades padrão se não houver configuração
      return Object.entries(defaultProbabilities).map(([stage, probability]) => ({
        stage,
        probability
      }));
    }
    
    return result.rows.map(row => ({
      stage: row.stage,
      probability: parseFloat(row.probability)
    }));
  } catch (err) {
    console.error('[forecastModels] getForecastConfig error:', err);
    // Em caso de erro, retorna padrão
    return Object.entries(defaultProbabilities).map(([stage, probability]) => ({
      stage,
      probability
    }));
  }
};

// Atualizar configuração de forecast
const updateForecastConfig = async (tenantId, configs) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    for (const config of configs) {
      await client.query(
        `INSERT INTO forecast_config (tenant_id, stage, probability, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tenant_id, stage)
         DO UPDATE SET probability = $3, updated_at = NOW()`,
        [tenantId, config.stage, config.probability]
      );
    }
    
    await client.query('COMMIT');
    
    return await getForecastConfig(tenantId);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[forecastModels] updateForecastConfig error:', err);
    throw err;
  } finally {
    client.release();
  }
};

// Resetar para probabilidades padrão
const resetForecastConfig = async (tenantId) => {
  const configs = Object.entries(defaultProbabilities).map(([stage, probability]) => ({
    stage,
    probability
  }));
  
  return await updateForecastConfig(tenantId, configs);
};

// Calcular forecast com probabilidades customizadas
const calculateWeightedForecast = (leads, probabilities) => {
  const probMap = probabilities.reduce((acc, p) => {
    acc[p.stage] = p.probability / 100;
    return acc;
  }, {});
  
  let totalForecast = 0;
  const byStage = {};
  
  for (const lead of leads) {
    const stage = lead.status;
    const value = lead.value || 0;
    const probability = probMap[stage] || defaultProbabilities[stage] / 100;
    
    const weightedValue = value * probability;
    totalForecast += weightedValue;
    
    if (!byStage[stage]) {
      byStage[stage] = {
        count: 0,
        totalValue: 0,
        weightedValue: 0
      };
    }
    
    byStage[stage].count++;
    byStage[stage].totalValue += value;
    byStage[stage].weightedValue += weightedValue;
  }
  
  return {
    totalForecast,
    byStage: Object.entries(byStage).map(([stage, data]) => ({
      stage,
      ...data,
      probability: (probMap[stage] || 0) * 100
    }))
  };
};

module.exports = {
  getForecastConfig,
  updateForecastConfig,
  resetForecastConfig,
  calculateWeightedForecast,
  defaultProbabilities
};

