import { apiRequest } from './api.js';

export const getServiceTypes = async () =>
  (await apiRequest('/api/services/types')).data;

export const getAllServices = async () =>
  (await apiRequest('/api/services')).data;

export const getServicesByClient = async (clientId) =>
  (await apiRequest(`/api/services/client/${clientId}`)).data;

export const createService = async (serviceData) =>
  (await apiRequest('/api/services', {
    method: 'POST',
    body: serviceData,
  })).data;

export const deleteService = async (serviceId, clientId) =>
  (await apiRequest(`/api/services/${serviceId}?client_id=${clientId}`, {
    method: 'DELETE',
  })).data;

export const updateService = async (serviceId, serviceData) =>
  (await apiRequest(`/api/services/${serviceId}`, {
    method: 'PUT',
    body: serviceData,
  })).data;