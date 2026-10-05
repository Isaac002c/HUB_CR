const express = require('express');
const router = express.Router();
const documentModel = require('../models/documentModels');
const companyModel = require('../models/companyModels');
const vehicleModel = require('../models/companyVehicleModels');
const { requireAdmin } = require('../middlewares/checkPermission');

// Renomear documento — utilitários de validação (nome de exibição apenas).
// Caracteres proibidos em nome de arquivo: \ / : * ? " < > |
const FORBIDDEN_NAME_CHARS = /[\\/:*?"<>|]/;
// Extensão = último ".algo" de 1 a 8 alfanuméricos (ex.: ".pdf", ".jpeg").
const getExtension = (name) => {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || '');
  return m ? m[0] : '';
};

// Garante que a empresa/veículo informado pertence ao tenant autenticado.
// Retorna { ok:true } ou { ok:false, status, error } para resposta controlada.
async function assertOwnership({ company_id, vehicle_id, tenantId }) {
  if (company_id) {
    const company = await companyModel.getCompanyById(company_id, tenantId);
    if (!company) return { ok: false, status: 404, error: 'Empresa não encontrada' };
  }
  if (vehicle_id) {
    const vehicle = await vehicleModel.getById(vehicle_id, tenantId);
    if (!vehicle) return { ok: false, status: 404, error: 'Veículo não encontrado' };
    if (company_id && vehicle.company_id !== company_id) {
      return { ok: false, status: 400, error: 'Veículo não pertence à empresa informada' };
    }
  }
  return { ok: true };
}

// GET /api/documents - Listar documentos (por contrato, cliente, empresa, veículo ou categoria)
router.get('/', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { category, contract_id, client_id, company_id, vehicle_id } = req.query;

    let documents;

    if (contract_id) {
      documents = await documentModel.getDocumentsByContract(contract_id, tenantId);
    } else if (vehicle_id) {
      const own = await assertOwnership({ vehicle_id, tenantId });
      if (!own.ok) return res.status(own.status).json({ success: false, error: own.error });
      documents = await documentModel.getDocumentsByVehicle(vehicle_id, tenantId);
    } else if (company_id) {
      const own = await assertOwnership({ company_id, tenantId });
      if (!own.ok) return res.status(own.status).json({ success: false, error: own.error });
      documents = await documentModel.getDocumentsByCompany(company_id, tenantId);
    } else if (client_id) {
      documents = await documentModel.getDocumentsByClient(client_id, tenantId);
    } else if (category) {
      documents = await documentModel.getDocumentsByCategory(tenantId, category);
    } else {
      documents = await documentModel.getAllDocuments(tenantId);
    }

    res.json({ success: true, data: documents });
  } catch (err) {
    console.error('Erro ao buscar documentos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/documents/stats - Estatísticas de documentos
router.get('/stats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    
    const total = await documentModel.countDocuments(tenantId);
    const byCategory = await documentModel.countDocumentsByCategory(tenantId);
    
    res.json({ 
      success: true, 
      data: { 
        total,
        byCategory 
      } 
    });
  } catch (err) {
    console.error('Erro ao buscar stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/documents/contract/:contractId - Buscar documentos por contrato
router.get('/contract/:contractId', async (req, res) => {
  try {
    const { contractId } = req.params;
    const tenantId = req.tenantId;
    
    const documents = await documentModel.getDocumentsByContract(contractId, tenantId);
    res.json({ success: true, data: documents });
  } catch (err) {
    console.error('Erro ao buscar documentos do contrato:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/documents/client/:clientId - Buscar documentos por cliente
router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenantId;
    
    const documents = await documentModel.getDocumentsByClient(clientId, tenantId);
    res.json({ success: true, data: documents });
  } catch (err) {
    console.error('Erro ao buscar documentos do cliente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/documents/:id - Buscar documento por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    const document = await documentModel.getDocumentById(id, tenantId);
    
    if (!document) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }
    
    res.json({ success: true, data: document });
  } catch (err) {
    console.error('Erro ao buscar documento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/documents - Criar novo documento
router.post('/', async (req, res) => {
  try {
    const {
      contract_id, client_id, company_id, vehicle_id, file_url, file_name,
      file_type, file_size, category, description
    } = req.body;
    const tenantId = req.tenantId;
    const userId = req.userId;

    if (!file_url) {
      return res.status(400).json({ success: false, error: 'URL do arquivo é obrigatória' });
    }

    if (!file_name) {
      return res.status(400).json({ success: false, error: 'Nome do arquivo é obrigatório' });
    }

    // Empresa/veículo (quando informados) precisam pertencer ao tenant.
    if (company_id || vehicle_id) {
      const own = await assertOwnership({ company_id, vehicle_id, tenantId });
      if (!own.ok) return res.status(own.status).json({ success: false, error: own.error });
    }

    const document = await documentModel.createDocument({
      tenant_id: tenantId,
      contract_id,
      client_id,
      company_id,
      vehicle_id,
      file_url,
      file_name,
      file_type,
      file_size,
      category: category || 'outros',
      description,
      uploaded_by: userId
    });
    
    res.status(201).json({ success: true, data: document });
  } catch (err) {
    console.error('Erro ao criar documento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/documents/:id - Atualizar documento
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { file_url, file_name, file_type, file_size, category, description } = req.body;
    const tenantId = req.tenantId;
    
    const existingDocument = await documentModel.getDocumentById(id, tenantId);
    
    if (!existingDocument) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }
    
    const document = await documentModel.updateDocument(id, {
      file_url,
      file_name,
      file_type,
      file_size,
      category,
      description
    }, tenantId);
    
    res.json({ success: true, data: document });
  } catch (err) {
    console.error('Erro ao atualizar documento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/documents/:id/rename - Renomear SOMENTE o nome de exibição (file_name).
// Não altera arquivo físico, file_url, id, datas, vínculos, categoria ou permissões.
// Acessível a qualquer usuário autenticado do tenant (inclui consultor/seller) — mesmo
// nível de POST (upload) e PUT (update completo), que já não exigem permissão. O rename é
// validado e auditado, então é a via MAIS segura de editar o nome do que o PUT cru.
// O router já está atrás de tenantContext (app.js), então não há acesso anônimo.
router.patch('/:id/rename', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    const userId = req.userId;
    const { display_name } = req.body;

    // Documento precisa existir e pertencer ao tenant do usuário logado.
    // (raw: sem JOIN com contracts, que tem coluna inexistente nesta base)
    const existing = await documentModel.getDocumentByIdRaw(id, tenantId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }

    // --- Validação (backend é a fonte de verdade; não confiar só no front) ---
    if (typeof display_name !== 'string') {
      return res.status(400).json({ success: false, error: 'Nome inválido' });
    }
    let base = display_name.trim();

    // Extensão atual (imutável): preferir a do file_name; se faltar, a do arquivo armazenado.
    const ext = getExtension(existing.file_name) || getExtension(existing.file_url);
    // Se o usuário digitou a MESMA extensão no fim, remove para não duplicar.
    if (ext && base.toLowerCase().endsWith(ext.toLowerCase())) {
      base = base.slice(0, base.length - ext.length).trim();
    }

    if (!base) {
      return res.status(400).json({ success: false, error: 'O nome não pode ficar vazio.' });
    }
    if (base.length > 120) {
      return res.status(400).json({ success: false, error: 'O nome deve ter no máximo 120 caracteres.' });
    }
    if (FORBIDDEN_NAME_CHARS.test(base)) {
      return res.status(400).json({ success: false, error: 'O nome não pode conter: \\ / : * ? " < > |' });
    }
    // Precisa ter ao menos uma letra ou número (não só pontos/espaços/símbolos). Acentos preservados.
    if (!/[\p{L}\p{N}]/u.test(base)) {
      return res.status(400).json({ success: false, error: 'O nome precisa ter ao menos uma letra ou número.' });
    }

    const newName = base + ext;       // extensão original reanexada (nunca trocada)
    const oldName = existing.file_name || '';

    // Sem mudança real → devolve sem gravar log duplicado.
    if (newName === oldName) {
      return res.json({ success: true, data: existing });
    }

    const updated = await documentModel.renameDocument(id, newName, tenantId);

    // Auditoria na tabela canônica activity_logs (não-bloqueante: nunca derruba o rename).
    try {
      await documentModel.logDocumentRename({
        tenant_id: tenantId, user_id: userId, document_id: id, new_name: newName, old_name: oldName,
      });
    } catch (logErr) {
      console.error('Auditoria de rename falhou (não bloqueante):', logErr.message);
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Erro ao renomear documento:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/documents/:id - Deletar documento (apenas admin)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    const document = await documentModel.deleteDocument(id, tenantId);
    
    if (!document) {
      return res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }
    
    res.json({ success: true, data: document, message: 'Documento deletado com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar documento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

