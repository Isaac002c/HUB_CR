import { apiRequest } from './api.js';

const BASE = '/api/approvals';

export const requestDeletion = async ({ target_type, target_id, target_label, reason }) =>
  (await apiRequest(BASE, { method: 'POST', body: { target_type, target_id, target_label, reason } })).data;

export const listApprovals = async (status) =>
  (await apiRequest(`${BASE}${status ? `?status=${status}` : ''}`)).data;

export const approveRequest = async (id) =>
  (await apiRequest(`${BASE}/${id}/approve`, { method: 'PATCH' })).data;

export const rejectRequest = async (id) =>
  (await apiRequest(`${BASE}/${id}/reject`, { method: 'PATCH' })).data;

export const archiveOldLeads = async () =>
  (await apiRequest('/api/multas-leads/archive-old', { method: 'POST' })).data;
