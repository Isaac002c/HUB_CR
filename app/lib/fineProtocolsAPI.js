import { apiRequest } from './api.js';

const BASE = '/api/fine-protocols';

export const listByFine = async (fineId) =>
  (await apiRequest(`${BASE}?fine_id=${fineId}`)).data;

export const createProtocol = async (data) =>
  (await apiRequest(BASE, { method: 'POST', body: data })).data;

export const updateProtocol = async (id, data) =>
  (await apiRequest(`${BASE}/${id}`, { method: 'PATCH', body: data })).data;

export const deleteProtocol = async (id) =>
  (await apiRequest(`${BASE}/${id}`, { method: 'DELETE' })).data;

export const sendProtocolEmail = async (id) =>
  (await apiRequest(`${BASE}/${id}/send-email`, { method: 'POST' })).data;

export const getProtocolEmailHistory = async (fineId) =>
  (await apiRequest(`${BASE}/fine/${fineId}/email-history`)).data;
