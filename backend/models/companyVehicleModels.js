const pool = require('../config/db');

// ============================================
// COMPANY VEHICLES MODEL - Veículos/frota da empresa
// Tudo escopado por tenant_id + company_id.
// ============================================

const toStrOrNull = (v) => (v === '' || v === undefined ? null : v);
const toIntOrNull = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
const digitsOrNull = (v) => {
  if (v === '' || v === undefined || v === null) return null;
  const d = String(v).replace(/\D/g, '');
  return d || null;
};

const listByCompany = async (company_id, tenant_id) => {
  const r = await pool.query(
    'SELECT * FROM company_vehicles WHERE company_id = $1 AND tenant_id = $2 ORDER BY created_at ASC',
    [company_id, tenant_id]
  );
  return r.rows;
};

const create = async ({ tenant_id, company_id, plate, brand, model, year, renavam, notes, status, owner_document, driver_name, driver_cpf, driver_cnh }) => {
  if (!tenant_id) throw new Error('tenant_id é obrigatório');
  if (!company_id) throw new Error('company_id é obrigatório');
  const r = await pool.query(
    `INSERT INTO company_vehicles
       (tenant_id, company_id, plate, brand, model, year, renavam, notes, status,
        owner_document, driver_name, driver_cpf, driver_cnh)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [
      tenant_id, company_id, toStrOrNull(plate), toStrOrNull(brand), toStrOrNull(model),
      toIntOrNull(year), toStrOrNull(renavam), toStrOrNull(notes), status || 'ativo',
      digitsOrNull(owner_document), toStrOrNull(driver_name), digitsOrNull(driver_cpf), digitsOrNull(driver_cnh),
    ]
  );
  return r.rows[0];
};

const getById = async (id, tenant_id) => {
  const r = await pool.query('SELECT * FROM company_vehicles WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
  return r.rows[0];
};

// Atualização preserva year/brand/model/notes legados: só sobrescreve se a chave vier no payload.
const update = async (id, payload, tenant_id) => {
  const current = await getById(id, tenant_id);
  if (!current) return undefined;
  const m = (k, fallback) => (payload[k] === undefined ? fallback : payload[k]);
  const r = await pool.query(
    `UPDATE company_vehicles
        SET plate=$1, brand=$2, model=$3, year=$4, renavam=$5, notes=$6, status=$7,
            owner_document=$8, driver_name=$9, driver_cpf=$10, driver_cnh=$11, updated_at=NOW()
      WHERE id=$12 AND tenant_id=$13 RETURNING *`,
    [
      toStrOrNull(m('plate', current.plate)),
      toStrOrNull(m('brand', current.brand)),
      toStrOrNull(m('model', current.model)),
      toIntOrNull(m('year', current.year)),
      toStrOrNull(m('renavam', current.renavam)),
      toStrOrNull(m('notes', current.notes)),
      payload.status || current.status || 'ativo',
      digitsOrNull(m('owner_document', current.owner_document)),
      toStrOrNull(m('driver_name', current.driver_name)),
      digitsOrNull(m('driver_cpf', current.driver_cpf)),
      digitsOrNull(m('driver_cnh', current.driver_cnh)),
      id, tenant_id,
    ]
  );
  return r.rows[0];
};

const setStatus = async (id, status, tenant_id) => {
  const r = await pool.query(
    'UPDATE company_vehicles SET status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *',
    [status, id, tenant_id]
  );
  return r.rows[0];
};

const countVehicleFines = async (id, tenant_id) => {
  const r = await pool.query(
    'SELECT COUNT(*)::int AS total FROM fines WHERE vehicle_id = $1 AND tenant_id = $2',
    [id, tenant_id]
  );
  return r.rows[0].total;
};

// Contagem (leve) de processos por veículo da empresa, numa única query (sem N+1).
// Inclui vinculados (vehicle_id) + correspondência por placa (vehicle_id NULL e placa igual).
const getVehicleFineCounts = async (company_id, tenant_id) => {
  const r = await pool.query(
    `SELECT v.id AS vehicle_id,
            COUNT(f.id)::int AS total
       FROM company_vehicles v
       LEFT JOIN fines f
         ON f.tenant_id = v.tenant_id
        AND (
          f.vehicle_id = v.id
          OR (f.vehicle_id IS NULL AND v.plate IS NOT NULL
              AND UPPER(TRIM(f.plate)) = UPPER(TRIM(v.plate)))
        )
      WHERE v.company_id = $1 AND v.tenant_id = $2
      GROUP BY v.id`,
    [company_id, tenant_id]
  );
  const map = {};
  for (const row of r.rows) map[row.vehicle_id] = row.total;
  return map;
};

// Cláusula comum: processos do veículo = vinculados por vehicle_id OU correspondência por placa.
const VEHICLE_FINES_WHERE = `
  f.tenant_id = $2
  AND (
    f.vehicle_id = $1
    OR (f.vehicle_id IS NULL AND $3 <> '' AND UPPER(TRIM(f.plate)) = UPPER(TRIM($3)))
  )`;

// Processos do veículo, paginados, com filtro opcional de andamento (stage).
// $1 vehicle_id, $2 tenant_id, $3 plate, $4 status(''=todos), $5 limit, $6 offset
const getVehicleFines = async (vehicle_id, tenant_id, plate, { status = '', limit = 25, offset = 0 } = {}) => {
  const r = await pool.query(
    `SELECT f.id,
            f.fine_number AS numero_multa,
            f.plate       AS vehicle_plate,
            f.organ,
            f.infraction_type,
            f.stage       AS status,
            f.due_date,
            f.notes,
            f.real_infractor_name,
            f.service_type_id AS service_id,
            f.company_id,
            f.vehicle_id,
            f.protocol_number, f.protocol_date, f.protocol_status, f.protocol_notes, f.protocol_file_url,
            st.code  AS service_name,
            st.label AS service_label,
            (f.vehicle_id = $1) AS linked
       FROM fines f
       LEFT JOIN service_types st ON f.service_type_id = st.id
      WHERE ${VEHICLE_FINES_WHERE}
        AND ($4 = '' OR f.stage = $4)
      ORDER BY (f.vehicle_id = $1) DESC, f.created_at DESC
      LIMIT $5 OFFSET $6`,
    [vehicle_id, tenant_id, plate || '', status || '', limit, offset]
  );
  return r.rows;
};

const countVehicleFinesView = async (vehicle_id, tenant_id, plate, { status = '' } = {}) => {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM fines f
      WHERE ${VEHICLE_FINES_WHERE}
        AND ($4 = '' OR f.stage = $4)`,
    [vehicle_id, tenant_id, plate || '', status || '']
  );
  return r.rows[0].total;
};

// Vincula um processo (fine) a um veículo: só preenche vehicle_id e company_id (se nulo).
// NÃO altera prazos, protocolos, documentos ou histórico. Ownership validado na rota.
const linkFineToVehicle = async (fine_id, vehicle_id, company_id, tenant_id) => {
  const r = await pool.query(
    `UPDATE fines
        SET vehicle_id = $1,
            company_id = COALESCE(company_id, $2),
            updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4
      RETURNING *`,
    [vehicle_id, company_id, fine_id, tenant_id]
  );
  return r.rows[0];
};

const remove = async (id, tenant_id) => {
  const r = await pool.query('DELETE FROM company_vehicles WHERE id=$1 AND tenant_id=$2 RETURNING *', [id, tenant_id]);
  return r.rows[0];
};

module.exports = {
  listByCompany, create, getById, update, setStatus, countVehicleFines,
  getVehicleFineCounts, getVehicleFines, countVehicleFinesView, linkFineToVehicle, remove,
};
