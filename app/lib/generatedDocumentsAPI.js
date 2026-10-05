import { apiRequest, downloadApiFile } from './api';

export const getGeneratedDocumentTemplates = async () =>
  (await apiRequest('/api/generated-documents/templates')).data;

export const generateClientDocument = async (clientId, payload) =>
  downloadApiFile(`/api/generated-documents/client/${clientId}`, 'documento.pdf', {
    method: 'POST',
    body: payload,
  });

export const downloadGeneratedDocument = async (documentId, fallbackName = 'contrato.pdf') =>
  downloadApiFile(`/api/generated-documents/${documentId}/download`, fallbackName);
