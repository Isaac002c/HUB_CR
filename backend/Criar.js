require('dotenv').config({ path: __dirname + '/.env' });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const perguntar = (pergunta) =>
  new Promise((resolve) => rl.question(pergunta, (resp) => resolve(resp.trim())));

async function main() {
  console.log('\n🚀 Criador de Tenant + Admin\n');

  const tenantName = await perguntar('Nome da empresa (tenant): ');
  const adminName  = await perguntar('Nome do admin: ');
  const adminEmail = await perguntar('Email do admin: ');
  const adminPass  = await perguntar('Senha do admin (min 6 chars): ');

  if (!tenantName || !adminName || !adminEmail || !adminPass) {
    console.error('❌ Todos os campos são obrigatórios.');
    process.exit(1);
  }

  if (adminPass.length < 6) {
    console.error('❌ Senha muito curta.');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tenantResult = await client.query(
      `INSERT INTO tenants (name) VALUES ($1) RETURNING id, name`,
      [tenantName]
    );
    const tenant = tenantResult.rows[0];
    console.log(`\n✅ Tenant criado: ${tenant.name} (ID: ${tenant.id})`);

    const passwordHash = await bcrypt.hash(adminPass, 12);

    const userResult = await client.query(
      `INSERT INTO users (name, email, password_hash, tenant_id, role)
       VALUES ($1, $2, $3, $4, 'master')
       RETURNING id, name, email, role`,
      [adminName, adminEmail, passwordHash, tenant.id]
    );
    const user = userResult.rows[0];
    console.log(`✅ Admin criado: ${user.name} (${user.email})`);

    await client.query('COMMIT');

    console.log('\n🎉 Pronto! Dados de acesso:');
    console.log(`   Empresa : ${tenant.name}`);
    console.log(`   Email   : ${user.email}`);
    console.log(`   Senha   : (a que você digitou)`);
    console.log(`   Role    : admin\n`);

  } catch (err) {
    await client.query('ROLLBACK');

    if (err.message.includes('duplicate key') || err.message.includes('unique')) {
      console.error('❌ Email já cadastrado.');
    } else {
      console.error('❌ Erro:', err.message);
    }
    process.exit(1);
  } finally {
    client.release();
    rl.close();
    await pool.end();
  }
}

main();