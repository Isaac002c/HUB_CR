const { Client } = require('pg');

const DEFAULT_TENANT_ID = 'e4d10ef7-e37e-4051-be15-4e9f62749c0f';
const LEGACY_API_ORIGIN = 'https://api-despachante.chronostek.com.br';
const CURRENT_API_ORIGIN = 'https://api-hub.crrecursos.com.br';

const TABLES = [
  'clients',
  'companies',
  'company_vehicles',
  'fines',
  'fine_protocols',
  'documents',
  'multas_leads',
  'calendar_events',
  'approval_requests',
  'activity_logs',
];

const URL_COLUMNS = [
  ['documents', 'file_url'],
  ['fine_protocols', 'protocol_file_url'],
  ['fines', 'protocol_file_url'],
  ['fines', 'deferred_image_url'],
];

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function getColumns(client, table) {
  const result = await client.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function getTenant(client, tenantId) {
  const result = await client.query(
    'SELECT id, name, slug, status FROM tenants WHERE id = $1',
    [tenantId],
  );
  return result.rows[0] || null;
}

async function tablePlan(source, target, table, tenantId) {
  const [sourceColumns, targetColumns] = await Promise.all([
    getColumns(source, table),
    getColumns(target, table),
  ]);
  const commonColumns = sourceColumns.filter((column) => targetColumns.includes(column));
  if (!commonColumns.includes('id') || !commonColumns.includes('tenant_id')) {
    throw new Error(`Tabela ${table} não possui id/tenant_id compatíveis.`);
  }

  const [sourceRows, targetIds] = await Promise.all([
    source.query(
      `SELECT ${commonColumns.map(quoteIdentifier).join(', ')}
         FROM ${quoteIdentifier(table)}
        WHERE tenant_id = $1
        ORDER BY id`,
      [tenantId],
    ),
    target.query(`SELECT id FROM ${quoteIdentifier(table)} WHERE tenant_id = $1`, [tenantId]),
  ]);
  const existingIds = new Set(targetIds.rows.map((row) => String(row.id)));

  return {
    table,
    commonColumns,
    existingIds,
    targetOnlyColumns: targetColumns.filter((column) => !sourceColumns.includes(column)),
    rows: sourceRows.rows,
    sourceCount: sourceRows.rowCount,
    insertCount: sourceRows.rows.filter((row) => !existingIds.has(String(row.id))).length,
    updateCount: sourceRows.rows.filter((row) => existingIds.has(String(row.id))).length,
    targetOnlyCount: targetIds.rows.filter((row) => !sourceRows.rows.some((sourceRow) => String(sourceRow.id) === String(row.id))).length,
  };
}

async function applyTable(target, plan, { updateExisting = false } = {}) {
  const columns = plan.commonColumns;
  const insertColumns = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
  const updates = columns
    .filter((column) => column !== 'id' && column !== 'tenant_id' && column !== 'created_at')
    .map((column) => {
      if (column === 'updated_at') {
        return `${quoteIdentifier(column)} = GREATEST(${quoteIdentifier(plan.table)}.${quoteIdentifier(column)}, EXCLUDED.${quoteIdentifier(column)})`;
      }
      return `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`;
    })
    .join(', ');

  const conflict = updateExisting && updates
    ? `ON CONFLICT (id) DO UPDATE SET ${updates}`
    : 'ON CONFLICT (id) DO NOTHING';
  const sql = `INSERT INTO ${quoteIdentifier(plan.table)} (${insertColumns})
               VALUES (${placeholders}) ${conflict}`;
  const rows = updateExisting
    ? plan.rows
    : plan.rows.filter((row) => !plan.existingIds.has(String(row.id)));
  for (const row of rows) {
    await target.query(sql, columns.map((column) => row[column]));
  }
}

async function rewriteLegacyUrls(target, tenantId) {
  const results = [];
  for (const [table, column] of URL_COLUMNS) {
    const columns = await getColumns(target, table);
    if (!columns.includes(column)) continue;
    const result = await target.query(
      `UPDATE ${quoteIdentifier(table)}
          SET ${quoteIdentifier(column)} = REPLACE(${quoteIdentifier(column)}, $2, $3)
        WHERE tenant_id = $1
          AND ${quoteIdentifier(column)} LIKE $4`,
      [tenantId, LEGACY_API_ORIGIN, CURRENT_API_ORIGIN, `${LEGACY_API_ORIGIN}/%`],
    );
    results.push({ table, column, rewritten: result.rowCount });
  }
  return results;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const updateExisting = process.argv.includes('--apply-updates');
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.DATABASE_URL;
  const tenantId = process.env.SYNC_TENANT_ID || DEFAULT_TENANT_ID;
  if (!sourceUrl || !targetUrl) {
    throw new Error('SOURCE_DATABASE_URL e DATABASE_URL são obrigatórias.');
  }
  if (sourceUrl === targetUrl) {
    throw new Error('Origem e destino não podem apontar para o mesmo banco.');
  }

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await Promise.all([source.connect(), target.connect()]);

  try {
    const [sourceTenant, targetTenant] = await Promise.all([
      getTenant(source, tenantId),
      getTenant(target, tenantId),
    ]);
    if (!sourceTenant || !targetTenant) {
      throw new Error(`Tenant ${tenantId} precisa existir na origem e no destino.`);
    }
    if (sourceTenant.slug !== targetTenant.slug || sourceTenant.name !== targetTenant.name) {
      throw new Error('A empresa de origem não corresponde à empresa de destino.');
    }

    const plans = [];
    for (const table of TABLES) plans.push(await tablePlan(source, target, table, tenantId));

    const report = {
      mode: apply ? (updateExisting ? 'apply-updates' : 'apply-missing') : 'dry-run',
      tenant: targetTenant,
      tables: plans.map(({ rows, commonColumns, existingIds, ...plan }) => ({
        ...plan,
        commonColumnCount: commonColumns.length,
      })),
      urlRewrites: [],
    };

    if (apply) {
      await target.query('BEGIN');
      try {
        for (const plan of plans) await applyTable(target, plan, { updateExisting });
        report.urlRewrites = await rewriteLegacyUrls(target, tenantId);
        await target.query('COMMIT');
      } catch (error) {
        await target.query('ROLLBACK');
        throw error;
      }
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.allSettled([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
