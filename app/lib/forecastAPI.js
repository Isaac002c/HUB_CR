import { apiRequest } from './api.js';

export const forecastAPI = {
  // GET /api/forecast/config
  getConfig: async () =>
    (await apiRequest('/api/forecast/config')).data || [],

  // PUT /api/forecast/config
  updateConfig: async (probabilities) =>
    await apiRequest('/api/forecast/config', {
      method: 'PUT',
      body: { probabilities }
    }),

  // POST /api/forecast/config/reset
  resetConfig: async () =>
    await apiRequest('/api/forecast/config/reset', {
      method: 'POST',
    }),

  // GET /api/forecast/calculate
  calculate: async () =>
    (await apiRequest('/api/forecast/calculate')).data || null,
};

export default forecastAPI;
