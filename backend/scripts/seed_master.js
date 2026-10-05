// Seed do administrador global da instalação CR Recursos (super_admin). Idempotente.
// Uso (NÃO commitar senha): MASTER_SEED_PASSWORD='...' node scripts/seed_master.js
require('dotenv').config({ path: __dirname + '/../.env' });
const pool   = require('../config/db');
const bcrypt = require('bcryptjs');

const EMAIL = process.env.MASTER_SEED_EMAIL || 'admin@cr-recursos.local';
const SLUG  = 'cr-recursos-system';

(async () => {
  const pw = process.env.MASTER_SEED_PASSWORD;
  if (!pw || pw.length < 8) {
    console.error('ERRO: defina MASTER_SEED_PASSWORD (>= 8 chars) ao rodar o seed.');
    process.exit(1);
  }
  try {
    // 1. Tenant técnico (host do super_admin)
    let t = await pool.query('SELECT id FROM tenants WHERE slug = $1', [SLUG]);
    let tenantId;
    if (t.rows[0]) {
      tenantId = t.rows[0].id;
    } else {
      const ins = await pool.query(
        "INSERT INTO tenants(name, slug, status) VALUES('CR Recursos Sistema', $1, 'ativo') RETURNING id",
        [SLUG]
      );
      tenantId = ins.rows[0].id;
      console.log('Tenant técnico criado.');
    }

    // 2. Usuário master super_admin (cria ou atualiza senha/role)
    const hash = await bcrypt.hash(pw, 10);
    const u = await pool.query('SELECT id FROM users WHERE email = $1 AND tenant_id = $2', [EMAIL, tenantId]);
    if (u.rows[0]) {
      await pool.query(
        "UPDATE users SET password_hash = $1, role = 'super_admin', name = 'Administrador do Sistema' WHERE id = $2",
        [hash, u.rows[0].id]
      );
      console.log('Master atualizado:', EMAIL);
    } else {
      await pool.query(
        "INSERT INTO users(tenant_id, name, email, password_hash, role) VALUES($1, 'Administrador do Sistema', $2, $3, 'super_admin')",
        [tenantId, EMAIL, hash]
      );
      console.log('Master criado:', EMAIL);
    }
    console.log('SEED OK — role=super_admin, tenant=cr-recursos-system');
    process.exit(0);
  } catch (e) {
    console.error('SEED ERRO:', e.message);
    process.exit(1);
  }
})();
