require('dotenv').config({ path: __dirname + '/../.env' });

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida');
}

const connectionString = process.env.DATABASE_URL;
const sslDisabled = /sslmode=disable/i.test(connectionString) || process.env.DB_SSL === 'false';
const pool = new Pool({
  connectionString,
  ssl: sslDisabled ? false : { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 5000,
});

const migrations = [
  '000_base_schema.sql',
  'add_activity_logs_entity_name.sql',
  'add_calendar_event_attendee_fields.sql',
  'add_calendar_event_value_payment_phone.sql',
  'add_client_fields.sql',
  'add_client_lead_link.sql',
  'add_client_status.sql',
  'add_company_vehicle_to_fines.sql',
  'add_master_panel_columns.sql',
  'add_performance_indexes.sql',
  'add_stage_changed_at.sql',
  'add_tri_prazo_uploads.sql',
  'add_users_columns.sql',
  'add_vehicle_driver_and_doc_links.sql',
  'create_approval_requests.sql',
  'create_calendar_events.sql',
  'create_companies.sql',
  'create_company_vehicles.sql',
  'create_documents_table.sql',
  'create_fine_protocols.sql',
  'update_leads_status_and_archive.sql',
  'gestao_01_module.sql',
  'gestao_02_roles.sql',
  'gestao_03_backfill_sales.sql',
  'gestao_04_ownership.sql',
  'gestao_05_workforce_costs.sql',
  'gestao_06_collaborator_details.sql',
  'gestao_07_audit_trail.sql',
  'gestao_08_sales_board.sql',
  'gestao_09_tri_real_infractor.sql',
  'gestao_10_fixed_commission_policy.sql',
  'gestao_11_team_monthly_targets.sql',
  'gestao_12_deferred_images.sql',
  'gestao_13_supervision_and_monthly_targets.sql',
  'gestao_14_email_outbox.sql',
  'gestao_15_personal_notes_and_client_owners.sql',
  'gestao_16_finance_and_negotiation_clients.sql',
  'gestao_17_client_statuses.sql',
  'gestao_18_supervision_login.sql',
  'gestao_19_cr_user_logins.sql',
  'gestao_20_cr_supervision_team.sql',
  'gestao_21_cr_supervision_display_name.sql',
  'gestao_22_sales_responsible_display_name.sql',
  'gestao_23_cr_account_identities.sql',
  'gestao_24_monthly_transport.sql',
  'gestao_25_installment_tracking.sql',
  'gestao_26_installment_frequency.sql',
  'gestao_27_installment_schedule_amount.sql',
  'gestao_28_cpf_duplicate_guard.sql',
  'gestao_29_business_day_deadlines.sql',
  'gestao_30_installment_schedule_items.sql',
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDatabase() {
  let lastError;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      console.log(`[migrate] PostgreSQL indisponível (${attempt}/30); nova tentativa em 2s`);
      await sleep(2000);
    }
  }
  throw lastError;
}

async function main() {
  await waitForDatabase();
  const existingSchema = await pool.query(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tenants'
    ) AS exists
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bancos clonados da instalação-base já carregam o schema legado. Registramos
  // essa linha de base para executar apenas as evoluções ainda pendentes.
  const migrationCount = await pool.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
  if (existingSchema.rows[0].exists && migrationCount.rows[0].count === 0) {
    const baseline = migrations.filter((name) => !name.startsWith('gestao_'));
    for (const name of baseline) {
      await pool.query('INSERT INTO schema_migrations(name) VALUES($1) ON CONFLICT DO NOTHING', [name]);
    }
    console.log(`[migrate] schema legado reconhecido (${baseline.length} migrations na linha de base)`);
  }

  for (const name of migrations) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
    if (applied.rowCount) continue;

    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
      await client.query('COMMIT');
      console.log(`[migrate] aplicada: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`${name}: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[migrate] falhou:', error.message);
    await pool.end().catch(() => {});
    process.exit(1);
  });
