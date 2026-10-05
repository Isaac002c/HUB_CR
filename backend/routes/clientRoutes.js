const express = require('express');
const router = express.Router();
const clientModel = require('../models/clientModels');
const { requireModule, access } = require('../middlewares/authorize');
const {
  normalizeCPF,
  findCpfConflict,
  cpfConflictMessage,
  isCpfConflictDatabaseError,
} = require('../services/cpfIdentityService');
const CLIENT_STATUSES = new Set([
  'entrada', 'possui_defensor', 'nao_quer_defender', 'negociacao',
  'fechado', 'perdido', 'nao_encontrado',
]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Módulo Clientes: master/admin ✅ (tenant), supervisor (equipe), consultor (dono)
router.use(requireModule('clients'));

const clientScope = (req) => {
  const level = access.accessLevel(req.userRole, 'clients');
  if (level === 'full') return {};
  if (level === 'team') return req.teamId ? { teamId: req.teamId } : { ownerId: req.userId };
  return { ownerId: req.userId };
};
const canAccessClient = (req, client) => {
  const level = access.accessLevel(req.userRole, 'clients');
  if (level === 'full') return true;
  if (level === 'own')  return client.created_by === req.userId;
  return client.created_by === req.userId; // team: validação simples
};

// GET /api/clients - Listar clientes (escopo por role)
router.get('/', async (req, res) => {
  try {
    const clients = await clientModel.getAllClients(req.tenantId, clientScope(req));
    res.json({ success: true, data: clients });
  } catch (err) {
    console.error('Erro ao buscar clientes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/clients/search - Pesquisar clientes
router.get('/search', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }
    
    const clients = await clientModel.searchClients(tenantId, q, clientScope(req));
    res.json({ success: true, data: clients });
  } catch (err) {
    console.error('Erro ao pesquisar clientes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/clients/stats - Estatísticas de clientes
router.get('/stats', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const total = await clientModel.countClients(tenantId, clientScope(req));
    res.json({ success: true, data: { total } });
  } catch (err) {
    console.error('Erro ao buscar stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/clients/:id - Buscar cliente por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    const client = await clientModel.getClientById(id, tenantId);

    if (!client) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }

    // Consultor só acessa o que criou (backend, autoritativo — não confia no menu)
    if (!canAccessClient(req, client)) {
      return res.status(403).json({ success: false, error: 'Acesso negado a este cliente' });
    }

    res.json({ success: true, data: client });
  } catch (err) {
    console.error('Erro ao buscar cliente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/clients - Criar novo cliente
router.post('/', async (req, res) => {
  try {
    const { name, birth_date, cpf, cnh, first_cnh, phone, email, address, notes, status } = req.body;
    const tenantId = req.tenantId;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }
    if (status && !CLIENT_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: 'Status comercial inválido' });
    }

    // Normaliza CPF removendo máscara antes de salvar
    const cpfNormalized = cpf ? normalizeCPF(cpf) : null;
    if (cpfNormalized && cpfNormalized.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF deve ter 11 dígitos' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'E-mail inválido' });
    }

    // Verifica a identidade comercial inteira (leads e clientes) no tenant.
    if (cpfNormalized) {
      const conflict = await findCpfConflict({ tenantId, cpf: cpfNormalized });
      if (conflict) {
        return res.status(409).json({ success: false, error: cpfConflictMessage(conflict) });
      }
    }

    const client = await clientModel.createClient({
      tenant_id: tenantId,
      name: name.trim(), birth_date, cpf: cpfNormalized, cnh, first_cnh,
      phone, email, address, notes,
      status: status || 'negociacao',
      created_by: req.userId,
    });

    res.status(201).json({ success: true, data: client });
  } catch (err) {
    console.error('Erro ao criar cliente:', err);
    if (isCpfConflictDatabaseError(err)) {
      return res.status(409).json({ success: false, error: cpfConflictMessage(null) });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/clients/:id - Atualizar cliente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, birth_date, cpf, cnh, first_cnh, phone, email, address, notes, status } = req.body;
    const tenantId = req.tenantId;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }
    if (status && !CLIENT_STATUSES.has(status)) {
      return res.status(400).json({ success: false, error: 'Status comercial inválido' });
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'E-mail inválido' });
    }

    const existingClient = await clientModel.getClientById(id, tenantId);
    if (!existingClient) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }
    if (!canAccessClient(req, existingClient)) {
      return res.status(403).json({ success: false, error: 'Acesso negado a este cliente' });
    }

    const consultantWasSent = Object.prototype.hasOwnProperty.call(req.body, 'consultant_id');
    const requestedConsultantId = req.body.consultant_id || null;
    const changesConsultant = consultantWasSent && requestedConsultantId !== existingClient.created_by;
    if (changesConsultant) {
      if (existingClient.status !== 'fechado') {
        return res.status(400).json({ success: false, error: 'A troca de consultor está disponível somente para clientes fechados' });
      }
      const role = String(req.userRole || '').toLowerCase();
      if (!['master', 'supervisor'].includes(role)) {
        return res.status(403).json({ success: false, error: 'Somente o MASTER ou a Supervisão podem alterar o consultor de um cliente fechado' });
      }
      if (!requestedConsultantId || !UUID_PATTERN.test(requestedConsultantId)) {
        return res.status(400).json({ success: false, error: 'Selecione um consultor válido' });
      }
      const consultant = await clientModel.getAssignableConsultant(requestedConsultantId, tenantId);
      if (!consultant) {
        return res.status(400).json({ success: false, error: 'Consultor não encontrado ou inativo' });
      }
    }

    // Normaliza CPF removendo máscara antes de salvar
    const cpfNormalized = cpf ? normalizeCPF(cpf) : null;
    if (cpfNormalized && cpfNormalized.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF deve ter 11 dígitos' });
    }

    // Permite apenas o par lead/cliente que já está formalmente vinculado.
    if (cpfNormalized && cpfNormalized !== normalizeCPF(existingClient.cpf)) {
      const conflict = await findCpfConflict({
        tenantId,
        cpf: cpfNormalized,
        excludeClientId: existingClient.id,
        linkedLeadId: existingClient.lead_id,
      });
      if (conflict) {
        return res.status(409).json({ success: false, error: cpfConflictMessage(conflict) });
      }
    }

    const client = await clientModel.updateClient(id, {
      name: name.trim(), birth_date, cpf: cpfNormalized, cnh, first_cnh,
      phone, email,
      // Partial updates must not erase fields omitted by list/search payloads.
      // An explicit empty value still allows the user to clear the field.
      address: Object.prototype.hasOwnProperty.call(req.body, 'address') ? address : existingClient.address,
      notes: Object.prototype.hasOwnProperty.call(req.body, 'notes') ? notes : existingClient.notes,
      status: status || existingClient.status || 'negociacao',
      consultant_id: changesConsultant ? requestedConsultantId : undefined,
    }, tenantId);

    res.json({ success: true, data: client });
  } catch (err) {
    console.error('Erro ao atualizar cliente:', err);
    if (isCpfConflictDatabaseError(err)) {
      return res.status(409).json({ success: false, error: cpfConflictMessage(null) });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/clients/:id - Deletar cliente
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const existing = await clientModel.getClientById(id, tenantId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
    }
    if (!canAccessClient(req, existing)) {
      return res.status(403).json({ success: false, error: 'Acesso negado a este cliente' });
    }

    const client = await clientModel.deleteClient(id, tenantId);

    res.json({ success: true, data: client, message: 'Cliente deletado com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar cliente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
