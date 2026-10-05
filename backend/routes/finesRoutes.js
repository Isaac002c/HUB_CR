const express = require('express');
const router = express.Router();
const fineModel = require('../models/fineModels');
const fineDocumentModel = require('../models/fineDocumentModels');
const fineLogModel = require('../models/fineLogModels');
const { checkPermission } = require('../middlewares/checkPermission');
 
// ============================================
// ROTAS DE MULTAS (FINES)
// ============================================
 
// GET /api/fines - Listar todas as multas
router.get('/', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { status, stage, organ, plate, client_id, seller_id, due_date_from, due_date_to } = req.query;
    
    const filters = {};
    if (status) filters.status = status;
    if (stage) filters.stage = stage;
    if (organ) filters.organ = organ;
    if (plate) filters.plate = plate;
    if (client_id) filters.client_id = client_id;
    if (seller_id) filters.seller_id = seller_id;
    if (due_date_from) filters.due_date_from = due_date_from;
    if (due_date_to) filters.due_date_to = due_date_to;
    
    const fines = await fineModel.getFinesByFilter(tenantId, filters);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/stats - Estatísticas de multas
router.get('/stats', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const [byStatus, byStage, dashboard] = await Promise.all([
      fineModel.getFinesByStatus(tenantId),
      fineModel.getDashboardStats(tenantId),
      fineModel.getDashboardStats(tenantId)
    ]);
    
    res.json({ 
      success: true, 
      data: { 
        byStatus, 
        byStage,
        dashboard 
      } 
    });
  } catch (err) {
    console.error('Erro ao buscar stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/dashboard - Dashboard stats
router.get('/dashboard', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const [dashboard, alerts, byOrgan, bySeller, defermentRate, urgentFines] = await Promise.all([
      fineModel.getDashboardStats(tenantId),
      fineModel.getAlerts(tenantId),
      fineModel.getFinesGroupedByOrgan(tenantId),
      fineModel.getFinesGroupedBySeller(tenantId),
      fineModel.getDefermentRate(tenantId),
      fineModel.getUrgentFines(tenantId, 5)
    ]);
    
    res.json({ 
      success: true, 
      data: { 
        dashboard,
        alerts,
        byOrgan,
        bySeller,
        defermentRate,
        urgentFines
      } 
    });
  } catch (err) {
    console.error('Erro ao buscar dashboard:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/alerts - Alertas de multas
router.get('/alerts', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const alerts = await fineModel.getAlerts(tenantId);
    res.json({ success: true, data: alerts });
  } catch (err) {
    console.error('Erro ao buscar alertas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/urgent - Multas urgentes
router.get('/urgent', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { days } = req.query;
    const fines = await fineModel.getUrgentFines(tenantId, parseInt(days) || 5);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas urgentes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/waiting-document - Multas aguardando documento
router.get('/waiting-document', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const fines = await fineModel.getFinesWaitingDocument(tenantId);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas aguardando documento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/waiting-protocol - Multas aguardando protocolo
router.get('/waiting-protocol', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const fines = await fineModel.getFinesWaitingProtocol(tenantId);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas aguardando protocolo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/overdue - Multas vencidas
router.get('/overdue', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const fines = await fineModel.getOverdueFines(tenantId);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas vencidas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/by-organ - Multas agrupadas por órgão
router.get('/by-organ', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const fines = await fineModel.getFinesGroupedByOrgan(tenantId);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas por órgão:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/by-seller - Multas agrupadas por vendedor
router.get('/by-seller', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const fines = await fineModel.getFinesGroupedBySeller(tenantId);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas por vendedor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/deferment-rate - Taxa de deferimento
router.get('/deferment-rate', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const rate = await fineModel.getDefermentRate(tenantId);
    res.json({ success: true, data: rate });
  } catch (err) {
    console.error('Erro ao buscar taxa de deferimento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ============================================
// ROTA DE LOGS GLOBAIS - DEVE VIR ANTES DE /:id
// ============================================
 
// GET /api/fines/logs/all - Listar todos os logs
router.get('/logs/all', checkPermission('fines:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { limit, offset } = req.query;
    
    const logs = await fineLogModel.getAllLogs(tenantId, parseInt(limit) || 100, parseInt(offset) || 0);
    const total = await fineLogModel.countLogs(tenantId);
    
    res.json({ success: true, data: logs, total });
  } catch (err) {
    console.error('Erro ao buscar logs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/client/:clientId - Buscar multas por cliente
router.get('/client/:clientId', checkPermission('fines:read'), async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenantId;
    
    const fines = await fineModel.getFinesByClient(clientId, tenantId);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas do cliente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// GET /api/fines/seller/:sellerId - Buscar multas por vendedor
router.get('/seller/:sellerId', checkPermission('fines:read'), async (req, res) => {
  try {
    const { sellerId } = req.params;
    const tenantId = req.tenantId;
    
    const fines = await fineModel.getFinesBySeller(sellerId, tenantId);
    res.json({ success: true, data: fines });
  } catch (err) {
    console.error('Erro ao buscar multas do vendedor:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ============================================
// ROTAS COM :id - SEMPRE POR ÚLTIMO
// ============================================
 
// GET /api/fines/:id - Buscar multa por ID
router.get('/:id', checkPermission('fines:read'), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    const fine = await fineModel.getFineById(id, tenantId);
    
    if (!fine) {
      return res.status(404).json({ success: false, error: 'Multa não encontrada' });
    }
    
    // Buscar documentos e logs
    const [documents, logs] = await Promise.all([
      fineDocumentModel.getDocumentsByFine(id, tenantId),
      fineLogModel.getLogsByFine(id, tenantId)
    ]);
    
    res.json({ 
      success: true, 
      data: { 
        ...fine,
        documents,
        logs
      } 
    });
  } catch (err) {
    console.error('Erro ao buscar multa:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// POST /api/fines - Criar nova multa
router.post('/', checkPermission('fines:create'), async (req, res) => {
  try {
    const { 
      client_id, fine_number, plate, organ, infraction_type, vehicle_model,
      infraction_date, due_date, defense_date, stage, status,
      value, cost, paid_value, seller_id, notes
    } = req.body;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    if (!client_id) {
      return res.status(400).json({ success: false, error: 'Cliente é obrigatório' });
    }
    
    if (!organ) {
      return res.status(400).json({ success: false, error: 'Órgão é obrigatório' });
    }
    
    const fine = await fineModel.createFine({
      tenant_id: tenantId,
      client_id,
      fine_number,
      plate,
      organ,
      infraction_type,
      vehicle_model,
      infraction_date,
      due_date,
      defense_date,
      stage: stage || 'cadastro',
      status: status || 'pendente',
      value: value || 0,
      cost: cost || 0,
      paid_value: paid_value || 0,
      seller_id: seller_id || userId,
      notes
    });
    
    // Criar log de criação
    await fineLogModel.createFineLog({
      tenant_id: tenantId,
      fine_id: fine.id,
      action: 'created',
      field_name: 'fine',
      old_value: null,
      new_value: `Multa ${fine_number || 'criada'}`,
      user_id: userId
    });
    
    res.status(201).json({ success: true, data: fine });
  } catch (err) {
    console.error('Erro ao criar multa:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// PUT /api/fines/:id - Atualizar multa
router.put('/:id', checkPermission('fines:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      fine_number, plate, organ, infraction_type, vehicle_model,
      infraction_date, due_date, defense_date, stage, status,
      value, cost, paid_value, seller_id, notes
    } = req.body;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    const existingFine = await fineModel.getFineById(id, tenantId);
    
    if (!existingFine) {
      return res.status(404).json({ success: false, error: 'Multa não encontrada' });
    }
    
    const fine = await fineModel.updateFine(id, {
      fine_number,
      plate,
      organ,
      infraction_type,
      vehicle_model,
      infraction_date,
      due_date,
      defense_date,
      stage,
      status,
      value,
      cost,
      paid_value,
      seller_id,
      notes
    }, tenantId);
    
    // Log de alterações
    if (status && status !== existingFine.status) {
      await fineLogModel.logStatusChange(tenantId, id, existingFine.status, status, userId);
    }
    
    if (stage && stage !== existingFine.stage) {
      await fineLogModel.logStageChange(tenantId, id, existingFine.stage, stage, userId);
    }
    
    res.json({ success: true, data: fine });
  } catch (err) {
    console.error('Erro ao atualizar multa:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// PATCH /api/fines/:id/status - Atualizar status
router.patch('/:id/status', checkPermission('fines:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status é obrigatório' });
    }
    
    const validStatuses = ['pendente', 'aguardando_documento', 'protocolado', 'deferido', 'indeferido', 'cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: 'Status inválido' });
    }
    
    const existingFine = await fineModel.getFineById(id, tenantId);
    
    if (!existingFine) {
      return res.status(404).json({ success: false, error: 'Multa não encontrada' });
    }
    
    const fine = await fineModel.updateFineStatus(id, status, tenantId);
    
    // Log de alteração de status
    await fineLogModel.logStatusChange(tenantId, id, existingFine.status, status, userId);
    
    res.json({ success: true, data: fine });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// PATCH /api/fines/:id/stage - Atualizar estágio
router.patch('/:id/stage', checkPermission('fines:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { stage } = req.body;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    if (!stage) {
      return res.status(400).json({ success: false, error: 'Estágio é obrigatório' });
    }
    
    const validStages = ['cadastro', 'defesa_previa', 'recurso_1', 'recurso_2', 'finalizado'];
    if (!validStages.includes(stage)) {
      return res.status(400).json({ success: false, error: 'Estágio inválido' });
    }
    
    const existingFine = await fineModel.getFineById(id, tenantId);
    
    if (!existingFine) {
      return res.status(404).json({ success: false, error: 'Multa não encontrada' });
    }
    
    const fine = await fineModel.updateFineStage(id, stage, tenantId);
    
    // Log de alteração de estágio
    await fineLogModel.logStageChange(tenantId, id, existingFine.stage, stage, userId);
    
    res.json({ success: true, data: fine });
  } catch (err) {
    console.error('Erro ao atualizar estágio:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// DELETE /api/fines/:id - Deletar multa
router.delete('/:id', checkPermission('fines:delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    const fine = await fineModel.deleteFine(id, tenantId);
    
    if (!fine) {
      return res.status(404).json({ success: false, error: 'Multa não encontrada' });
    }
    
    // Deletar documentos e logs relacionados
    await fineDocumentModel.deleteDocumentsByFine(id, tenantId);
    
    res.json({ success: true, data: fine, message: 'Multa deletada com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar multa:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ============================================
// ROTAS DE DOCUMENTOS DAS MULTAS
// ============================================
 
// GET /api/fines/:fineId/documents - Listar documentos
router.get('/:fineId/documents', checkPermission('fines:read'), async (req, res) => {
  try {
    const { fineId } = req.params;
    const tenantId = req.tenantId;
    const { category } = req.query;
    
    let documents;
    if (category) {
      documents = await fineDocumentModel.getDocumentsByCategory(fineId, category, tenantId);
    } else {
      documents = await fineDocumentModel.getDocumentsByFine(fineId, tenantId);
    }
    
    res.json({ success: true, data: documents });
  } catch (err) {
    console.error('Erro ao buscar documentos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// POST /api/fines/:fineId/documents - Adicionar documento
router.post('/:fineId/documents', checkPermission('fines:update'), async (req, res) => {
  try {
    const { fineId } = req.params;
    const { name, file_url, file_type, file_size, category } = req.body;
    const tenantId = req.tenantId;
    const userId = req.userId;
    
    if (!name || !file_url) {
      return res.status(400).json({ success: false, error: 'Nome e URL do arquivo são obrigatórios' });
    }
    
    const fine = await fineModel.getFineById(fineId, tenantId);
    
    if (!fine) {
      return res.status(404).json({ success: false, error: 'Multa não encontrada' });
    }
    
    const document = await fineDocumentModel.createFineDocument({
      tenant_id: tenantId,
      fine_id: fineId,
      name,
      file_url,
      file_type,
      file_size,
      category: category || 'outro',
      uploaded_by: userId
    });
    
    // Log de documento adicionado
    await fineLogModel.logDocumentAdded(tenantId, fineId, name, userId);
    
    res.status(201).json({ success: true, data: document });
  } catch (err) {
    console.error('Erro ao adicionar documento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// DELETE /api/fines/:fineId/documents/:documentId - Deletar documento
router.delete('/:fineId/documents/:documentId', checkPermission('fines:delete'), async (req, res) => {
  try {
    const { documentId } = req.params;
    const tenantId = req.tenantId;
    
    const document = await fineDocumentModel.deleteFineDocument(documentId, tenantId);
    
    if (!document) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }
    
    res.json({ success: true, data: document, message: 'Documento deletado com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar documento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// ============================================
// ROTAS DE LOGS DAS MULTAS
// ============================================
 
// GET /api/fines/:fineId/logs - Listar logs da multa
router.get('/:fineId/logs', checkPermission('fines:read'), async (req, res) => {
  try {
    const { fineId } = req.params;
    const tenantId = req.tenantId;
    
    const logs = await fineLogModel.getLogsByFine(fineId, tenantId);
    res.json({ success: true, data: logs });
  } catch (err) {
    console.error('Erro ao buscar logs:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
module.exports = router;