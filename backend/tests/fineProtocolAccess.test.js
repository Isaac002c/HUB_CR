const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const { Client } = require('pg');

async function main() {
  const port = 56000 + Math.floor(Math.random() * 8000);
  const dbUrl = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  const pglite = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1' });
  let pool;

  try {
    await server.start();
    const db = new Client({ connectionString: dbUrl });
    await db.connect();
    await db.query(`
      CREATE TABLE users (id UUID PRIMARY KEY, tenant_id UUID NOT NULL, team_id UUID);
      CREATE TABLE clients (id UUID PRIMARY KEY, tenant_id UUID NOT NULL, created_by UUID);
      CREATE TABLE companies (id UUID PRIMARY KEY, tenant_id UUID NOT NULL, created_by UUID);
      CREATE TABLE fines (id UUID PRIMARY KEY, tenant_id UUID NOT NULL, client_id UUID, company_id UUID, seller_id UUID);
    `);

    const [tenant, otherTenant] = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    const [teamA, teamB] = [
      '00000000-0000-4000-8000-000000000010',
      '00000000-0000-4000-8000-000000000020',
    ];
    const ids = {
      master: '00000000-0000-4000-8000-000000000101',
      sellerOld: '00000000-0000-4000-8000-000000000102',
      sellerCurrent: '00000000-0000-4000-8000-000000000103',
      supervisorCurrent: '00000000-0000-4000-8000-000000000104',
      supervisorOther: '00000000-0000-4000-8000-000000000105',
      transferredClient: '00000000-0000-4000-8000-000000000201',
      transferredFine: '00000000-0000-4000-8000-000000000301',
      legacyFine: '00000000-0000-4000-8000-000000000302',
      company: '00000000-0000-4000-8000-000000000401',
      companyFine: '00000000-0000-4000-8000-000000000402',
      otherTenantFine: '00000000-0000-4000-8000-000000000403',
    };
    await db.query(
      `INSERT INTO users(id, tenant_id, team_id) VALUES
        ($1,$5,NULL), ($2,$5,$6), ($3,$5,$7), ($4,$5,$7), ($8,$5,$6)`,
      [ids.master, ids.sellerOld, ids.sellerCurrent, ids.supervisorCurrent, tenant, teamA, teamB, ids.supervisorOther],
    );
    await db.query('INSERT INTO clients(id,tenant_id,created_by) VALUES($1,$2,$3)', [ids.transferredClient, tenant, ids.sellerCurrent]);
    await db.query('INSERT INTO companies(id,tenant_id,created_by) VALUES($1,$2,$3)', [ids.company, tenant, ids.sellerCurrent]);
    await db.query(
      `INSERT INTO fines(id,tenant_id,client_id,seller_id) VALUES($1,$2,$3,$4), ($5,$2,NULL,$4)`,
      [ids.transferredFine, tenant, ids.transferredClient, ids.sellerOld, ids.legacyFine],
    );
    await db.query('INSERT INTO fines(id,tenant_id,company_id,seller_id) VALUES($1,$2,$3,$4)',
      [ids.companyFine, tenant, ids.company, ids.sellerOld]);
    await db.query('INSERT INTO fines(id,tenant_id,seller_id) VALUES($1,$2,$3)',
      [ids.otherTenantFine, otherTenant, ids.master]);
    await db.end();

    process.env.DATABASE_URL = dbUrl;
    process.env.DB_SSL = 'false';
    pool = require('../config/db');
    const { canAccessFine } = require('../models/fineProtocolModels');
    const allowed = async (fineId, role, userId, userTeamId) =>
      canAccessFine(fineId, tenant, { role, userId, teamId: userTeamId });

    assert.equal(await allowed(ids.transferredFine, 'seller', ids.sellerCurrent), true, 'current client owner can access transferred process');
    assert.equal(await allowed(ids.transferredFine, 'seller', ids.sellerOld), false, 'previous owner loses access after transfer');
    assert.equal(await allowed(ids.transferredFine, 'supervisor', ids.supervisorCurrent, teamB), true, 'supervisor can access current team process');
    assert.equal(await allowed(ids.transferredFine, 'supervisor', ids.supervisorOther, teamA), false, 'supervisor cannot access a process outside their team');
    assert.equal(await allowed(ids.legacyFine, 'seller', ids.sellerOld), true, 'legacy process without a client owner uses its original seller');
    assert.equal(await allowed(ids.companyFine, 'seller', ids.sellerCurrent), true, 'current company owner can access company process');
    assert.equal(await allowed(ids.transferredFine, 'master', ids.master), true, 'master retains tenant-wide access');
    assert.equal(await canAccessFine(ids.otherTenantFine, tenant, { role: 'master', userId: ids.master }), false, 'tenant boundary remains enforced');
    console.log('✓ fine protocol access: current ownership, team scope, legacy fallback and tenant isolation');
  } finally {
    if (pool) await pool.end();
    await server.stop();
    await pglite.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
