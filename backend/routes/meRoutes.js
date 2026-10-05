// ============================================================================
// routes/meRoutes.js  — contexto do usuário autenticado + matriz de acesso
// GET /api/me/access → { role, teamId, access: { modulo: nivel } }
// O frontend usa isto para esconder menu/telas com EXATAMENTE a mesma regra
// que o backend aplica (a ocultação é só UX; o bloqueio real é no backend).
// ============================================================================

const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const access = require('../config/accessControl');

router.get('/access', async (req, res) => {
  try {
    const role = access.normalizeRole(req.userRole);

    let teamId = req.teamId || null;
    let name = null;
    try {
      const r = await pool.query(
        `SELECT name, team_id FROM users WHERE id = $1 AND tenant_id = $2`,
        [req.userId, req.tenantId]
      );
      if (r.rows[0]) { name = r.rows[0].name; teamId = r.rows[0].team_id || teamId; }
    } catch (_) { /* colunas podem não existir antes das migrations */ }

    res.json({
      success: true,
      data: {
        userId: req.userId,
        role,
        teamId,
        name,
        modules: access.MODULES,
        access: access.accessMapFor(role),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
