// ============================================================================
// middlewares/authorize.js
// Camada de autorização CENTRALIZADA (evita `if (role === ...)` espalhado).
//
//   userContext(...)      → carrega role/equipe/ativo do BANCO (autoritativo)
//   requireModule(name)   → 403 se o módulo for 'none' para o role
//   requireRole(...roles) → 403 se o role não estiver na lista
//   scopeFor(req, module) → { level, userId, teamId } para escopar queries
//
// Escopo por role (via accessControl):
//   master/admin → tenant inteiro   (nos módulos permitidos)
//   supervisor   → tenant + team_id
//   seller       → tenant + created_by/seller_id (dono)
//   Deferidos/Agenda → leitura global do tenant para todos.
// ============================================================================

const pool = require('../config/db');
const access = require('../config/accessControl');

// Carrega contexto real do usuário (role, team_id, is_active) do banco.
// Autoritativo: reflete mudanças de perfil mesmo com JWT antigo (30d).
// Tolerante: se colunas novas ainda não existirem, cai para o mínimo.
async function userContext(req, res, next) {
  try {
    if (!req.userId) return next(); // rotas sem usuário seguem (tenantContext já validou tenant)

    let row = null;
    try {
      const r = await pool.query(
        `SELECT role, team_id, COALESCE(is_active, true) AS is_active
           FROM users WHERE id = $1 AND tenant_id = $2`,
        [req.userId, req.tenantId]
      );
      row = r.rows[0];
    } catch (e) {
      // Colunas novas podem não existir antes das migrations → fallback mínimo.
      const r = await pool.query(
        `SELECT role FROM users WHERE id = $1 AND tenant_id = $2`,
        [req.userId, req.tenantId]
      );
      row = r.rows[0] ? { ...r.rows[0], team_id: null, is_active: true } : null;
    }

    if (row) {
      req.userRole = access.normalizeRole(row.role || req.userRole);
      req.teamId   = row.team_id || null;
      req.isActive = row.is_active !== false;

      // Bloqueia usuário inativado (exceto super_admin da plataforma)
      if (req.isActive === false && req.userRole !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Usuário inativo. Contate o administrador.' });
      }
    }
    next();
  } catch (err) {
    console.error('[authorize.userContext]', err.message);
    next(); // não derruba a API; segue com role do JWT
  }
}

// 403 se o módulo não for acessível para o role atual.
function requireModule(moduleName) {
  return (req, res, next) => {
    const role = req.userRole || 'seller';
    if (!access.canAccess(role, moduleName)) {
      console.warn(`[authorize] role=${role} bloqueado no módulo "${moduleName}" (${req.method} ${req.originalUrl})`);
      return res.status(403).json({ success: false, error: 'Acesso negado a este módulo.' });
    }
    next();
  };
}

// 403 se o role não estiver na lista informada.
function requireRole(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    const role = req.userRole || 'seller';
    if (!allowed.includes(role)) {
      return res.status(403).json({ success: false, error: 'Perfil sem permissão para esta ação.' });
    }
    next();
  };
}

// Retorna o escopo a aplicar nas queries do módulo.
//   level: 'full' | 'team' | 'own' | 'none'
//   userId: dono (para 'own'); teamId: equipe (para 'team')
function scopeFor(req, moduleName) {
  const role = req.userRole || 'seller';
  const level = access.accessLevel(role, moduleName);
  return { level, role, userId: req.userId || null, teamId: req.teamId || null };
}

module.exports = { userContext, requireModule, requireRole, scopeFor, access };
