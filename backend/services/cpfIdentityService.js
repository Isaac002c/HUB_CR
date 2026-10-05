const pool = require('../config/db');

const normalizeCPF = (value) => String(value || '').replace(/\D/g, '');

async function findCpfConflict({
  tenantId,
  cpf,
  excludeLeadId = null,
  excludeClientId = null,
  linkedLeadId = null,
}) {
  const cpfDigits = normalizeCPF(cpf);
  if (!tenantId || !cpfDigits) return null;

  const result = await pool.query(
    `SELECT source_type, id, name, responsible_name
       FROM (
         SELECT 'lead'::text AS source_type,
                ml.id,
                ml.name,
                COALESCE(u.name, ml.created_by_name) AS responsible_name,
                ml.created_at
           FROM multas_leads ml
           LEFT JOIN users u
             ON u.id = ml.created_by AND u.tenant_id = ml.tenant_id
          WHERE ml.tenant_id = $1
            AND regexp_replace(COALESCE(ml.cpf, ''), '\\D', '', 'g') = $2
            AND ($3::uuid IS NULL OR ml.id <> $3::uuid)
            AND ($5::uuid IS NULL OR ml.id <> $5::uuid)

         UNION ALL

         SELECT 'client'::text AS source_type,
                c.id,
                c.name,
                u.name AS responsible_name,
                c.created_at
           FROM clients c
           LEFT JOIN users u
             ON u.id = c.created_by AND u.tenant_id = c.tenant_id
          WHERE c.tenant_id = $1
            AND regexp_replace(COALESCE(c.cpf, ''), '\\D', '', 'g') = $2
            AND ($4::uuid IS NULL OR c.id <> $4::uuid)
            AND ($3::uuid IS NULL OR c.lead_id IS DISTINCT FROM $3::uuid)
       ) conflicts
      ORDER BY created_at ASC
      LIMIT 1`,
    [tenantId, cpfDigits, excludeLeadId, excludeClientId, linkedLeadId]
  );

  return result.rows[0] || null;
}

function cpfConflictMessage(conflict) {
  if (!conflict) return 'CPF já cadastrado no sistema.';
  const recordType = conflict.source_type === 'lead' ? 'lead' : 'cliente';
  const owner = conflict.responsible_name
    ? `, responsável: ${conflict.responsible_name}`
    : '';
  return `CPF já cadastrado para ${conflict.name || 'outro cadastro'} (${recordType}${owner}). Para trocar o responsável, altere o consultor no cadastro existente.`;
}

function isCpfConflictDatabaseError(error) {
  return error?.code === '23505' && error?.constraint === 'person_cpf_unique_guard';
}

module.exports = {
  normalizeCPF,
  findCpfConflict,
  cpfConflictMessage,
  isCpfConflictDatabaseError,
};
