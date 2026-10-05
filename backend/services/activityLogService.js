// services/activityLogService.js
// Serviço centralizado para logging de atividades

const saasModel = require('../models/saasModels');

/**
 * Criar log de atividade
 * @param {Object} params - Parâmetros do log
 * @param {string} params.tenant_id - ID do tenant
 * @param {string} params.user_id - ID do usuário
 * @param {string} params.action - Ação (create, update, delete, login, etc)
 * @param {string} params.entity_type - Tipo de entidade (contract, client, document, user)
 * @param {string} params.entity_id - ID da entidade
 * @param {string} params.description - Descrição da ação
 * @param {Object} params.metadata - Metadados adicionais (dados antigos, novos, etc)
 * @param {string} params.ip_address - Endereço IP do usuário
 */
const logActivity = async ({ 
  tenant_id, 
  user_id, 
  action, 
  entity_type, 
  entity_id, 
  description, 
  metadata = {},
  ip_address = null 
}) => {
  try {
    const result = await saasModel.createActivityLog({
      tenant_id,
      user_id,
      action,
      entity_type,
      entity_id,
      description,
      metadata,
      ip_address
    });
    return result;
  } catch (error) {
    // Não bloqueia a operação principal se o log falhar
    console.error('[ActivityLog] Erro ao criar log:', error.message);
    return null;
  }
};

/**
 * Log de criação
 */
const logCreate = async (tenantId, userId, entityType, entityId, description, data = {}) => {
  return logActivity({
    tenant_id: tenantId,
    user_id: userId,
    action: 'create',
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata: { new_data: data }
  });
};

/**
 * Log de atualização
 */
const logUpdate = async (tenantId, userId, entityType, entityId, description, oldData = {}, newData = {}) => {
  return logActivity({
    tenant_id: tenantId,
    user_id: userId,
    action: 'update',
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata: { 
      old_data: oldData,
      new_data: newData,
      changes: getChanges(oldData, newData)
    }
  });
};

/**
 * Log de exclusão
 */
const logDelete = async (tenantId, userId, entityType, entityId, description, deletedData = {}) => {
  return logActivity({
    tenant_id: tenantId,
    user_id: userId,
    action: 'delete',
    entity_type: entityType,
    entity_id: entityId,
    description,
    metadata: { deleted_data: deletedData }
  });
};

/**
 * Log de visualização/acesso
 */
const logAccess = async (tenantId, userId, entityType, entityId, description) => {
  return logActivity({
    tenant_id: tenantId,
    user_id: userId,
    action: 'read',
    entity_type: entityType,
    entity_id: entityId,
    description
  });
};

/**
 * Log genérico
 */
const logGeneric = async (tenantId, userId, action, entityType, description, metadata = {}) => {
  return logActivity({
    tenant_id: tenantId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: null,
    description,
    metadata
  });
};

/**
 * Helper para identificar mudanças entre dados antigos e novos
 */
const getChanges = (oldData, newData) => {
  const changes = {};
  
  for (const key in newData) {
    if (JSON.stringify(oldData[key]) !== JSON.stringify(newData[key])) {
      changes[key] = {
        from: oldData[key],
        to: newData[key]
      };
    }
  }
  
  return changes;
};

module.exports = {
  logActivity,
  logCreate,
  logUpdate,
  logDelete,
  logAccess,
  logGeneric,
  getChanges
};

