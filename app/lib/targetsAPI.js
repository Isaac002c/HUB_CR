import { apiRequest } from './api.js';

// ==========================
// TARGETS
// ==========================

export const getTargets = async () =>
  (await apiRequest('/api/targets')).data || [];

export const getTargetsByYear = async (year) =>
  (await apiRequest(`/api/targets/${year}`)).data || [];

export const createTarget = async (data) =>
  (await apiRequest('/api/targets', {
    method: 'POST',
    body: data,
  })).data;

// ==========================
// ACTIVITIES
// ==========================

export const getAllActivities = async () =>
  (await apiRequest('/api/targets/activities')).data || [];

export const getOverdueActivities = async () =>
  (await apiRequest('/api/targets/activities/overdue')).data || [];

export const getUpcomingActivities = async () =>
  (await apiRequest('/api/targets/activities/upcoming')).data || [];

export const getInactiveLeads = async (days = 7) =>
  (await apiRequest(`/api/targets/activities/inactive/${days}`)).data || [];

export const getActivityStats = async () =>
  (await apiRequest('/api/targets/activities/stats')).data;

export const getLeadActivities = async (leadId) =>
  (await apiRequest(`/api/targets/activities/lead/${leadId}`)).data || [];

export const createActivity = async (data) =>
  (await apiRequest('/api/targets/activities', {
    method: 'POST',
    body: data,
  })).data;

export const completeActivity = async (id) =>
  (await apiRequest(`/api/targets/activities/${id}/complete`, {
    method: 'PUT',
  })).data;

export const updateActivity = async (id, data) =>
  (await apiRequest(`/api/targets/activities/${id}`, {
    method: 'PUT',
    body: data,
  })).data;

export const deleteActivity = async (id) =>
  (await apiRequest(`/api/targets/activities/${id}`, {
    method: 'DELETE',
  })).data;

// Default export agregando os métodos nomeados (consumido como `import targetsAPI from ...`)
const targetsAPI = {
  getTargets,
  getTargetsByYear,
  createTarget,
  getAllActivities,
  getOverdueActivities,
  getUpcomingActivities,
  getInactiveLeads,
  getActivityStats,
  getLeadActivities,
  createActivity,
  completeActivity,
  updateActivity,
  deleteActivity,
};

export default targetsAPI;
