const fs = require('fs');
const { Client } = require('pg');

const DEFAULT_TENANT_SLUG = 'cr-recursos';
const DEFAULT_YURI_EMAIL = 'consultoryurirodrigues@gmail.com';

function documentNumber(value, width, label) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) throw new Error(`${label} vazio na planilha.`);
  if (digits.length > width) throw new Error(`${label} com mais de ${width} dígitos: ${digits}`);
  return digits.padStart(width, '0');
}

function normalizeStoredDocument(value, width) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length <= width ? digits.padStart(width, '0') : digits;
}

function parseRows(filePath) {
  const rows = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Arquivo de importação inválido.');

  const parsed = rows.map((row, index) => {
    const name = String(row?.[0] ?? '').trim().replace(/\s+/g, ' ');
    if (!name) throw new Error(`Nome vazio na linha ${index + 2}.`);
    return {
      line: index + 2,
      name,
      cpf: documentNumber(row?.[1], 11, `CPF da linha ${index + 2}`),
      cnh: documentNumber(row?.[2], 11, `CNH da linha ${index + 2}`),
      lastSeen: row?.[3] ?? null,
    };
  });

  const seenCpf = new Map();
  const seenCnh = new Map();
  for (const row of parsed) {
    if (seenCpf.has(row.cpf)) throw new Error(`CPF duplicado nas linhas ${seenCpf.get(row.cpf)} e ${row.line}.`);
    if (seenCnh.has(row.cnh)) throw new Error(`CNH duplicada nas linhas ${seenCnh.get(row.cnh)} e ${row.line}.`);
    seenCpf.set(row.cpf, row.line);
    seenCnh.set(row.cnh, row.line);
  }
  return parsed;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const databaseUrl = process.env.DATABASE_URL;
  const filePath = process.env.YURI_CLIENTS_FILE;
  const tenantSlug = process.env.TENANT_SLUG || DEFAULT_TENANT_SLUG;
  const yuriEmail = String(process.env.YURI_EMAIL || DEFAULT_YURI_EMAIL).trim().toLowerCase();
  if (!databaseUrl || !filePath) throw new Error('DATABASE_URL e YURI_CLIENTS_FILE são obrigatórias.');

  const imported = parseRows(filePath);
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    const tenantResult = await db.query('SELECT id, name, slug FROM tenants WHERE slug = $1 LIMIT 1', [tenantSlug]);
    const tenant = tenantResult.rows[0];
    if (!tenant) throw new Error(`Tenant ${tenantSlug} não encontrado.`);

    const yuriResult = await db.query(
      `SELECT id, name, email, role, is_active
         FROM users
        WHERE tenant_id = $1 AND LOWER(email) = $2
        LIMIT 1`,
      [tenant.id, yuriEmail],
    );
    const yuri = yuriResult.rows[0];
    if (!yuri || yuri.role !== 'seller' || yuri.is_active === false) {
      throw new Error(`Consultor ativo não encontrado para ${yuriEmail}.`);
    }

    const existingResult = await db.query(
      `SELECT id, name, cpf, cnh, status, created_by
         FROM clients
        WHERE tenant_id = $1`,
      [tenant.id],
    );

    const byCpf = new Map();
    const byCnh = new Map();
    for (const client of existingResult.rows) {
      const cpf = normalizeStoredDocument(client.cpf, 11);
      const cnh = normalizeStoredDocument(client.cnh, 11);
      if (cpf) {
        if (byCpf.has(cpf) && byCpf.get(cpf).id !== client.id) throw new Error(`CPF duplicado no banco: ${cpf}.`);
        byCpf.set(cpf, client);
      }
      if (cnh) {
        if (byCnh.has(cnh) && byCnh.get(cnh).id !== client.id) throw new Error(`CNH duplicada no banco: ${cnh}.`);
        byCnh.set(cnh, client);
      }
    }

    const plan = { inserts: [], updates: [], unchanged: [], conflicts: [] };
    for (const row of imported) {
      const cpfMatch = byCpf.get(row.cpf);
      const cnhMatch = byCnh.get(row.cnh);
      if (cpfMatch && cnhMatch && cpfMatch.id !== cnhMatch.id) {
        plan.conflicts.push({ line: row.line, name: row.name, reason: 'CPF e CNH apontam para clientes diferentes.' });
        continue;
      }
      const current = cpfMatch || cnhMatch;
      if (!current) {
        plan.inserts.push(row);
        continue;
      }
      const currentCpf = normalizeStoredDocument(current.cpf, 11);
      const currentCnh = normalizeStoredDocument(current.cnh, 11);
      if ((currentCpf && currentCpf !== row.cpf) || (currentCnh && currentCnh !== row.cnh)) {
        plan.conflicts.push({ line: row.line, name: row.name, reason: 'Documento divergente do cadastro existente.' });
        continue;
      }
      const needsUpdate = current.created_by !== yuri.id
        || current.status !== 'fechado'
        || !currentCpf
        || !currentCnh;
      (needsUpdate ? plan.updates : plan.unchanged).push({ ...row, clientId: current.id });
    }

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      tenant: tenant.slug,
      consultant: { id: yuri.id, name: yuri.name, email: yuri.email },
      spreadsheetRows: imported.length,
      matchedToUpdate: plan.updates.length,
      alreadyCorrect: plan.unchanged.length,
      toInsert: plan.inserts.length,
      conflicts: plan.conflicts,
      lastSeenValuesPresent: imported.filter((row) => row.lastSeen !== null && row.lastSeen !== '').length,
    };

    if (plan.conflicts.length) throw new Error(`Importação bloqueada por ${plan.conflicts.length} conflito(s): ${JSON.stringify(report)}`);

    if (apply) {
      await db.query('BEGIN');
      try {
        for (const row of plan.updates) {
          await db.query(
            `UPDATE clients
                SET name = COALESCE(NULLIF(BTRIM(name), ''), $1),
                    cpf = COALESCE(NULLIF(BTRIM(cpf), ''), $2),
                    cnh = COALESCE(NULLIF(BTRIM(cnh), ''), $3),
                    status = 'fechado',
                    created_by = $4,
                    updated_at = NOW()
              WHERE id = $5 AND tenant_id = $6`,
            [row.name, row.cpf, row.cnh, yuri.id, row.clientId, tenant.id],
          );
        }
        for (const row of plan.inserts) {
          await db.query(
            `INSERT INTO clients (tenant_id, name, cpf, cnh, status, created_by)
             VALUES ($1, $2, $3, $4, 'fechado', $5)`,
            [tenant.id, row.name, row.cpf, row.cnh, yuri.id],
          );
        }
        await db.query('COMMIT');
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
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
