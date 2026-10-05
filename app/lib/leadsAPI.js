import { apiRequest } from './api.js';

// Função para obter informações do usuário logado (inclui role)
export const getCurrentUser = async () =>
  await apiRequest('/auth/validate', { method: 'POST' });

export const leadsAPI = {
  // GET /api/leads
  getAll: async () =>
    (await apiRequest('/api/leads')).data || [],

  // GET /api/leads/stats
  getStats: async () =>
    (await apiRequest('/api/leads/stats')).data || { total: 0, byStatus: [], bySource: [] },

  // GET /api/leads/pipeline
  getPipelineMetrics: async () =>
    (await apiRequest('/api/leads/pipeline')).data,

  // GET /api/leads/monthly
  getMonthlyMetrics: async (months = 12) =>
    (await apiRequest(`/api/leads/monthly?months=${months}`)).data || [],

  // GET /api/leads/inactive/:days
  getInactiveLeads: async (days = 7) =>
    (await apiRequest(`/api/leads/inactive/${days}`)).data || [],

  // GET /api/leads/:id
  getById: async (id) =>
    (await apiRequest(`/api/leads/${id}`)).data,

  // POST /api/leads
  create: async (leadData) =>
    (await apiRequest('/api/leads', {
      method: 'POST',
      body: leadData,
    })).data,

  // PUT /api/leads/:id
  update: async (id, leadData) =>
    (await apiRequest(`/api/leads/${id}`, {
      method: 'PUT',
      body: leadData,
    })).data,

  // DELETE /api/leads/:id
  delete: async (id) =>
    (await apiRequest(`/api/leads/${id}`, {
      method: 'DELETE',
    })).data,
};

export default leadsAPI;
