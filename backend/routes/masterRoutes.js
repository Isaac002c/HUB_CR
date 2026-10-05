const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const model   = require('../models/masterModels');

// Painel Master — todas as rotas exigem super_admin. tenantContext (em /api) já populou req.userRole.
function requireSuperAdmin(req, res, next) {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao painel master.' });
  }
  next();
}
router.use(requireSuperAdmin);

const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const slugify = (s) => (s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// GET /api/master/overview
router.get('/overview', async (req, res) => {
  try { res.json({ success: true, data: await model.getOverview() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/master/tenants
router.get('/tenants', async (req, res) => {
  try { res.json({ success: true, data: await model.listTenants() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// GET /api/master/tenants/:id/users
router.get('/tenants/:id/users', async (req, res) => {
  try {
    const tenant = await model.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
    res.json({ success: true, data: { tenant, users: await model.getTenantUsers(req.params.id) } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/master/tenants — cria tenant + usuário admin
router.post('/tenants', async (req, res) => {
  try {
    const { name, adminName, adminEmail, adminPassword } = req.body;
    let { slug, email, status } = req.body;
    if (!name || !name.trim())              return res.status(400).json({ success: false, error: 'Nome do tenant é obrigatório' });
    if (!isEmail(adminEmail))               return res.status(400).json({ success: false, error: 'E-mail do admin inválido' });
    if (!adminPassword || adminPassword.length < 6) return res.status(400).json({ success: false, error: 'Senha do admin deve ter ao menos 6 caracteres' });
    slug = slugify(slug || name);
    if (!slug)                               return res.status(400).json({ success: false, error: 'Slug inválido' });
    if (slug === model.MASTER_SLUG)          return res.status(400).json({ success: false, error: 'Slug reservado' });
    if (await model.slugExists(slug))        return res.status(400).json({ success: false, error: 'Slug já existe' });

    const result = await model.createTenantWithAdmin({
      name: name.trim(), slug, email: email || null,
      adminName: (adminName || 'Admin').trim(), adminEmail, adminPassword,
      status: status === 'inativo' ? 'inativo' : 'ativo',
    });
    res.status(201).json({ success: true, data: result }); // sem senha no response
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ success: false, error: 'E-mail ou slug duplicado' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// PATCH /api/master/tenants/:id/status — ativar/inativar
router.patch('/tenants/:id/status', async (req, res) => {
  try {
    const status = req.body.status === 'inativo' ? 'inativo' : 'ativo';
    const tenant = await model.setTenantStatus(req.params.id, status);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
    res.json({ success: true, data: tenant });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /api/master/tenants/:id — editar dados da empresa
router.put('/tenants/:id', async (req, res) => {
  try {
    const current = await model.getTenantById(req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
    if (current.slug === model.MASTER_SLUG) return res.status(403).json({ success: false, error: 'A empresa master não pode ser editada' });

    let { name, slug, email, status } = req.body;
    if (name !== undefined && !String(name).trim()) return res.status(400).json({ success: false, error: 'Nome não pode ficar vazio' });
    if (slug !== undefined) {
      slug = slugify(slug);
      if (!slug)                        return res.status(400).json({ success: false, error: 'Slug inválido' });
      if (slug === model.MASTER_SLUG)   return res.status(400).json({ success: false, error: 'Slug reservado' });
      if (await model.slugExistsExcept(slug, req.params.id)) return res.status(400).json({ success: false, error: 'Slug já existe' });
    }
    if (status !== undefined) status = status === 'inativo' ? 'inativo' : 'ativo';

    const updated = await model.updateTenant(req.params.id, {
      name: name !== undefined ? String(name).trim() : undefined,
      slug,
      email: email !== undefined ? (email || null) : current.email,
      status,
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ success: false, error: 'Slug ou e-mail duplicado' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/master/tenants/:id — apagar empresa (somente se INATIVA). Irreversível (CASCADE).
router.delete('/tenants/:id', async (req, res) => {
  try {
    const current = await model.getTenantById(req.params.id);
    if (!current) return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
    if (current.slug === model.MASTER_SLUG) return res.status(403).json({ success: false, error: 'A empresa master não pode ser apagada' });
    if (current.status !== 'inativo')       return res.status(400).json({ success: false, error: 'Inative a empresa antes de apagá-la.' });
    await model.deleteTenant(req.params.id);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// POST /api/master/tenants/:id/users — criar usuário (admin) para um tenant
router.post('/tenants/:id/users', async (req, res) => {
  try {
    const tenant = await model.getTenantById(req.params.id);
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant não encontrado' });
    const { name, email, password, role } = req.body;
    if (!isEmail(email))            return res.status(400).json({ success: false, error: 'E-mail inválido' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter ao menos 6 caracteres' });
    if (await model.emailInTenant(email, req.params.id)) return res.status(400).json({ success: false, error: 'E-mail já existe neste tenant' });
    const user = await model.createTenantUser({ tenant_id: req.params.id, name: (name || 'Admin').trim(), email, password, role });
    res.status(201).json({ success: true, data: user });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ success: false, error: 'E-mail duplicado' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/master/users/:id/reset-password — gera senha temporária (exibida 1x ao master)
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const target = await model.getUserById(req.params.id);
    if (!target) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    if (target.role === 'super_admin') return res.status(403).json({ success: false, error: 'Operação não permitida' });
    const temp = crypto.randomBytes(9).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) + 'A9';
    await model.resetUserPassword(req.params.id, temp);
    res.json({ success: true, data: { email: target.email, temp_password: temp } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// PUT /api/master/users/:id — editar usuário (nome, e-mail, papel). Nunca senha.
router.put('/users/:id', async (req, res) => {
  try {
    const target = await model.getUserById(req.params.id);
    if (!target) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    if (target.role === 'super_admin') return res.status(403).json({ success: false, error: 'Operação não permitida' });

    let { name, email, role } = req.body;
    if (email !== undefined) {
      if (!isEmail(email)) return res.status(400).json({ success: false, error: 'E-mail inválido' });
      if (await model.emailInTenantExcept(email, target.tenant_id, req.params.id))
        return res.status(400).json({ success: false, error: 'E-mail já existe neste tenant' });
    }
    if (role !== undefined) role = role === 'admin' ? 'admin' : 'seller';

    const updated = await model.updateUser(req.params.id, {
      name: name !== undefined ? String(name).trim() : undefined,
      email,
      role,
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ success: false, error: 'E-mail duplicado' });
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/master/users/:id — apagar usuário, preservando os registros criados por ele.
router.delete('/users/:id', async (req, res) => {
  try {
    const target = await model.getUserById(req.params.id);
    if (!target) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    if (target.role === 'super_admin') return res.status(403).json({ success: false, error: 'Operação não permitida' });
    const deleted = await model.deleteUser(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    res.json({ success: true, data: { id: req.params.id } });
  } catch (e) {
    if (e.code === '23503') return res.status(400).json({ success: false, error: 'Usuário possui vínculos que impedem a exclusão.' });
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
