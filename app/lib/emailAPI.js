import { apiRequest } from './api.js';

const BASE = '/api/emails';

export const getEmailDashboard = async () =>
  (await apiRequest(`${BASE}/dashboard`)).data;

export const sendTestEmail = async () =>
  (await apiRequest(`${BASE}/test`, { method: 'POST' })).data;

export const retryEmail = async (id) =>
  (await apiRequest(`${BASE}/${id}/retry`, { method: 'POST' })).data;

export const getEmailStatus = async (id) =>
  (await apiRequest(`${BASE}/${id}`)).data;
