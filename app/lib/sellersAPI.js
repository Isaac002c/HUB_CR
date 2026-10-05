import { apiRequest } from './api.js';

// Removed hardcoded localhost - uses apiRequest with NEXT_PUBLIC_API_URL from api.js

// ========== SELLERS API ==========

// Buscar todos os vendedores
export const getSellers = async () =>
  (await apiRequest('/api/sellers')).data || [];

// Buscar vendedores com métricas (para Performance)
export const getSellersWithMetrics = async () =>
  (await apiRequest('/api/sellers/metrics')).data || [];

// Buscar vendedor por ID
export const getSellerById = async (id) =>
  (await apiRequest(`/api/sellers/${id}`)).data;

// Criar vendedor
export const createSeller = async ({ name, email, avatar, monthly_target }) =>
  (await apiRequest('/api/sellers', {
    method: 'POST',
    body: { name, email, avatar, monthly_target },
  })).data;

// Atualizar vendedor
export const updateSeller = async (id, { name, email, avatar, monthly_target, active }) =>
  (await apiRequest(`/api/sellers/${id}`, {
    method: 'PUT',
    body: { name, email, avatar, monthly_target, active },
  })).data;

// Deletar vendedor
export const deleteSeller = async (id) =>
  (await apiRequest(`/api/sellers/${id}`, {
    method: 'DELETE',
  })).data;

const sellersAPI = {
  getSellers,
  getSellersWithMetrics,
  getSellerById,
  createSeller,
  updateSeller,
  deleteSeller
};

export default sellersAPI;
