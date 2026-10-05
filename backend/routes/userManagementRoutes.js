const express = require('express');
const router = express.Router();
const permissionModel = require('../models/permissionModels');
const { checkPermission, requireAdminOrManager, getAllRoles } = require('../middlewares/checkPermission');
const saasModel = require('../models/saasModels');

// GET /api/users/management - Listar usuários do tenant
router.get('/', checkPermission('users:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const users = await permissionModel.getUsersWithRoles(tenantId);
    res.json({ success: true, data: users });
  } catch (err) {
    console.error('Erro ao buscar usuários:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/management/stats - Estatísticas de usuários
router.get('/stats', checkPermission('users:read'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const [stats, total] = await Promise.all([
      permissionModel.getUsersStats(tenantId),
      permissionModel.countUsers(tenantId)
    ]);
    res.json({ success: true, data: { stats, total } });
  } catch (err) {
    console.error('Erro ao buscar stats:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/management/roles - Listar roles disponíveis
router.get('/roles', async (req, res) => {
  try {
    const roles = getAllRoles();
    const permissionsMap = {
      admin: 'Acesso total ao sistema',
      manager: 'Gerenciamento de clientes, contratos e documentos',
      operator: 'Operação básica: criar e editar',
      viewer: 'Apenas visualização'
    };
    
    const rolesWithDesc = roles.map(role => ({
      name: role,
      description: permissionsMap[role] || ''
    }));
    
    res.json({ success: true, data: rolesWithDesc });
  } catch (err) {
    console.error('Erro ao buscar roles:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/users/management/:id - Buscar usuário por ID
router.get('/:id', checkPermission('users:read'), async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    const user = await permissionModel.getUserById(id, tenantId);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    
    res.json({ success: true, data: user });
  } catch (err) {
    console.error('Erro ao buscar usuário:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/users/management - Criar novo usuário
router.post('/', requireAdminOrManager, async (req, res) => {
  try {
    const { name, email, password, role = 'viewer' } = req.body;
    const tenantId = req.tenantId;
    
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nome, email e senha são obrigatórios' 
      });
    }
    
    // Verificar se email já existe
    const emailExists = await permissionModel.checkEmailExists(email, tenantId);
    if (emailExists) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email já está em uso' 
      });
    }
    
    const user = await permissionModel.createUser({
      tenant_id: tenantId,
      name,
      email,
      password,
      role
    });
    
    // Log de atividade
    await saasModel.createActivityLog({
      tenant_id: tenantId,
      user_id: req.userId,
      action: 'create',
      entity_type: 'user',
      entity_id: user.id,
      description: `Usuário ${name} (${role}) criado`,
      metadata: { user_email: email }
    });
    
    res.status(201).json({ success: true, data: user });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/users/management/:id - Atualizar usuário
router.put('/:id', checkPermission('users:update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, is_active } = req.body;
    const tenantId = req.tenantId;
    
    // Usuário só pode ser atualizado por admin/manager ou pelo próprio usuário
    const currentUserRole = req.userRole;
    if (currentUserRole !== 'admin' && currentUserRole !== 'manager' && req.userId !== id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Você só pode atualizar seu próprio perfil' 
      });
    }
    
    // Verificar se o usuário pertence ao tenant
    const existingUser = await permissionModel.getUserById(id, tenantId);
    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    
    // Se não for admin, não pode mudar role de outros usuários
    if (currentUserRole !== 'admin' && req.userId !== id && role) {
      return res.status(403).json({ 
        success: false, 
        error: 'Você não pode alterar a função de outros usuários' 
      });
    }
    
    const user = await permissionModel.updateUser(id, {
      name,
      email,
      role,
      is_active
    }, tenantId);
    
    // Log de atividade
    await saasModel.createActivityLog({
      tenant_id: tenantId,
      user_id: req.userId,
      action: 'update',
      entity_type: 'user',
      entity_id: id,
      description: `Usuário ${name || existingUser.name} atualizado`,
      metadata: { changes: { name, email, role, is_active } }
    });
    
    res.json({ success: true, data: user });
  } catch (err) {
    console.error('Erro ao atualizar usuário:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/users/management/:id/password - Alterar senha
router.patch('/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    const tenantId = req.tenantId;
    
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Senha é obrigatória' 
      });
    }
    
    // Usuário só pode alterar senha do próprio usuário ou admin
    if (req.userRole !== 'admin' && req.userId !== id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Você só pode alterar sua própria senha' 
      });
    }
    
    await permissionModel.updateUserPassword(id, password, tenantId);
    
    // Log de atividade
    await saasModel.createActivityLog({
      tenant_id: tenantId,
      user_id: req.userId,
      action: 'update_password',
      entity_type: 'user',
      entity_id: id,
      description: 'Senha atualizada'
    });
    
    res.json({ success: true, message: 'Senha atualizada com sucesso' });
  } catch (err) {
    console.error('Erro ao alterar senha:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/users/management/:id - Deletar usuário
router.delete('/:id', requireAdminOrManager, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    
    // Não pode deletar a si mesmo
    if (req.userId === id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Você não pode excluir seu próprio usuário' 
      });
    }
    
    // Verificar se o usuário pertence ao tenant
    const existingUser = await permissionModel.getUserById(id, tenantId);
    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }
    
    await permissionModel.deleteUser(id, tenantId);
    
    // Log de atividade
    await saasModel.createActivityLog({
      tenant_id: tenantId,
      user_id: req.userId,
      action: 'delete',
      entity_type: 'user',
      entity_id: id,
      description: `Usuário ${existingUser.name} excluído`
    });
    
    res.json({ success: true, message: 'Usuário deletado com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar usuário:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

