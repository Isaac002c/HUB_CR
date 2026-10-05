import { apiRequest } from './api.js';

const B = '/api/master';

export const getOverview      = async ()         => (await apiRequest(`${B}/overview`)).data;
export const getTenants       = async ()         => (await apiRequest(`${B}/tenants`)).data;
export const getTenantUsers   = async (id)       => (await apiRequest(`${B}/tenants/${id}/users`)).data;
export const createTenant     = async (data)     => (await apiRequest(`${B}/tenants`, { method: 'POST', body: data })).data;
export const setTenantStatus  = async (id, status) => (await apiRequest(`${B}/tenants/${id}/status`, { method: 'PATCH', body: { status } })).data;
export const updateTenant     = async (id, data) => (await apiRequest(`${B}/tenants/${id}`, { method: 'PUT', body: data })).data;
export const deleteTenant     = async (id)       => (await apiRequest(`${B}/tenants/${id}`, { method: 'DELETE' })).data;
export const createTenantUser = async (id, data) => (await apiRequest(`${B}/tenants/${id}/users`, { method: 'POST', body: data })).data;
export const resetUserPassword = async (id)      => (await apiRequest(`${B}/users/${id}/reset-password`, { method: 'POST' })).data;
export const updateTenantUser = async (id, data) => (await apiRequest(`${B}/users/${id}`, { method: 'PUT', body: data })).data;
export const deleteTenantUser = async (id)       => (await apiRequest(`${B}/users/${id}`, { method: 'DELETE' })).data;
