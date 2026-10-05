import { apiRequest, downloadApiFile } from './api.js';

// ── Matriz de acesso do usuário (mesma regra do backend) ─────────────────────
export const getMyAccess = async () =>
  (await apiRequest('/api/me/access')).data;

// ── Visão geral / ranking / evolução ─────────────────────────────────────────
export const getOverview = async (params = {}) =>
  (await apiRequest(`/api/management/overview${qs(params)}`)).data;

export const getRanking = async (params = {}) =>
  (await apiRequest(`/api/management/ranking${qs(params)}`)).data;

export const getMonthlyEvolution = async (params = {}) =>
  (await apiRequest(`/api/management/monthly-evolution${qs(params)}`)).data;

// ── Painel individual ───────────────────────────────────────────────────────
export const getPersonalNote = async () =>
  (await apiRequest('/api/management/personal-note')).data;

export const updatePersonalNote = async (note) =>
  (await apiRequest('/api/management/personal-note', { method: 'PUT', body: { note } })).data;

// ── Equipes ──────────────────────────────────────────────────────────────────
export const getTeams = async () =>
  (await apiRequest('/api/management/teams')).data;

export const createTeam = async (body) =>
  (await apiRequest('/api/management/teams', { method: 'POST', body })).data;

export const updateTeam = async (id, body) =>
  (await apiRequest(`/api/management/teams/${id}`, { method: 'PUT', body })).data;

export const deleteTeam = async (id) =>
  (await apiRequest(`/api/management/teams/${id}`, { method: 'DELETE' }));

export const getTeamClosing = async (id, params = {}) =>
  (await apiRequest(`/api/management/team/${id}${qs(params)}`)).data;

export const getTeamTargets = async (params = {}) =>
  (await apiRequest(`/api/management/team-targets${qs(params)}`)).data;

export const updateTeamTarget = async (id, body) =>
  (await apiRequest(`/api/management/teams/${id}/target`, { method: 'PUT', body })).data;

export const getManagementTargets = async (params = {}) =>
  (await apiRequest(`/api/management/targets${qs(params)}`)).data;

export const updateCompanyTarget = async (body) =>
  (await apiRequest('/api/management/targets/company', { method: 'PUT', body })).data;

export const updateUserTarget = async (id, body) =>
  (await apiRequest(`/api/management/targets/users/${id}`, { method: 'PUT', body })).data;

// ── Colaboradores ────────────────────────────────────────────────────────────
export const getCollaborators = async (params = {}) =>
  (await apiRequest(`/api/management/collaborators${qs(params)}`)).data;

export const getCollaboratorDetail = async (id, params = {}) =>
  (await apiRequest(`/api/management/collaborators/${id}/detail${qs(params)}`)).data;

export const updateCollaborator = async (id, body) =>
  (await apiRequest(`/api/management/collaborators/${id}`, { method: 'PUT', body })).data;

export const getWorkforceSummary = async (params = {}) =>
  (await apiRequest(`/api/management/workforce-summary${qs(params)}`)).data;

export const getCollaboratorCosts = async (params = {}) =>
  (await apiRequest(`/api/management/collaborator-costs${qs(params)}`)).data;

export const createCollaboratorCost = async (body) =>
  (await apiRequest('/api/management/collaborator-costs', { method: 'POST', body })).data;

export const setMonthlyTransport = async (id, body) =>
  (await apiRequest(`/api/management/collaborators/${id}/monthly-transport`, { method: 'PUT', body })).data;

export const updateCollaboratorCost = async (id, body) =>
  (await apiRequest(`/api/management/collaborator-costs/${id}`, { method: 'PUT', body })).data;

export const deleteCollaboratorCost = async (id) =>
  (await apiRequest(`/api/management/collaborator-costs/${id}`, { method: 'DELETE' }));

export const getOfficeExpenses = async (params = {}) =>
  (await apiRequest(`/api/management/office-expenses${qs(params)}`)).data;

export const createOfficeExpense = async (body) =>
  (await apiRequest('/api/management/office-expenses', { method: 'POST', body })).data;

export const updateOfficeExpense = async (id, body) =>
  (await apiRequest(`/api/management/office-expenses/${id}`, { method: 'PUT', body })).data;

export const deleteOfficeExpense = async (id) =>
  (await apiRequest(`/api/management/office-expenses/${id}`, { method: 'DELETE' }));

export const createCommissionTier = async (collaboratorId, body) =>
  (await apiRequest(`/api/management/collaborators/${collaboratorId}/commission-tiers`, { method: 'POST', body })).data;

export const updateCommissionTier = async (id, body) =>
  (await apiRequest(`/api/management/commission-tiers/${id}`, { method: 'PUT', body })).data;

export const deleteCommissionTier = async (id) =>
  (await apiRequest(`/api/management/commission-tiers/${id}`, { method: 'DELETE' }));

// ── Vendas ───────────────────────────────────────────────────────────────────
export const getSales = async (params = {}) =>
  (await apiRequest(`/api/management/sales${qs(params)}`)).data;

export const getSalesResponsibles = async () =>
  (await apiRequest('/api/management/sales/responsibles')).data;

export const getInstallmentFollowUps = async (params = {}) =>
  (await apiRequest(`/api/management/sales/installments${qs(params)}`)).data;

export const updateInstallmentSchedule = async (planId, body) =>
  (await apiRequest(`/api/management/sales/installments/${planId}`, { method: 'PATCH', body })).data;

export const exportSalesWorkbook = async (params = {}) =>
  downloadApiFile(`/api/management/sales/export${qs(params)}`, 'CR-Recursos-Vendas.xlsx');

export const createSale = async (body) =>
  (await apiRequest('/api/management/sales', { method: 'POST', body })).data;

export const updateSale = async (id, body) =>
  (await apiRequest(`/api/management/sales/${id}`, { method: 'PUT', body })).data;

export const deleteSale = async (id) =>
  (await apiRequest(`/api/management/sales/${id}`, { method: 'DELETE' }));

// ── Helpers ──────────────────────────────────────────────────────────────────
function qs(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}
