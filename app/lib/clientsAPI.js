import { apiRequest } from './api.js';
 
// ============================================
// CLIENTS API - Standardized
// ============================================
 
// Listar todos os clientes
export const getClients = async () => {
  const data = await apiRequest('/api/clients');
  return data.data;
};
 
// Buscar cliente por ID
export const getClientById = async (id) => {
  const data = await apiRequest(`/api/clients/${id}`);
  return data.data;
};
 
// Pesquisar clientes
export const searchClients = async (query) => {
  const data = await apiRequest(`/api/clients/search?q=${encodeURIComponent(query)}`);
  return data.data;
};
 
// Estatísticas de clientes
export const getClientStats = async () => {
  const data = await apiRequest('/api/clients/stats');
  return data.data;
};
 
// Criar cliente
export const createClient = async (clientData) => {
  const data = await apiRequest('/api/clients', {
    method: 'POST',
    body: clientData, // ← sem JSON.stringify, o api.js já faz isso
  });
  return data.data;
};
 
// Atualizar cliente
export const updateClient = async (id, clientData) => {
  const data = await apiRequest(`/api/clients/${id}`, {
    method: 'PUT',
    body: clientData, // ← sem JSON.stringify, o api.js já faz isso
  });
  return data.data;
};
 
// Deletar cliente
export const deleteClient = async (id) => {
  const data = await apiRequest(`/api/clients/${id}`, {
    method: 'DELETE',
  });
  return data.data;
};
 