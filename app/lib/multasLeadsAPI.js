import { apiRequest } from './api.js';

const BASE = '/api/multas-leads';

export const getMultasLeads = async () =>
  (await apiRequest(BASE)).data;

// Kanban: aplica a regra de ocultação 7/30 (não afeta a listagem completa)
export const getKanbanLeads = async () =>
  (await apiRequest(`${BASE}/kanban`)).data;

export const getMultasLeadsStats = async () =>
  (await apiRequest(`${BASE}/stats`)).data;

export const createMultasLead = async (data) =>
  (await apiRequest(BASE, { method: 'POST', body: data })).data;

export const updateMultasLead = async (id, data) =>
  (await apiRequest(`${BASE}/${id}`, { method: 'PUT', body: data })).data;

export const updateMultasLeadStatus = async (id, status) =>
  (await apiRequest(`${BASE}/${id}/status`, { method: 'PATCH', body: { status } })).data;

export const deleteMultasLead = async (id) =>
  (await apiRequest(`${BASE}/${id}`, { method: 'DELETE' })).data;
