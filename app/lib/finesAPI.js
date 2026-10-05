import { apiRequest } from './api.js';

// ============================================
// FINES API - Multas V2
// ============================================

// Listar todas as multas
export const getFines = async (filters = {}) => {
  const params = new URLSearchParams(filters).toString();
  return (await apiRequest(`/api/fines${params ? `?${params}` : ''}`)).data;
};

// Buscar multa por ID
export const getFineById = async (id) =>
  (await apiRequest(`/api/fines/${id}`)).data;

// Buscar multas por cliente
export const getFinesByClient = async (clientId) =>
  (await apiRequest(`/api/fines?client_id=${clientId}`)).data;

// Buscar multas por vendedor
export const getFinesBySeller = async (sellerId) =>
  (await apiRequest(`/api/fines/seller/${sellerId}`)).data;

// Estatísticas de multas
export const getFineStats = async () =>
  (await apiRequest('/api/fines/stats')).data;

// Dashboard de multas
export const getFineDashboard = async () =>
  (await apiRequest('/api/fines/dashboard')).data;

// Alertas de multas
export const getFineAlerts = async () =>
  (await apiRequest('/api/fines/alerts')).data;

// Multas urgentes
export const getUrgentFines = async (days = 5) =>
  (await apiRequest(`/api/fines/urgent?days=${days}`)).data;

// Multas aguardando documento
export const getFinesWaitingDocument = async () =>
  (await apiRequest('/api/fines/waiting-document')).data;

// Multas aguardando protocolo
export const getFinesWaitingProtocol = async () =>
  (await apiRequest('/api/fines/waiting-protocol')).data;

// Multas vencidas
export const getOverdueFines = async () =>
  (await apiRequest('/api/fines/overdue')).data;

// Multas por órgão
export const getFinesByOrgan = async () =>
  (await apiRequest('/api/fines/by-organ')).data;

// Multas por vendedor agrupado
export const getFinesBySellerGrouped = async () =>
  (await apiRequest('/api/fines/by-seller')).data;

// Taxa de deferimento
export const getDefermentRate = async () =>
  (await apiRequest('/api/fines/deferment-rate')).data;

// Criar multa
export const createFine = async (fineData) =>
  (await apiRequest('/api/fines', {
    method: 'POST',
    body: fineData,
  })).data;

// Atualizar multa
export const updateFine = async (id, fineData) =>
  (await apiRequest(`/api/fines/${id}`, {
    method: 'PUT',
    body: fineData,
  })).data;

// Atualizar status da multa
export const updateFineStatus = async (id, status) =>
  (await apiRequest(`/api/fines/${id}/status`, {
    method: 'PATCH',
    body: { status },
  })).data;

// Atualizar estágio da multa
export const updateFineStage = async (id, stage) =>
  (await apiRequest(`/api/fines/${id}/stage`, {
    method: 'PATCH',
    body: { stage },
  })).data;

// Deletar multa
export const deleteFine = async (id) =>
  (await apiRequest(`/api/fines/${id}`, {
    method: 'DELETE',
  })).data;

// ============================================
// DOCUMENTOS DAS MULTAS
// ============================================

// Listar documentos de uma multa
export const getFineDocuments = async (fineId, category = null) => {
  const params = category ? `?category=${category}` : '';
  return (await apiRequest(`/api/fines/${fineId}/documents${params}`)).data;
};

// Adicionar documento
export const addFineDocument = async (fineId, documentData) =>
  (await apiRequest(`/api/fines/${fineId}/documents`, {
    method: 'POST',
    body: documentData,
  })).data;

// Deletar documento
export const deleteFineDocument = async (fineId, documentId) =>
  (await apiRequest(`/api/fines/${fineId}/documents/${documentId}`, {
    method: 'DELETE',
  })).data;

// ============================================
// LOGS DAS MULTAS
// ============================================

// Listar logs de uma multa
export const getFineLogs = async (fineId) =>
  (await apiRequest(`/api/fines/${fineId}/logs`)).data;

// Listar todos os logs
export const getAllFineLogs = async (limit = 100, offset = 0) =>
  (await apiRequest(`/api/fines/logs/all?limit=${limit}&offset=${offset}`)).data;

// ============================================
// CONSTANTES
// ============================================

export const FINE_STATUS = {
  PENDENTE: 'pendente',
  AGUARDANDO_DOCUMENTO: 'aguardando_documento',
  PROTOCOLADO: 'protocolado',
  DEFERIDO: 'deferido',
  INDEFERIDO: 'indeferido',
  CANCELADO: 'cancelado',
};

export const FINE_STAGE = {
  CADASTRO: 'cadastro',
  DEFESA_PREVIA: 'defesa_previa',
  RECURSO_1: 'recurso_1',
  RECURSO_2: 'recurso_2',
  FINALIZADO: 'finalizado',
};

export const FINE_STAGE_LABELS = {
  cadastro: 'Cadastro',
  defesa_previa: 'Defesa Prévia',
  recurso_1: 'Recurso 1ª Instância',
  recurso_2: 'Recurso 2ª Instância',
  finalizado: 'Finalizado',
};

export const FINE_STATUS_LABELS = {
  pendente: 'Pendente',
  aguardando_documento: 'Aguardando Documento',
  protocolado: 'Protocolado',
  deferido: 'Deferido',
  indeferido: 'Indeferido',
  cancelado: 'Cancelado',
};

export const DOCUMENT_CATEGORIES = {
  DEFESA: 'defesa',
  RECURSO: 'recurso',
  COMPROVANTE: 'comprovante',
  OUTRO: 'outro',
};