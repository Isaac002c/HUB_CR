// middlewares/tenantContext.js
const jwt = require('jsonwebtoken');

const isDev = process.env.NODE_ENV !== 'production';
const log = (...args) => { if (isDev) console.log(...args); };

const getJWTSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET não definido nas variáveis de ambiente');
  return secret;
};

module.exports = function tenantContext(req, res, next) {
  try {
    let token = null;

    // 1️⃣ Header Authorization
    const authHeader = req.headers['authorization'];
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
    // 2️⃣ Cookies
    else if (req.cookies?.token) {
      token = req.cookies.token;
    }
    else if (req.cookies?.['auth-token']) {
      token = req.cookies['auth-token'];
    }

  
    // Nunca aceitar token em URL — aparece em logs de servidor, histórico do browser, analytics

    if (!token) {
      return res.status(401).json({ error: 'Token não fornecido.' });
    }

    // 3️⃣ Verifica token
    let decoded;
    try {
      decoded = jwt.verify(token, getJWTSecret());
    } catch (err) {

      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expirado.' });
      }
      return res.status(401).json({ error: 'Token inválido.' });
    }

    // 4️⃣ Valida tenantId
    if (!decoded.tenantId) {
      return res.status(401).json({ error: 'Tenant inválido.' });
    }

    // 5️⃣ Popula request
    req.tenantId  = String(decoded.tenantId);
    req.userId    = decoded.userId   || null;
    req.userEmail = decoded.email    || null;
    req.userRole  = decoded.role     || 'seller';
    req.sellerId  = decoded.sellerId || null;


    log('[tenantContext] Autenticado:', {
      userId:   req.userId,
      tenantId: req.tenantId,
      role:     req.userRole,
    });

    next();

  } catch (error) {
    console.error('[tenantContext] Erro inesperado:', error.message);
    return res.status(500).json({ error: 'Erro interno no middleware.' });
  }
};