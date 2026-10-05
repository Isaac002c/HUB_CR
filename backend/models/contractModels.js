const pool = require('../config/db');

const toDateOrNull = (v) => (v === '' || v == null) ? null : v;
const toUuidOrNull = (v) => (v === '' || v == null) ? null : v;
const toStrOrNull = (v) => (v === '' || v == null) ? null : v;

const getServiceTypeCode = async (service_type_id) => {
  if (!service_type_id) return null;
  const result = await pool.query('SELECT code FROM service_types WHERE id = $1', [service_type_id]);
  return result.rows[0]?.code || null;
};

const createContract = async ({
  tenant_id, client_id, company_id, vehicle_id, service_id, organ,
  infraction_type, real_infractor_name, vehicle_plate, vehicle_model, status, value,
  due_date, notes, numero_multa, deadline_date, seller_id,
}) => {
  if (!tenant_id) throw new Error('tenant_id e obrigatorio');
  if (!client_id && !company_id) throw new Error('client_id ou company_id é obrigatório');
  const result = await pool.query(
    `INSERT INTO fines(
      tenant_id, client_id, company_id, vehicle_id, service_type_id, organ,
      infraction_type, real_infractor_name, plate, vehicle_model, stage, value,
      due_date, notes, fine_number, defense_date, seller_id
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
    [
      tenant_id, toUuidOrNull(client_id), toUuidOrNull(company_id), toUuidOrNull(vehicle_id),
      service_id, organ,
      infraction_type, real_infractor_name || null, vehicle_plate, vehicle_model,
      status || 'APRS DEFESA PREVIA', value || 0,
      toDateOrNull(due_date), notes, numero_multa, toDateOrNull(deadline_date),
      toUuidOrNull(seller_id),
    ]
  );
  return result.rows[0];
};

const getContractsByService = async (service_type_id, tenant_id, client_id) => {
  const result = await pool.query(
    `SELECT
      f.id,
      f.tenant_id,
      f.client_id,
      f.service_type_id AS service_id,
      f.fine_number AS numero_multa,
      f.plate AS vehicle_plate,
      f.organ,
      f.infraction_type,
      f.real_infractor_name,
      f.vehicle_model,
      f.infraction_date,
      f.stage AS status,
      f.value,
      f.cost,
      f.paid_value,
      f.due_date,
      f.defense_date AS deadline_date,
      f.notes,
      f.protocol_number,
      f.protocol_date,
      f.protocol_status,
      f.protocol_notes,
      f.protocol_file_url,
      f.created_at,
      f.updated_at,
      st.code AS service_name
     FROM fines f
     LEFT JOIN service_types st ON f.service_type_id = st.id
     WHERE f.service_type_id = $1 AND f.tenant_id = $2 AND f.client_id = $3
     ORDER BY f.created_at DESC`,
    [service_type_id, tenant_id, client_id]
  );
  return result.rows;
};

const getContractsByClient = async (client_id, tenant_id) => {
  const result = await pool.query(
    `SELECT 
      f.id,
      f.fine_number AS numero_multa,
      f.plate AS vehicle_plate,
      f.organ,
      f.stage AS status,
      f.value,
      f.created_at,
      f.updated_at,
      st.code AS service_name
     FROM fines f
     LEFT JOIN service_types st ON f.service_type_id = st.id
     WHERE f.client_id = $1 AND f.tenant_id = $2
     ORDER BY f.created_at DESC`,
    [client_id, tenant_id]
  );
  return result.rows;
};

const getAllContracts = async (tenant_id) => {
  const result = await pool.query(
    `SELECT 
      f.*,
      f.fine_number AS numero_multa,
      f.plate AS vehicle_plate,
      f.stage AS status,
      cl.name AS client_name,
      cl.cpf AS client_cpf,
      cl.phone AS client_phone,
      st.code AS service_name
     FROM fines f
     LEFT JOIN clients cl ON f.client_id = cl.id
     LEFT JOIN service_types st ON f.service_type_id = st.id
     WHERE f.tenant_id = $1
     ORDER BY f.created_at DESC`,
    [tenant_id]
  );
  return result.rows;
};

const getContractsByFilter = async (tenant_id, filters = {}) => {
  let query = `
    SELECT f.*, f.fine_number AS numero_multa, f.plate AS vehicle_plate, f.stage AS status,
      cl.name AS client_name, cl.cpf AS client_cpf, st.code AS service_name
    FROM fines f
    LEFT JOIN clients cl ON f.client_id = cl.id
    LEFT JOIN service_types st ON f.service_type_id = st.id
    WHERE f.tenant_id = $1
  `;
  const params = [tenant_id];
  let i = 2;
  if (filters.client_id)     { query += ` AND f.client_id = $${i}`;       params.push(filters.client_id); i++; }
  if (filters.status)        { query += ` AND f.stage = $${i}`;            params.push(filters.status); i++; }
  if (filters.organ)         { query += ` AND f.organ ILIKE $${i}`;        params.push(`%${filters.organ}%`); i++; }
  if (filters.vehicle_plate) { query += ` AND f.plate ILIKE $${i}`;        params.push(`%${filters.vehicle_plate}%`); i++; }
  query += ' ORDER BY f.created_at DESC';
  const result = await pool.query(query, params);
  return result.rows;
};

const getContractById = async (id, tenant_id) => {
  const result = await pool.query(
    `SELECT f.*, f.fine_number AS numero_multa, f.plate AS vehicle_plate, f.stage AS status,
      cl.name AS client_name, cl.cpf AS client_cpf, cl.phone AS client_phone, cl.email AS client_email,
      st.code AS service_name
     FROM fines f
     LEFT JOIN clients cl ON f.client_id = cl.id
     LEFT JOIN service_types st ON f.service_type_id = st.id
     WHERE f.id = $1 AND f.tenant_id = $2`,
    [id, tenant_id]
  );
  return result.rows[0];
};

const getContractsByStatus = async (tenant_id) => {
  const result = await pool.query(
    `SELECT stage AS status, COUNT(*) as count FROM fines WHERE tenant_id = $1 GROUP BY stage`,
    [tenant_id]
  );
  return result.rows;
};

const getContractsByOrgan = async (tenant_id) => {
  const result = await pool.query(
    `SELECT organ, COUNT(*) as count FROM fines WHERE tenant_id = $1 GROUP BY organ ORDER BY count DESC`,
    [tenant_id]
  );
  return result.rows;
};

const countContracts = async (tenant_id) => {
  const result = await pool.query(
    'SELECT COUNT(*) as total FROM fines WHERE tenant_id = $1',
    [tenant_id]
  );
  return result.rows[0].total;
};

const countActiveContracts = async (tenant_id) => {
  const result = await pool.query(
    `SELECT COUNT(*) as total FROM fines 
     WHERE tenant_id = $1 AND stage NOT IN ('DEFERIDO','INDEFERIDO','CANCELADO')`,
    [tenant_id]
  );
  return result.rows[0].total;
};

const getDashboardStats = async (tenant_id) => {
  const result = await pool.query(
    `SELECT 
      COUNT(*) as total_contracts,
      COUNT(CASE WHEN stage NOT IN ('DEFERIDO','INDEFERIDO','CANCELADO') THEN 1 END) as active_contracts,
      COUNT(CASE WHEN stage = 'DEFERIDO' THEN 1 END) as completed_contracts,
      COUNT(*) FILTER (WHERE UPPER(TRIM(stage)) = 'DEFERIDO') as deferred_count,
      COUNT(CASE WHEN stage = 'CANCELADO' THEN 1 END) as inactive_contracts
    FROM fines WHERE tenant_id = $1`,
    [tenant_id]
  );
  return result.rows[0];
};

const getContractsGroupedByOrgan = async (tenant_id) => {
  const result = await pool.query(
    `SELECT
      COALESCE(f.organ, 'N/A') as organ,
      COUNT(*) as count,
      COUNT(CASE WHEN UPPER(f.stage) NOT IN ('DEFERIDO','INDEFERIDO','CANCELADO') THEN 1 END) as active_count
     FROM fines f
     WHERE f.tenant_id = $1
       AND f.organ IS NOT NULL AND f.organ != ''
     GROUP BY f.organ
     ORDER BY count DESC`,
    [tenant_id]
  );
  return result.rows;
};

const getAPRsByStage = async (tenant_id) => {
  // Agrupa por stage normalizado para exibição unificada no dashboard
  const result = await pool.query(
    `SELECT
       CASE
         WHEN UPPER(f.stage) LIKE '%DEFESA%PREVIA%ANALISE%' OR UPPER(f.stage) LIKE '%DEF%PR%VIA%AN%LISE%'
              THEN 'DEFESA PREVIA - ANALISE'
         WHEN UPPER(f.stage) LIKE '%DEFESA%PREVIA%' OR UPPER(f.stage) = 'APRS DEFESA PREVIA'
              THEN 'APRS DEFESA PREVIA'
         WHEN UPPER(f.stage) LIKE '%1%INSTANCIA%ANALISE%'
              THEN '1 INSTANCIA - ANALISE'
         WHEN UPPER(f.stage) LIKE '%1%INSTANCIA%' OR UPPER(f.stage) = 'APRS 1 INSTANCIA'
              THEN 'APRS 1 INSTANCIA'
         WHEN UPPER(f.stage) LIKE '%2%INSTANCIA%ANALISE%'
              THEN '2 INSTANCIA - ANALISE'
         WHEN UPPER(f.stage) LIKE '%2%INSTANCIA%' OR UPPER(f.stage) = 'APRS 2 INSTANCIA'
              THEN 'APRS 2 INSTANCIA'
         WHEN UPPER(f.stage) = 'MANDATORIA' OR UPPER(f.stage) LIKE '%MANDAT%'
              THEN 'MANDATORIA'
         WHEN UPPER(f.stage) LIKE '%EXCESSO%PONTOS%'
              THEN 'EXCESSO DE PONTOS'
         WHEN UPPER(f.stage) LIKE '%TRANSITO%JULGADO%' OR UPPER(f.stage) LIKE '%TR%NSITO%'
              THEN 'TRANSITO EM JULGADO'
         WHEN UPPER(f.stage) = 'DEFERIDO'  THEN 'DEFERIDO'
         WHEN UPPER(f.stage) = 'INDEFERIDO' THEN 'INDEFERIDO'
         ELSE f.stage
       END AS status,
       COUNT(*) as count
     FROM fines f
     WHERE f.tenant_id = $1
       AND f.stage IS NOT NULL
       AND UPPER(f.stage) NOT IN ('CADASTRO','FINALIZADO','CANCELADO','PENDENTE')
     GROUP BY 1
     HAVING COUNT(*) > 0
     ORDER BY 1`,
    [tenant_id]
  );
  return result.rows;
};

// ownerId (opcional): escopo do CONSULTOR — só processos cujo seller_id = ele.
// real_infractor: 'client' | 'company' — filtra pelo tipo do real infrator.
// Ambos os SELECTs retornam client_id, company_id e vehicle_id (via f.*) para o
// redirecionamento correto (Cliente → cliente; Empresa → veículo/serviço).
const getContractsNearDueDate = async (tenant_id, days = 30, { ownerId = null, realInfractor = null } = {}) => {
  const params = [tenant_id, days];
  let extra = '';
  let i = 3;
  if (ownerId)      { extra += ` AND f.seller_id = $${i}`; params.push(ownerId); i++; }
  if (realInfractor === 'client')  extra += ` AND UPPER(COALESCE(st.code, '')) = 'TRI' AND f.client_id IS NOT NULL`;
  if (realInfractor === 'company') extra += ` AND UPPER(COALESCE(st.code, '')) = 'TRI' AND f.company_id IS NOT NULL`;
  const result = await pool.query(
    `SELECT f.*, f.fine_number AS numero_multa, f.plate AS vehicle_plate, f.stage AS status,
      f.service_type_id AS service_id,
      st.code AS service_code,
      st.label AS service_label,
      COALESCE(cl.name, co.razao_social, co.nome_fantasia) AS client_name,
      COALESCE(cl.phone, co.phone) AS client_phone,
      CASE WHEN UPPER(COALESCE(st.code, '')) = 'TRI' AND f.client_id IS NOT NULL THEN 'client'
           WHEN UPPER(COALESCE(st.code, '')) = 'TRI' AND f.company_id IS NOT NULL THEN 'company'
           ELSE NULL END AS real_infractor_type
     FROM fines f
       LEFT JOIN clients cl   ON f.client_id  = cl.id AND cl.tenant_id = f.tenant_id
       LEFT JOIN companies co ON f.company_id = co.id AND co.tenant_id = f.tenant_id
       LEFT JOIN service_types st ON f.service_type_id = st.id
     WHERE f.tenant_id = $1
       AND f.due_date IS NOT NULL
       AND f.due_date <= NOW() + INTERVAL '1 day' * $2
       AND f.due_date >= NOW()${extra}
     ORDER BY f.due_date ASC`,
    params
  );
  return result.rows;
};

const getOverdueContracts = async (tenant_id, { ownerId = null, realInfractor = null } = {}) => {
  const params = [tenant_id];
  let extra = '';
  let i = 2;
  if (ownerId)      { extra += ` AND f.seller_id = $${i}`; params.push(ownerId); i++; }
  if (realInfractor === 'client')  extra += ` AND UPPER(COALESCE(st.code, '')) = 'TRI' AND f.client_id IS NOT NULL`;
  if (realInfractor === 'company') extra += ` AND UPPER(COALESCE(st.code, '')) = 'TRI' AND f.company_id IS NOT NULL`;
  const result = await pool.query(
    `SELECT f.*, f.fine_number AS numero_multa, f.plate AS vehicle_plate, f.stage AS status,
      f.service_type_id AS service_id,
      st.code AS service_code,
      st.label AS service_label,
      COALESCE(cl.name, co.razao_social, co.nome_fantasia) AS client_name,
      COALESCE(cl.phone, co.phone) AS client_phone,
      CASE WHEN UPPER(COALESCE(st.code, '')) = 'TRI' AND f.client_id IS NOT NULL THEN 'client'
           WHEN UPPER(COALESCE(st.code, '')) = 'TRI' AND f.company_id IS NOT NULL THEN 'company'
           ELSE NULL END AS real_infractor_type
     FROM fines f
       LEFT JOIN clients cl   ON f.client_id  = cl.id AND cl.tenant_id = f.tenant_id
       LEFT JOIN companies co ON f.company_id = co.id AND co.tenant_id = f.tenant_id
       LEFT JOIN service_types st ON f.service_type_id = st.id
     WHERE f.tenant_id = $1
       AND f.due_date IS NOT NULL AND f.due_date < NOW()${extra}
     ORDER BY f.due_date ASC`,
    params
  );
  return result.rows;
};

const getAlerts = async (tenant_id) => {
  const alerts = [];
  const nearDue = await pool.query(
    `SELECT COUNT(*) as count FROM fines WHERE tenant_id=$1
     AND due_date IS NOT NULL AND due_date <= NOW() + INTERVAL '7 days' AND due_date >= NOW()`,
    [tenant_id]
  );
  if (parseInt(nearDue.rows[0].count) > 0)
    alerts.push({ type: 'warning', title: 'Multas proximas ao vencimento', message: `${nearDue.rows[0].count} multa(s) vencem nos proximos 7 dias`, count: parseInt(nearDue.rows[0].count) });

  const overdue = await pool.query(
    `SELECT COUNT(*) as count FROM fines WHERE tenant_id=$1 AND due_date IS NOT NULL AND due_date < NOW()`,
    [tenant_id]
  );
  if (parseInt(overdue.rows[0].count) > 0)
    alerts.push({ type: 'danger', title: 'Multas vencidas', message: `${overdue.rows[0].count} multa(s) estao vencidas`, count: parseInt(overdue.rows[0].count) });

  return alerts;
};

const updateContract = async (id, payload, tenant_id) => {
  const currentResult = await pool.query(
    'SELECT * FROM fines WHERE id = $1 AND tenant_id = $2',
    [id, tenant_id],
  );
  const current = currentResult.rows[0];
  if (!current) return undefined;

  // Os formulários editam subconjuntos diferentes do processo. Preserva tudo
  // que não veio no payload para uma edição de frota não apagar dados financeiros,
  // protocolo ou vínculos preenchidos em outras telas.
  const valueOf = (key, fallback) => (
    Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : fallback
  );
  const result = await pool.query(
    `UPDATE fines
     SET service_type_id=$1,
         organ=$2, infraction_type=$3, plate=$4, vehicle_model=$5,
         real_infractor_name=$6,
         stage=$7, value=$8, due_date=$9, notes=$10,
         fine_number=$11, defense_date=$12,
         protocol_number=$13, protocol_date=$14,
         protocol_status=$15, protocol_notes=$16,
         protocol_file_url=$17,
         company_id=$18,
         vehicle_id=$19,
         updated_at=NOW()
     WHERE id=$20 AND tenant_id=$21 RETURNING *`,
    [
      toUuidOrNull(valueOf('service_id', current.service_type_id)),
      valueOf('organ', current.organ),
      valueOf('infraction_type', current.infraction_type),
      valueOf('vehicle_plate', current.plate),
      valueOf('vehicle_model', current.vehicle_model),
      toStrOrNull(valueOf('real_infractor_name', current.real_infractor_name)),
      valueOf('status', current.stage),
      valueOf('value', current.value),
      toDateOrNull(valueOf('due_date', current.due_date)),
      valueOf('notes', current.notes),
      valueOf('numero_multa', current.fine_number),
      toDateOrNull(valueOf('deadline_date', current.defense_date)),
      toStrOrNull(valueOf('protocol_number', current.protocol_number)),
      toDateOrNull(valueOf('protocol_date', current.protocol_date)),
      toStrOrNull(valueOf('protocol_status', current.protocol_status)),
      toStrOrNull(valueOf('protocol_notes', current.protocol_notes)),
      toStrOrNull(valueOf('protocol_file_url', current.protocol_file_url)),
      toUuidOrNull(valueOf('company_id', current.company_id)),
      toUuidOrNull(valueOf('vehicle_id', current.vehicle_id)),
      id, tenant_id,
    ]
  );
  return result.rows[0];
};

// Atualiza apenas os campos de protocolo — não toca nos demais campos do contrato
const patchContractProtocol = async (id, {
  protocol_number, protocol_date, protocol_status, protocol_notes, protocol_file_url
}, tenant_id) => {
  const result = await pool.query(
    `UPDATE fines
     SET protocol_number=$1, protocol_date=$2, protocol_status=$3,
         protocol_notes=$4, protocol_file_url=$5, updated_at=NOW()
     WHERE id=$6 AND tenant_id=$7 RETURNING *`,
    [
      protocol_number || null,
      toDateOrNull(protocol_date),
      protocol_status || null,
      protocol_notes  || null,
      protocol_file_url || null,
      id, tenant_id,
    ]
  );
  return result.rows[0];
};

const updateContractStatus = async (id, status, tenant_id) => {
  const result = await pool.query(
    `UPDATE fines SET stage=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *`,
    [status, id, tenant_id]
  );
  return result.rows[0];
};

const deleteContract = async (id, tenant_id) => {
  const result = await pool.query(
    'DELETE FROM fines WHERE id=$1 AND tenant_id=$2 RETURNING *',
    [id, tenant_id]
  );
  return result.rows[0];
};

// Retorna clientes agrupados por macro-etapa (Defesa Prévia / 1ª / 2ª Instância)
// com sub-grupos APRs e Análise
const getClientsByStageGroup = async (tenant_id) => {
  const result = await pool.query(
    `SELECT
       c.id          AS client_id,
       co.id         AS company_id,
       COALESCE(c.name, co.razao_social, co.nome_fantasia) AS client_name,
       COALESCE(c.phone, co.phone)                         AS client_phone,
       c.cpf         AS client_cpf,
       f.id          AS fine_id,
       f.fine_number,
       f.organ,
       f.plate,
       f.due_date,
       f.stage,
       CASE
         WHEN UPPER(f.stage) = 'APRS DEFESA PREVIA'
           OR UPPER(f.stage) LIKE '%DEF%PR%VIA%' AND UPPER(f.stage) NOT LIKE '%ANAL%'
           THEN 'defesa_aprs'
         WHEN UPPER(f.stage) LIKE '%DEFESA%PREVIA%ANALISE%'
           OR UPPER(f.stage) LIKE '%DEF%PR%VIA%AN%'
           THEN 'defesa_analise'
         WHEN UPPER(f.stage) = 'APRS 1 INSTANCIA'
           OR (UPPER(f.stage) LIKE '%1%INST%' AND UPPER(f.stage) NOT LIKE '%ANAL%')
           THEN 'inst1_aprs'
         WHEN UPPER(f.stage) LIKE '%1%INSTANCIA%ANALISE%'
           OR (UPPER(f.stage) LIKE '%1%INST%' AND UPPER(f.stage) LIKE '%ANAL%')
           THEN 'inst1_analise'
         WHEN UPPER(f.stage) = 'APRS 2 INSTANCIA'
           OR (UPPER(f.stage) LIKE '%2%INST%' AND UPPER(f.stage) NOT LIKE '%ANAL%')
           THEN 'inst2_aprs'
         WHEN UPPER(f.stage) LIKE '%2%INSTANCIA%ANALISE%'
           OR (UPPER(f.stage) LIKE '%2%INST%' AND UPPER(f.stage) LIKE '%ANAL%')
           THEN 'inst2_analise'
       END AS sub_group
     FROM fines f
     LEFT JOIN clients c    ON f.client_id  = c.id  AND c.tenant_id  = f.tenant_id
     LEFT JOIN companies co ON f.company_id = co.id AND co.tenant_id = f.tenant_id
     WHERE f.tenant_id = $1
       AND (
         UPPER(f.stage) IN (
           'APRS DEFESA PREVIA','DEFESA PREVIA - ANALISE',
           'APRS 1 INSTANCIA','1 INSTANCIA - ANALISE',
           'APRS 2 INSTANCIA','2 INSTANCIA - ANALISE'
         )
         OR UPPER(f.stage) LIKE '%DEF%PR%VIA%'
         OR UPPER(f.stage) LIKE '%1%INST%'
         OR UPPER(f.stage) LIKE '%2%INST%'
       )
     ORDER BY COALESCE(c.name, co.razao_social, co.nome_fantasia) ASC`,
    [tenant_id]
  );
  return result.rows;
};

// Lista de processos DEFERIDOS (cliente OU empresa) — prova social, tenant-scoped
const getDeferred = async (tenant_id) => {
  const result = await pool.query(
    `SELECT
       f.id,
       f.fine_number AS numero_multa,
       f.plate       AS vehicle_plate,
       f.organ,
       f.infraction_type,
       f.notes,
       f.due_date,
       f.updated_at,
       f.stage       AS status,
       f.deferred_image_url,
       f.deferred_image_updated_at,
       c.id          AS client_id,
       co.id         AS company_id,
       COALESCE(c.name, co.razao_social, co.nome_fantasia) AS client_name
     FROM fines f
       LEFT JOIN clients c    ON f.client_id  = c.id  AND c.tenant_id  = f.tenant_id
       LEFT JOIN companies co ON f.company_id = co.id AND co.tenant_id = f.tenant_id
     WHERE f.tenant_id = $1
       AND UPPER(TRIM(f.stage)) = 'DEFERIDO'
     ORDER BY f.updated_at DESC NULLS LAST
     LIMIT 500`,
    [tenant_id]
  );
  return result.rows;
};

// Universo de processos TRI exibido no dashboard. Inclui registros com o nome
// preenchido e pendências, com ou sem prazo, para o processo não desaparecer
// da visão geral assim que o real infrator for informado.
const getRealInfractorAlerts = async (tenant_id, { ownerId = null } = {}) => {
  const params = [tenant_id];
  let ownerClause = '';
  if (ownerId) {
    params.push(ownerId);
    ownerClause = ' AND f.seller_id = $2';
  }
  const result = await pool.query(
    `SELECT f.id,
            f.fine_number AS numero_multa,
            f.plate AS vehicle_plate,
            f.organ,
            f.infraction_type,
            f.real_infractor_name,
            f.due_date,
            f.stage AS status,
            f.client_id,
            f.company_id,
            COALESCE(
              f.vehicle_id,
              (
                SELECT cv.id
                  FROM company_vehicles cv
                 WHERE cv.tenant_id = f.tenant_id
                   AND cv.company_id = f.company_id
                   AND NULLIF(TRIM(f.plate), '') IS NOT NULL
                   AND REGEXP_REPLACE(UPPER(COALESCE(cv.plate, '')), '[^A-Z0-9]', '', 'g') =
                       REGEXP_REPLACE(UPPER(f.plate), '[^A-Z0-9]', '', 'g')
                 ORDER BY cv.id
                 LIMIT 1
              )
            ) AS vehicle_id,
            COALESCE(c.name, co.razao_social, co.nome_fantasia) AS client_name
       FROM fines f
       JOIN service_types st ON st.id = f.service_type_id
       LEFT JOIN clients c ON c.id = f.client_id AND c.tenant_id = f.tenant_id
       LEFT JOIN companies co ON co.id = f.company_id AND co.tenant_id = f.tenant_id
      WHERE f.tenant_id = $1
        AND UPPER(COALESCE(st.code, '')) = 'TRI'
        AND UPPER(COALESCE(f.stage, '')) <> 'CANCELADO'${ownerClause}
      ORDER BY
        CASE WHEN NULLIF(TRIM(COALESCE(f.real_infractor_name, '')), '') IS NULL THEN 0 ELSE 1 END,
        f.updated_at DESC NULLS LAST,
        f.due_date ASC NULLS LAST
      LIMIT 500`,
    params,
  );
  return result.rows;
};

const updateDeferredImage = async (id, tenant_id, deferred_image_url) => {
  const result = await pool.query(
    `UPDATE fines
        SET deferred_image_url = $1,
            deferred_image_updated_at = NOW(),
            updated_at = NOW()
      WHERE id = $2
        AND tenant_id = $3
        AND UPPER(TRIM(stage)) = 'DEFERIDO'
      RETURNING id, deferred_image_url, deferred_image_updated_at`,
    [deferred_image_url || null, id, tenant_id]
  );
  return result.rows[0];
};

// Remove apenas a imagem da vitrine; o processo deferido e seu histórico
// permanecem intactos. A URL antiga volta para a rota, para que ela possa
// remover o arquivo gerenciado do storage após a atualização do banco.
const removeDeferredImage = async (id, tenant_id) => {
  const result = await pool.query(
    `WITH current_image AS (
       SELECT id, deferred_image_url
         FROM fines
        WHERE id = $1
          AND tenant_id = $2
          AND UPPER(TRIM(stage)) = 'DEFERIDO'
     )
     UPDATE fines f
        SET deferred_image_url = NULL,
            deferred_image_updated_at = NOW(),
            updated_at = NOW()
       FROM current_image ci
      WHERE f.id = ci.id
      RETURNING f.id, ci.deferred_image_url AS removed_image_url`,
    [id, tenant_id]
  );
  return result.rows[0];
};

module.exports = {
  createContract, getServiceTypeCode, getAllContracts, getContractsByFilter, getContractById,
  getContractsByClient, getContractsByService, getContractsByStatus,
  getContractsByOrgan, countContracts, countActiveContracts, getDashboardStats,
  getContractsGroupedByOrgan, getAPRsByStage, getContractsNearDueDate,
  getOverdueContracts, getAlerts, updateContract, patchContractProtocol,
  updateContractStatus, deleteContract, getClientsByStageGroup, getDeferred, getRealInfractorAlerts,
  updateDeferredImage, removeDeferredImage,
};
