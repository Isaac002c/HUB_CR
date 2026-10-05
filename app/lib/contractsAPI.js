import { apiRequest } from './api.js';

export const getAllContracts = async () =>
  (await apiRequest('/api/contracts')).data;

export const getContractsByClient = async (clientId) =>
  (await apiRequest(`/api/contracts/client/${clientId}`)).data;

export const getContractsByService = async (serviceId, clientId) =>
  (await apiRequest(`/api/contracts/service/${serviceId}${clientId ? `?client_id=${clientId}` : ''}`)).data;

export const createContract = async (contractData) =>
  (await apiRequest('/api/contracts', { method: 'POST', body: contractData })).data;

export const updateContract = async (id, contractData) =>
  (await apiRequest(`/api/contracts/${id}`, { method: 'PUT', body: contractData })).data;

export const patchContractProtocol = async (id, protocolData) =>
  (await apiRequest(`/api/contracts/${id}/protocol`, { method: 'PATCH', body: protocolData })).data;

export const deleteContract = async (id) =>
  (await apiRequest(`/api/contracts/${id}`, { method: 'DELETE' })).data;

export const getAprsStats = async () =>
  (await apiRequest('/api/contracts/aprs-stats')).data;

export const getContractsByOrgan = async () =>
  (await apiRequest('/api/contracts/by-organ')).data;

export const getContractDashboard = async () =>
  (await apiRequest('/api/contracts/dashboard')).data;

export const getStageClients = async () =>
  (await apiRequest('/api/contracts/stage-clients')).data;

export const getDeadlines = async (days = 30) =>
  (await apiRequest(`/api/contracts/deadlines?days=${days}`)).data;

export const getDeferred = async () =>
  (await apiRequest('/api/contracts/deferred')).data;

export const getRealInfractorAlerts = async () =>
  (await apiRequest('/api/contracts/real-infractor-alerts')).data;

export const updateDeferredImage = async (id, deferredImageUrl) =>
  (await apiRequest(`/api/contracts/${id}/deferred-image`, {
    method: 'PATCH',
    body: { deferred_image_url: deferredImageUrl || null },
  })).data;

export const deleteDeferredImage = async (id) =>
  (await apiRequest(`/api/contracts/${id}/deferred-image`, { method: 'DELETE' })).data;
