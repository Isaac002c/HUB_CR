const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const DEFAULT_TENANT_SLUG = 'cr-recursos';
const DEFAULT_OLD_EMAIL = 'administrativo.provisorio@cr-recursos.app';
const DEFAULT_NEW_EMAIL = 'administrativo.crrecursos@gmail.com';

async function main() {
  const apply = process.argv.includes('--apply');
  const databaseUrl = process.env.DATABASE_URL;
  const password = process.env.ADMIN_TEMP_PASSWORD;
  const tenantSlug = process.env.TENANT_SLUG || DEFAULT_TENANT_SLUG;
  const oldEmail = String(process.env.OLD_ADMIN_EMAIL || DEFAULT_OLD_EMAIL).trim().toLowerCase();
  const newEmail = String(process.env.NEW_ADMIN_EMAIL || DEFAULT_NEW_EMAIL).trim().toLowerCase();
  if (!databaseUrl) throw new Error('DATABASE_URL é obrigatória.');
  if (apply && (!password || password.length < 12)) throw new Error('ADMIN_TEMP_PASSWORD deve ter pelo menos 12 caracteres.');

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const tenantResult = await db.query('SELECT id, slug FROM tenants WHERE slug = $1 LIMIT 1', [tenantSlug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new Error(`Tenant ${tenantSlug} não encontrado.`);

    const result = await db.query(
      `SELECT id, name, email, role, is_active
         FROM users
        WHERE tenant_id = $1 AND (LOWER(email) = $2 OR LOWER(email) = $3 OR role = 'admin')
        ORDER BY CASE WHEN LOWER(email) = $3 THEN 0 WHEN LOWER(email) = $2 THEN 1 ELSE 2 END`,
      [tenant.id, oldEmail, newEmail],
    );
    const official = result.rows.find((row) => row.email.toLowerCase() === newEmail);
    const provisional = result.rows.find((row) => row.email.toLowerCase() === oldEmail);
    if (official && provisional && official.id !== provisional.id) {
      throw new Error('Já existe outro usuário com o e-mail oficial; substituição automática bloqueada.');
    }
    const target = official || provisional || (result.rows.filter((row) => row.role === 'admin').length === 1 ? result.rows.find((row) => row.role === 'admin') : null);
    if (!target) throw new Error('Usuário administrativo provisório não encontrado de forma inequívoca.');

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      tenant: tenant.slug,
      userId: target.id,
      from: { name: target.name, email: target.email, role: target.role, active: target.is_active },
      to: { name: 'Administrativo', email: newEmail, role: 'admin', active: true },
    };

    if (apply) {
      const passwordHash = await bcrypt.hash(password, 12);
      await db.query(
        `UPDATE users
            SET name = 'Administrativo', email = $1, password_hash = $2,
                role = 'admin', is_active = true, updated_at = NOW()
          WHERE id = $3 AND tenant_id = $4`,
        [newEmail, passwordHash, target.id, tenant.id],
      );
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
