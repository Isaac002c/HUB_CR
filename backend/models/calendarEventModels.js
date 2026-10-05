const pool = require('../config/db');

// ============================================
// CALENDAR EVENTS MODEL — eventos/agendamentos
// Tudo escopado por tenant_id.
// ============================================

const toStrOrNull  = (v) => (v === '' || v === undefined ? null : v);
const toTimeOrNull = (v) => (v === '' || v == null ? null : v);
const toUuidOrNull = (v) => (v === '' || v == null ? null : v);
const toDateOrNull = (v) => (v === '' || v == null ? null : v);
const toIntOrNull  = (v) => {
  if (v === '' || v == null) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
};
const digitsOrNull = (v) => {
  if (v === '' || v == null) return null;
  const d = String(v).replace(/\D/g, '');
  return d || null;
};
// Valor monetário: aceita number ou string ("150,00", "1.500,00", "150.00"); inválido → null.
const toMoneyOrNull = (v) => {
  if (v === '' || v == null) return null;
  let n;
  if (typeof v === 'number') { n = v; }
  else {
    let s = String(v).trim().replace(/[^\d.,-]/g, '');
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); // pt-BR: ponto = milhar
    n = parseFloat(s);
  }
  return Number.isFinite(n) ? n : null;
};
// Telefone: livre, truncado no limite da coluna VARCHAR(20).
const phoneOrNull = (v) => {
  const s = toStrOrNull(v);
  return s ? String(s).trim().slice(0, 20) || null : null;
};

// scope: 'upcoming' (>= hoje) | 'past' (< hoje) | 'all'; ou range from/to
const list = async (tenant_id, { scope = 'upcoming', from, to } = {}) => {
  let where = 'WHERE e.tenant_id = $1';
  const params = [tenant_id];
  if (from && to) {
    params.push(from, to);
    where += ` AND e.event_date BETWEEN $2 AND $3`;
  } else if (scope === 'upcoming') {
    where += ` AND e.event_date >= CURRENT_DATE`;
  } else if (scope === 'past') {
    where += ` AND e.event_date < CURRENT_DATE`;
  }
  const order = scope === 'past' ? 'DESC' : 'ASC';
  const r = await pool.query(
    `SELECT e.*, c.name AS client_name, u.name AS responsible_name, st.label AS service_name
       FROM calendar_events e
       LEFT JOIN clients c       ON e.client_id = c.id AND c.tenant_id = e.tenant_id
       LEFT JOIN users   u       ON e.responsible_user_id = u.id
       LEFT JOIN service_types st ON e.service_type_id = st.id
      ${where}
      ORDER BY e.event_date ${order}, e.start_time ASC NULLS LAST
      LIMIT 500`,
    params
  );
  return r.rows;
};

const upcoming = async (tenant_id, limit = 5) => {
  const r = await pool.query(
    `SELECT e.*, c.name AS client_name
       FROM calendar_events e
       LEFT JOIN clients c ON e.client_id = c.id AND c.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1 AND e.status <> 'cancelado' AND e.type <> 'bloqueio' AND e.event_date >= CURRENT_DATE
      ORDER BY e.event_date ASC, e.start_time ASC NULLS LAST
      LIMIT $2`,
    [tenant_id, limit]
  );
  return r.rows;
};

const getById = async (id, tenant_id) => {
  const r = await pool.query('SELECT * FROM calendar_events WHERE id = $1 AND tenant_id = $2', [id, tenant_id]);
  return r.rows[0];
};

// Consultores ativos do tenant para os campos de seleção (apenas id + nome, sem dados sensíveis).
const listConsultants = async (tenant_id) => {
  const r = await pool.query(
    `SELECT id, name FROM users
      WHERE tenant_id = $1
        AND COALESCE(is_active, true) = true
        AND LOWER(role) IN ('master', 'seller', 'supervisor')
      ORDER BY name ASC`,
    [tenant_id]
  );
  return r.rows;
};

const create = async ({
  tenant_id, title, description, event_date, start_time, end_time,
  type, client_id, fine_id, responsible_user_id, status, created_by,
  service_type_id, attendee_cpf, attendee_cnh, attendee_first_cnh, attendee_birth_date,
  value, payment_method, attendee_phone,
}) => {
  if (!tenant_id)   throw new Error('tenant_id é obrigatório');
  if (!title)       throw new Error('title é obrigatório');
  if (!event_date)  throw new Error('event_date é obrigatório');
  const r = await pool.query(
    `INSERT INTO calendar_events
       (tenant_id, title, description, event_date, start_time, end_time, type,
        client_id, fine_id, responsible_user_id, status, created_by,
        service_type_id, attendee_cpf, attendee_cnh, attendee_first_cnh, attendee_birth_date,
        value, payment_method, attendee_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
    [
      tenant_id, title, toStrOrNull(description), event_date,
      toTimeOrNull(start_time), toTimeOrNull(end_time), type || 'outro',
      toUuidOrNull(client_id), toUuidOrNull(fine_id), toUuidOrNull(responsible_user_id),
      status || 'agendado', toUuidOrNull(created_by),
      toIntOrNull(service_type_id), digitsOrNull(attendee_cpf), digitsOrNull(attendee_cnh),
      toDateOrNull(attendee_first_cnh), toDateOrNull(attendee_birth_date),
      toMoneyOrNull(value), toStrOrNull(payment_method), phoneOrNull(attendee_phone),
    ]
  );
  return r.rows[0];
};

const update = async (id, {
  title, description, event_date, start_time, end_time,
  type, client_id, fine_id, responsible_user_id, status,
  service_type_id, attendee_cpf, attendee_cnh, attendee_first_cnh, attendee_birth_date,
  value, payment_method, attendee_phone,
}, tenant_id) => {
  const r = await pool.query(
    `UPDATE calendar_events
        SET title=$1, description=$2, event_date=$3, start_time=$4, end_time=$5, type=$6,
            client_id=$7, fine_id=$8, responsible_user_id=$9, status=$10,
            service_type_id=$11, attendee_cpf=$12, attendee_cnh=$13,
            attendee_first_cnh=$14, attendee_birth_date=$15,
            value=$16, payment_method=$17, attendee_phone=$18, updated_at=NOW()
      WHERE id=$19 AND tenant_id=$20 RETURNING *`,
    [
      title, toStrOrNull(description), event_date, toTimeOrNull(start_time), toTimeOrNull(end_time),
      type || 'outro', toUuidOrNull(client_id), toUuidOrNull(fine_id), toUuidOrNull(responsible_user_id),
      status || 'agendado',
      toIntOrNull(service_type_id), digitsOrNull(attendee_cpf), digitsOrNull(attendee_cnh),
      toDateOrNull(attendee_first_cnh), toDateOrNull(attendee_birth_date),
      toMoneyOrNull(value), toStrOrNull(payment_method), phoneOrNull(attendee_phone),
      id, tenant_id,
    ]
  );
  return r.rows[0];
};

const setStatus = async (id, status, tenant_id) => {
  const r = await pool.query(
    'UPDATE calendar_events SET status=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *',
    [status, id, tenant_id]
  );
  return r.rows[0];
};

const remove = async (id, tenant_id) => {
  const r = await pool.query('DELETE FROM calendar_events WHERE id=$1 AND tenant_id=$2 RETURNING *', [id, tenant_id]);
  return r.rows[0];
};

// ── Bloqueios (dia inteiro + parciais) ──────────────────────────────────────
// Bloqueio = type='bloqueio'. Dia inteiro = start_time NULL. Parcial = [start_time, end_time).

// Dia TOTALMENTE fechado? (existe bloqueio de dia inteiro — start_time NULL). Tenant-scoped.
const isDayClosed = async (tenant_id, event_date, excludeId = null) => {
  const r = await pool.query(
    `SELECT 1 FROM calendar_events
      WHERE tenant_id = $1 AND event_date = $2 AND type = 'bloqueio' AND status <> 'cancelado'
        AND start_time IS NULL
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1`,
    [tenant_id, event_date, excludeId]
  );
  return r.rowCount > 0;
};

// Um EVENTO novo cai dentro de um bloqueio PARCIAL? Retorna o bloqueio conflitante (ou undefined).
// Evento sem horário (start NULL) conflita com qualquer bloqueio parcial do dia.
const eventBlockedByPartial = async (tenant_id, event_date, start_time, end_time, excludeId = null) => {
  const r = await pool.query(
    `SELECT title, start_time, end_time FROM calendar_events
      WHERE tenant_id = $1 AND event_date = $2 AND type = 'bloqueio' AND status <> 'cancelado'
        AND start_time IS NOT NULL
        AND ($5::uuid IS NULL OR id <> $5)
        AND (
          $3::time IS NULL
          OR (start_time < COALESCE($4::time, $3::time) AND $3::time < COALESCE(end_time, start_time))
        )
      ORDER BY start_time ASC
      LIMIT 1`,
    [tenant_id, event_date, start_time || null, end_time || null, excludeId]
  );
  return r.rows[0];
};

// Conflito de horário na equipe entre EVENTOS (não-bloqueio). Mantém comportamento atual.
const hasTimeConflict = async (tenant_id, event_date, start_time, end_time, excludeId = null) => {
  if (!start_time) return false;
  const r = await pool.query(
    `SELECT 1 FROM calendar_events
      WHERE tenant_id = $1 AND event_date = $2 AND status <> 'cancelado' AND type <> 'bloqueio'
        AND start_time IS NOT NULL
        AND ($5::uuid IS NULL OR id <> $5)
        AND (
          start_time = $3::time
          OR (start_time < COALESCE($4::time, $3::time) AND $3::time < COALESCE(end_time, start_time))
        )
      LIMIT 1`,
    [tenant_id, event_date, start_time, end_time || null, excludeId]
  );
  return r.rowCount > 0;
};

// Ao criar/editar um BLOQUEIO: eventos (não-bloqueio) que conflitam com o período.
// Bloqueio dia inteiro (start NULL) conflita com todos; evento sem horário conflita com qualquer bloqueio.
const blockConflictEvents = async (tenant_id, event_date, start_time, end_time, excludeId = null) => {
  const r = await pool.query(
    `SELECT id, title, start_time, end_time FROM calendar_events
      WHERE tenant_id = $1 AND event_date = $2 AND type <> 'bloqueio' AND status <> 'cancelado'
        AND ($5::uuid IS NULL OR id <> $5)
        AND (
          $3::time IS NULL
          OR start_time IS NULL
          OR (start_time < COALESCE($4::time, $3::time) AND $3::time < COALESCE(end_time, start_time))
        )
      ORDER BY start_time ASC NULLS FIRST
      LIMIT 20`,
    [tenant_id, event_date, start_time || null, end_time || null, excludeId]
  );
  return r.rows;
};

// Ao criar/editar um BLOQUEIO: já existe outro bloqueio sobreposto no dia?
const blockOverlapsBlock = async (tenant_id, event_date, start_time, end_time, excludeId = null) => {
  const r = await pool.query(
    `SELECT 1 FROM calendar_events
      WHERE tenant_id = $1 AND event_date = $2 AND type = 'bloqueio' AND status <> 'cancelado'
        AND ($5::uuid IS NULL OR id <> $5)
        AND (
          $3::time IS NULL
          OR start_time IS NULL
          OR (start_time < COALESCE($4::time, $3::time) AND $3::time < COALESCE(end_time, start_time))
        )
      LIMIT 1`,
    [tenant_id, event_date, start_time || null, end_time || null, excludeId]
  );
  return r.rowCount > 0;
};

module.exports = {
  list, upcoming, getById, listConsultants, create, update, setStatus, remove,
  isDayClosed, eventBlockedByPartial, hasTimeConflict, blockConflictEvents, blockOverlapsBlock,
};
