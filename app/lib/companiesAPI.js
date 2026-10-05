import { apiRequest } from './api.js';

const BASE = '/api/companies';

// Empresas
export const getCompanies = async (q = '') =>
  (await apiRequest(`${BASE}${q ? `?q=${encodeURIComponent(q)}` : ''}`)).data;

export const getCompanyById = async (id) =>
  (await apiRequest(`${BASE}/${id}`)).data;

export const createCompany = async (data) =>
  (await apiRequest(BASE, { method: 'POST', body: data })).data;

export const updateCompany = async (id, data) =>
  (await apiRequest(`${BASE}/${id}`, { method: 'PUT', body: data })).data;

export const setCompanyStatus = async (id, status) =>
  (await apiRequest(`${BASE}/${id}/status`, { method: 'PATCH', body: { status } })).data;

export const deleteCompany = async (id) =>
  (await apiRequest(`${BASE}/${id}`, { method: 'DELETE' })).data;

// Veículos da empresa
export const getVehicles = async (companyId) =>
  (await apiRequest(`${BASE}/${companyId}/vehicles`)).data;

export const createVehicle = async (companyId, data) =>
  (await apiRequest(`${BASE}/${companyId}/vehicles`, { method: 'POST', body: data })).data;

export const updateVehicle = async (companyId, vid, data) =>
  (await apiRequest(`${BASE}/${companyId}/vehicles/${vid}`, { method: 'PUT', body: data })).data;

export const setVehicleStatus = async (companyId, vid, status) =>
  (await apiRequest(`${BASE}/${companyId}/vehicles/${vid}/status`, { method: 'PATCH', body: { status } })).data;

export const deleteVehicle = async (companyId, vid) =>
  (await apiRequest(`${BASE}/${companyId}/vehicles/${vid}`, { method: 'DELETE' })).data;

// Processos/multas da empresa
export const getCompanyFines = async (companyId) =>
  (await apiRequest(`${BASE}/${companyId}/fines`)).data;

// Detalhe de um veículo
export const getVehicleById = async (companyId, vid) =>
  (await apiRequest(`${BASE}/${companyId}/vehicles/${vid}`)).data;

// Contagem leve de processos por veículo (mapa { vehicle_id: total })
export const getVehicleFineCounts = async (companyId) =>
  (await apiRequest(`${BASE}/${companyId}/vehicle-fine-counts`)).data;

// Processos de um veículo (paginado): { items, total, limit, offset }
export const getVehicleFines = async (companyId, vid, { status = '', limit = 25, offset = 0 } = {}) => {
  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  qs.set('limit', limit); qs.set('offset', offset);
  return (await apiRequest(`${BASE}/${companyId}/vehicles/${vid}/fines?${qs.toString()}`)).data;
};

// Processos da empresa sem veículo vinculado
export const getUnlinkedFines = async (companyId) =>
  (await apiRequest(`${BASE}/${companyId}/unlinked-fines`)).data;

// Vincular um processo legado a um veículo (preenche apenas vehicle_id/company_id)
export const linkFineToVehicle = async (companyId, vid, fid) =>
  (await apiRequest(`${BASE}/${companyId}/vehicles/${vid}/fines/${fid}/link`, { method: 'POST' })).data;
