const express = require('express');
const router = express.Router();
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { createUser } = require('../models/userModels');
const { createTenant } = require('../models/tenantModels');
const pool = require('../config/db');
const { createAuditEvent } = require('../models/auditModels');

const isDev = process.env.NODE_ENV !== 'production';
const log = (...args) => { if (isDev) console.log(...args); };

const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não definido nas variáveis de ambiente');
  return secret;
};

const sendJson = (res, status, data) => {
  res.status(status).setHeader('Content-Type', 'application/json').json(data);
};

// ✅ Rate limit específico pro login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 1. REGISTER
router.post('/register',
  [
    body('tenantName').notEmpty().trim().escape(),
    body('name').notEmpty().trim().escape(),
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
    body('password').isLength({ min: 6 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendJson(res, 400, { success: false, message: 'Dados inválidos' });
    }

    try {
      const { tenantName, name, email, password } = req.body;

      const tenant = await createTenant(tenantName);

      const existingUsers = await pool.query(
        'SELECT COUNT(*) as count FROM users WHERE tenant_id = $1',
        [tenant.id]
      );
      const isFirstUser = parseInt(existingUsers.rows[0].count) === 0;

      const createdUser = await createUser({
        name,
        email,
        password,
        tenant_id: tenant.id,
        // 1º usuário do tenant = MASTER (dono, acesso integral). Demais = consultor.
        role: isFirstUser ? 'master' : 'seller'
      });

      await createAuditEvent({
        tenant_id: tenant.id, user_id: createdUser.id, action: 'register', module: 'autenticacao',
        entity: 'user', entity_id: createdUser.id, entity_name: name,
        description: 'Criou a conta e a empresa', method: 'POST', path: '/auth/register',
        status_code: 201, success: true,
        ip_address: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 80) || null,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
        metadata: { email, role: isFirstUser ? 'master' : 'seller' },
      }).catch((error) => console.error('[audit/register]', error.message));

      sendJson(res, 201, {
        success: true,
        tenant_id: tenant.id,
        message: 'Tenant + usuário criado com sucesso!'
      });
    } catch (err) {
      console.error('[REGISTER ERROR]', err.message);
      sendJson(res, 500, { success: false, message: 'Erro ao registrar' });
    }
  }
);

// 2. LOGIN
router.post('/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail({ gmail_remove_dots: false }),
    body('password').isLength({ min: 6 }).trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return sendJson(res, 400, { success: false, message: 'Dados inválidos' });
    }

    let client;
    try {
      const { email, password } = req.body;

      client = await pool.connect();

      // Busca todos os usuários com esse e-mail (multi-tenant: pode haver mais de um)
      const result = await client.query(
        `SELECT u.id, u.name, u.email, u.password_hash, u.tenant_id, u.role, u.seller_id,
                t.name as tenant_name, t.slug as tenant_slug, t.status as tenant_status,
                t.logo_url as tenant_logo_url, t.brand_color as tenant_brand_color,
                t.brand_color_dark as tenant_brand_color_dark, t.tagline as tenant_tagline
         FROM users u
         JOIN tenants t ON u.tenant_id = t.id
         WHERE u.email = $1
         ORDER BY u.created_at ASC`,
        [email]
      );

      if (result.rows.length === 0) {
        return sendJson(res, 401, { success: false, message: 'Credenciais inválidas' });
      }

      // Valida a senha contra cada usuário encontrado (suporta colisão de e-mail entre tenants)
      let user = null;
      for (const candidate of result.rows) {
        const match = await bcryptjs.compare(password, candidate.password_hash);
        if (match) {
          user = candidate;
          break;
        }
      }

      if (!user) {
        const tenantIds = [...new Set(result.rows.map((candidate) => candidate.tenant_id))];
        Promise.all(tenantIds.map((tenantId) => createAuditEvent({
          tenant_id: tenantId, action: 'login_failed', module: 'autenticacao', entity: 'session',
          entity_name: email, description: 'Tentativa de login com senha inválida', method: 'POST',
          path: '/auth/login', status_code: 401, success: false,
          ip_address: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 80) || null,
          user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
          metadata: { email },
        }).catch((error) => console.error('[audit/login-failed]', error.message))))
          .catch((error) => console.error('[audit/login-failed]', error.message));
        return sendJson(res, 401, { success: false, message: 'Credenciais inválidas' });
      }

      // Bloqueia login se a empresa (tenant) estiver inativa — super_admin sempre pode entrar.
      if (user.role !== 'super_admin' && user.tenant_status && user.tenant_status !== 'ativo') {
        return sendJson(res, 403, { success: false, message: 'Empresa inativa. Contate a administração da CR Recursos.' });
      }

      // Aviso operacional: mesmo e-mail em múltiplos tenants
      if (result.rows.length > 1) {
        console.warn(`[LOGIN] E-mail "${email}" existe em ${result.rows.length} tenants. Logando no primeiro com senha válida.`);
      }

      const token = jwt.sign(
        {
          userId: user.id,
          tenantId: user.tenant_id,
          email: user.email,
          role: user.role || 'admin',
          sellerId: user.seller_id || null,
        },
        getJWTSecret(),
        { expiresIn: '30d' }
      );

      // Último acesso (não bloqueia o login se falhar)
      await client.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]).catch(() => {});

      createAuditEvent({
        tenant_id: user.tenant_id, user_id: user.id, action: 'login', module: 'autenticacao',
        entity: 'session', entity_id: user.id, entity_name: user.name,
        description: 'Entrou no sistema', method: 'POST', path: '/auth/login',
        status_code: 200, success: true,
        ip_address: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 80) || null,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
        metadata: { email: user.email, role: user.role || 'admin' },
      }).catch((error) => console.error('[audit/login]', error.message));

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
      };

      res.cookie('token', token, cookieOptions);
      res.cookie('auth-token', token, cookieOptions);
      res.cookie('tenantId', user.tenant_id.toString(), cookieOptions);

      sendJson(res, 200, {
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role || 'admin',
          seller_id: user.seller_id || null,
        },
        tenant: {
          id: user.tenant_id,
          name: user.tenant_name,
          slug: user.tenant_slug || 'default',
          logo_url: user.tenant_logo_url || null,
          brand_color: user.tenant_brand_color || '#751518',
          brand_color_dark: user.tenant_brand_color_dark || '#050708',
          tagline: user.tenant_tagline || 'Assessoria de Trânsito'
        }
      });
    } catch (err) {
      console.error('[LOGIN ERROR]', err.message);
      sendJson(res, 500, { success: false, message: 'Erro no servidor' });
    } finally {
      if (client) client.release();
    }
  }
);

// 3. VALIDATE TOKEN
router.post('/validate', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return sendJson(res, 401, { success: false, message: 'Token obrigatório' });
    }

    const decoded = jwt.verify(token, getJWTSecret());
    sendJson(res, 200, {
      success: true,
      user: { id: decoded.userId, email: decoded.email },
      tenant: { id: decoded.tenantId },
      role: decoded.role || 'seller',
      sellerId: decoded.sellerId
    });
  } catch (err) {
    sendJson(res, 401, { success: false, message: 'Token inválido' });
  }
});

// 4. LOGOUT
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.token || req.cookies?.['auth-token'];
  if (token) {
    try {
      const decoded = jwt.verify(token, getJWTSecret());
      await createAuditEvent({
        tenant_id: decoded.tenantId, user_id: decoded.userId || null, action: 'logout', module: 'autenticacao',
        entity: 'session', entity_id: decoded.userId || null, entity_name: decoded.email || null,
        description: 'Saiu do sistema', method: 'POST', path: '/auth/logout', status_code: 200, success: true,
        ip_address: String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim().slice(0, 80) || null,
        user_agent: String(req.headers['user-agent'] || '').slice(0, 500) || null,
      }).catch((error) => console.error('[audit/logout]', error.message));
    } catch { /* token inválido ou expirado: apenas conclui o logout local */ }
  }
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  };
  res.clearCookie('token', cookieOptions);
  res.clearCookie('auth-token', cookieOptions);
  res.clearCookie('tenantId', cookieOptions);
  sendJson(res, 200, { success: true, message: 'Logout realizado com sucesso' });
});

module.exports = router;
