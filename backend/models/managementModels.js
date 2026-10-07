// ============================================================================
// models/managementModels.js — MÓDULO GESTÃO
// Agregações no BANCO (evita N+1). Fonte de verdade da venda: tabela `sales`.
// Dinheiro em NUMERIC. Fechamento mensal usa a data real da venda (closed_at).
// Todas as queries são tenant-scoped; team/seller são filtros opcionais.
// ============================================================================

const pool = require('../config/db');
const { randomUUID } = require('crypto');
const {
  SUPERVISOR_PERSONAL_PERCENTAGE,
  SUPERVISOR_TEAM_PERCENTAGE,
  commissionPolicyForRole,
} = require('../config/commissionPolicy');

function domainError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function getPersonalNote(userId, tenantId) {
  const result = await pool.query(
    'SELECT personal_notes FROM users WHERE id = $1 AND tenant_id = $2',
    [userId, tenantId],
  );
  return result.rows[0]?.personal_notes || '';
}

async function updatePersonalNote(userId, tenantId, note) {
  const result = await pool.query(
    `UPDATE users
        SET personal_notes = $1,
            updated_at = NOW()
      WHERE id = $2 AND tenant_id = $3
      RETURNING personal_notes`,
    [note, userId, tenantId],
  );
  if (!result.rowCount) throw domainError('Colaborador não encontrado.', 'INVALID_COLLABORATOR');
  return result.rows[0].personal_notes || '';
}

async function validateAssociations(client, tenantId, { teamId, supervisorId } = {}) {
  if (teamId) {
    const team = await client.query('SELECT id FROM teams WHERE id = $1 AND tenant_id = $2', [teamId, tenantId]);
    if (!team.rowCount) throw domainError('Equipe não encontrada para esta empresa.', 'INVALID_TEAM');
  }
  if (supervisorId) {
    const supervisor = await client.query(
      `SELECT id FROM users
        WHERE id = $1 AND tenant_id = $2 AND COALESCE(is_active, true)`,
      [supervisorId, tenantId]
    );
    if (!supervisor.rowCount) throw domainError('Supervisor não encontrado ou inativo.', 'INVALID_SUPERVISOR');
  }
}

// Constrói o filtro de vendas comum a todas as agregações.
// - teamId  → snapshot da equipe no fechamento. Transferências posteriores não
//   movem vendas entre competências/equipes.
// - sellerId → vendas daquele vendedor.
// - Exclui vendas canceladas.
function salesFilter(tenantId, { start, end, teamId, sellerId, supervisorId } = {}, startIndex = 1) {
  const clauses = [
    `s.tenant_id = $${startIndex}`,
    `LOWER(COALESCE(s.status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')`,
  ];
  const params = [tenantId];
  let i = startIndex + 1;
  if (start) { clauses.push(`s.closed_at >= $${i}`); params.push(start); i++; }
  if (end)   { clauses.push(`s.closed_at <  $${i}`); params.push(end);   i++; }
  if (teamId)   { clauses.push(`s.team_id = $${i}`); params.push(teamId); i++; }
  if (sellerId) { clauses.push(`s.seller_id = $${i}`);    params.push(sellerId); i++; }
  if (supervisorId) {
    clauses.push(`(LOWER(COALESCE(s.seller_role_snapshot, seller.role, '')) = 'seller' OR s.seller_id = $${i})`);
    params.push(supervisorId); i++;
  }
  return { where: clauses.join(' AND '), params, nextIndex: i };
}

// ─── VISÃO GERAL (KPIs do período) ───────────────────────────────────────────
async function getOverview(tenantId, opts = {}) {
  const { where, params } = salesFilter(tenantId, opts);
  const r = await pool.query(
    `SELECT
        COALESCE(SUM(s.amount), 0)            AS total_amount,
        COUNT(*)                              AS sales_count,
        COALESCE(SUM(s.commission_amount), 0) AS total_commission,
        CASE WHEN COUNT(*) > 0
             THEN ROUND(COALESCE(SUM(s.amount),0) / COUNT(*), 2)
             ELSE 0 END                       AS avg_ticket,
        COUNT(DISTINCT s.seller_id)           AS active_sellers
       FROM sales s
       LEFT JOIN users seller ON seller.id = s.seller_id
      WHERE ${where}`,
    params
  );
  return r.rows[0];
}

// ─── RANKING DE VENDEDORES (pódio + classificação) ───────────────────────────
// Ordena por VALOR TOTAL VENDIDO desc; empate: maior nº de vendas; depois venda
// mais recente (exatamente as regras do requisito).
async function getRanking(tenantId, opts = {}) {
  const { where, params } = salesFilter(tenantId, opts);
  const r = await pool.query(
    `SELECT
        s.seller_id,
        seller.name           AS seller_name,
        seller.avatar         AS seller_avatar,
        s.team_id             AS team_id,
        t.name                AS team_name,
        COALESCE(MAX(s.commission_percentage), 0) AS commission_percentage,
        COUNT(*)                              AS sales_count,
        COALESCE(SUM(s.amount), 0)            AS total_amount,
        COALESCE(SUM(s.commission_amount), 0) AS total_commission,
        MAX(s.closed_at)                      AS last_sale
       FROM sales s
       JOIN users seller ON seller.id = s.seller_id
       LEFT JOIN teams t ON t.id = s.team_id AND t.tenant_id = s.tenant_id
      WHERE ${where}
      GROUP BY s.seller_id, seller.name, seller.avatar, s.team_id, t.name
      ORDER BY total_amount DESC, sales_count DESC, last_sale DESC NULLS LAST`,
    params
  );
  return r.rows.map((row, idx) => ({ ...row, position: idx + 1 }));
}

// ─── EVOLUÇÃO MÊS A MÊS ──────────────────────────────────────────────────────
// Últimos N meses (default 12) até o mês corrente. Um ponto por mês (0 se vazio).
async function getMonthlyEvolution(tenantId, { months = 12, teamId, sellerId, supervisorId } = {}) {
  const clauses = [`s.tenant_id = $1`, `LOWER(COALESCE(s.status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')`];
  const params = [tenantId];
  let i = 2;
  if (sellerId) { clauses.push(`s.seller_id = $${i}`); params.push(sellerId); i++; }
  if (teamId)   { clauses.push(`s.team_id = $${i}`); params.push(teamId); i++; }
  if (supervisorId) {
    clauses.push(`(LOWER(COALESCE(s.seller_role_snapshot, '')) = 'seller' OR s.seller_id = $${i})`);
    params.push(supervisorId); i++;
  }
  params.push(months);
  const monthsIdx = i;

  const r = await pool.query(
    `WITH series AS (
        SELECT date_trunc('month', (date_trunc('month', CURRENT_DATE) - (gs || ' month')::interval))::date AS month_start
          FROM generate_series(0, $${monthsIdx}::int - 1) AS gs
     ),
     agg AS (
        SELECT date_trunc('month', s.closed_at)::date        AS month_start,
               COALESCE(SUM(s.amount), 0)                    AS total_amount,
               COUNT(s.id)                                   AS sales_count,
               COALESCE(SUM(s.commission_amount), 0)         AS total_commission
          FROM sales s
         WHERE ${clauses.join(' AND ')}
           AND s.closed_at >= (date_trunc('month', CURRENT_DATE) - (($${monthsIdx}::int - 1) || ' month')::interval)
         GROUP BY 1
     )
     SELECT
        to_char(series.month_start, 'YYYY-MM')  AS month,
        series.month_start                      AS month_start,
        COALESCE(agg.total_amount, 0)           AS total_amount,
        COALESCE(agg.sales_count, 0)            AS sales_count,
        COALESCE(agg.total_commission, 0)       AS total_commission,
        CASE WHEN COALESCE(agg.sales_count,0) > 0
             THEN ROUND(agg.total_amount / agg.sales_count, 2)
             ELSE 0 END                         AS avg_ticket
       FROM series
       LEFT JOIN agg ON agg.month_start = series.month_start
      ORDER BY series.month_start ASC`,
    params
  );
  return r.rows;
}

// ─── FECHAMENTO DA EQUIPE (período atual) ────────────────────────────────────
async function getTeamClosing(tenantId, teamId, opts = {}) {
  const overview = await getOverview(tenantId, { ...opts, teamId });
  const ranking = await getRanking(tenantId, { ...opts, teamId });
  return { overview, ranking };
}

function buildSupervisionCommission(teamAmountValue, personalAmountValue) {
  const teamAmount = Number(teamAmountValue || 0);
  const personalAmount = Number(personalAmountValue || 0);
  const consultantAmount = Math.max(teamAmount - personalAmount, 0);
  const personalCommission = computeCommission(personalAmount, SUPERVISOR_PERSONAL_PERCENTAGE);
  const teamCommission = computeCommission(consultantAmount, SUPERVISOR_TEAM_PERCENTAGE);
  return {
    personal_sales_base: personalAmount.toFixed(2),
    personal_percentage: SUPERVISOR_PERSONAL_PERCENTAGE,
    personal_commission: personalCommission.toFixed(2),
    team_sales_base: consultantAmount.toFixed(2),
    team_percentage: SUPERVISOR_TEAM_PERCENTAGE,
    team_commission: teamCommission.toFixed(2),
    total_commission: (personalCommission + teamCommission).toFixed(2),
  };
}

async function getSupervisionDashboard(tenantId, teamId, supervisorId, period) {
  const scope = { ...period, teamId, supervisorId };
  const [team, personal, ranking, monthly, collaborators, teamTargets, userTargets] = await Promise.all([
    getOverview(tenantId, scope),
    getOverview(tenantId, { ...period, teamId, sellerId: supervisorId }),
    getRanking(tenantId, scope),
    getMonthlyEvolution(tenantId, { months: 12, teamId, supervisorId }),
    getCollaborators(tenantId, {
      teamId,
      monthStart: period.start,
      monthEnd: period.end,
      periodStart: period.start,
      periodEnd: period.end,
    }),
    getTeamTargets(tenantId, period.start, { teamId }),
    getUserTargets(tenantId, period.start, { userId: supervisorId }),
  ]);

  const teamAmount = Number(team.total_amount || 0);
  const personalAmount = Number(personal.total_amount || 0);
  const supervisionCommission = buildSupervisionCommission(teamAmount, personalAmount);
  const personalCommission = Number(supervisionCommission.personal_commission);
  const targetRow = teamTargets[0] || { amount: null, configured: false };
  const targetAmount = targetRow.configured ? Number(targetRow.amount || 0) : null;
  const personalTargetRow = userTargets[0] || { amount: null, configured: false };
  const personalTarget = personalTargetRow.configured ? Number(personalTargetRow.amount || 0) : null;

  const consultants = collaborators
    .filter((row) => String(row.role || '').toLowerCase() === 'seller')
    .map((row) => {
      const sold = Number(row.sold_period || 0);
      const target = row.monthly_target_configured ? Number(row.monthly_sales_target || 0) : null;
      return {
        ...row,
        target_remaining: target === null ? null : Math.max(target - sold, 0).toFixed(2),
        target_progress: target > 0 ? ((sold / target) * 100).toFixed(2) : '0.00',
      };
    });

  return {
    team: {
      ...team,
      target_amount: targetAmount,
      target_configured: targetRow.configured === true,
      target_remaining: targetAmount === null ? null : Math.max(targetAmount - teamAmount, 0).toFixed(2),
      target_progress: targetAmount > 0 ? ((teamAmount / targetAmount) * 100).toFixed(2) : '0.00',
    },
    personal: {
      ...personal,
      target_amount: personalTarget,
      target_configured: personalTargetRow.configured === true,
      target_remaining: personalTarget === null ? null : Math.max(personalTarget - personalAmount, 0).toFixed(2),
      target_progress: personalTarget > 0 ? ((personalAmount / personalTarget) * 100).toFixed(2) : '0.00',
      commission_percentage: SUPERVISOR_PERSONAL_PERCENTAGE,
      commission_amount: personalCommission.toFixed(2),
    },
    supervision_commission: supervisionCommission,
    ranking,
    monthly,
    consultants,
  };
}

// ─── EQUIPES (CRUD) ──────────────────────────────────────────────────────────
async function getTeams(tenantId) {
  const r = await pool.query(
    `SELECT t.id, t.tenant_id, t.name, t.supervisor_id, t.active, t.created_at, t.updated_at,
            sup.name AS supervisor_name,
            (SELECT COUNT(*) FROM users u WHERE u.team_id = t.id AND COALESCE(u.is_active,true)) AS members_count
       FROM teams t
       LEFT JOIN users sup ON sup.id = t.supervisor_id
      WHERE t.tenant_id = $1
      ORDER BY t.name ASC`,
    [tenantId]
  );
  return r.rows;
}

async function getTeamById(id, tenantId) {
  const r = await pool.query(`SELECT * FROM teams WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rows[0];
}

async function getTeamTargets(tenantId, monthStart, { teamId = null } = {}) {
  const params = [tenantId, monthStart];
  let teamClause = '';
  if (teamId) {
    params.push(teamId);
    teamClause = 'AND t.id = $3';
  }
  const r = await pool.query(
    `SELECT t.id AS team_id, t.name AS team_name,
            mt.id AS target_id, mt.month_start, mt.amount,
            mt.updated_by, updater.name AS updated_by_name, mt.updated_at,
            (mt.id IS NOT NULL) AS configured
       FROM teams t
       LEFT JOIN team_monthly_targets mt
         ON mt.tenant_id = t.tenant_id
        AND mt.team_id = t.id
         AND mt.month_start = $2::date
       LEFT JOIN users updater ON updater.id = mt.updated_by AND updater.tenant_id = mt.tenant_id
      WHERE t.tenant_id = $1
        AND COALESCE(t.active, true)
        ${teamClause}
      ORDER BY t.name ASC`,
    params
  );
  return r.rows;
}

async function upsertTeamTarget({ tenantId, teamId, monthStart, amount, userId }) {
  const r = await pool.query(
    `INSERT INTO team_monthly_targets
       (tenant_id, team_id, month_start, amount, created_by, updated_by)
     SELECT $1, t.id, $3::date, $4, $5, $5
       FROM teams t
      WHERE t.id = $2 AND t.tenant_id = $1
     ON CONFLICT (tenant_id, team_id, month_start)
     DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING *`,
    [tenantId, teamId, monthStart, amount, userId]
  );
  if (!r.rowCount) throw domainError('Equipe não encontrada para esta empresa.', 'INVALID_TEAM');
  return r.rows[0];
}

async function getCompanyTarget(tenantId, monthStart) {
  const r = await pool.query(
    `SELECT cmt.*, true AS configured, updater.name AS updated_by_name
       FROM company_monthly_targets cmt
       LEFT JOIN users updater ON updater.id = cmt.updated_by AND updater.tenant_id = cmt.tenant_id
      WHERE cmt.tenant_id = $1 AND cmt.month_start = $2::date`,
    [tenantId, monthStart]
  );
  return r.rows[0] || {
    tenant_id: tenantId, month_start: monthStart, amount: null, configured: false,
    updated_by: null, updated_by_name: null, updated_at: null,
  };
}

async function upsertCompanyTarget({ tenantId, monthStart, amount, userId }) {
  const r = await pool.query(
    `INSERT INTO company_monthly_targets
       (tenant_id, month_start, amount, created_by, updated_by)
     VALUES ($1, $2::date, $3, $4, $4)
     ON CONFLICT (tenant_id, month_start)
     DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING *, true AS configured`,
    [tenantId, monthStart, amount, userId]
  );
  return r.rows[0];
}

async function getUserTargets(tenantId, monthStart, { teamId = null, userId = null } = {}) {
  const params = [tenantId, monthStart];
  const clauses = [`u.tenant_id = $1`, `COALESCE(u.is_active, true)`];
  let index = 3;
  if (teamId) { clauses.push(`u.team_id = $${index}`); params.push(teamId); index += 1; }
  if (userId) { clauses.push(`u.id = $${index}`); params.push(userId); }
  const r = await pool.query(
    `SELECT u.id AS user_id, u.name AS user_name, LOWER(u.role) AS role,
            u.team_id, t.name AS team_name,
            umt.id AS target_id, umt.month_start, umt.amount,
            (umt.id IS NOT NULL) AS configured,
            umt.updated_by, updater.name AS updated_by_name, umt.updated_at
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id AND t.tenant_id = u.tenant_id
       LEFT JOIN user_monthly_targets umt
         ON umt.tenant_id = u.tenant_id
        AND umt.user_id = u.id
        AND umt.month_start = $2::date
       LEFT JOIN users updater ON updater.id = umt.updated_by AND updater.tenant_id = umt.tenant_id
      WHERE ${clauses.join(' AND ')}
        AND LOWER(u.role) IN ('master','admin','supervisor','seller','manager','operator')
      ORDER BY t.name NULLS LAST, u.name`,
    params
  );
  return r.rows;
}

async function upsertUserTarget({ tenantId, targetUserId, monthStart, amount, userId }) {
  const r = await pool.query(
    `INSERT INTO user_monthly_targets
       (tenant_id, user_id, month_start, amount, created_by, updated_by)
     SELECT $1, u.id, $3::date, $4, $5, $5
       FROM users u
      WHERE u.id = $2 AND u.tenant_id = $1
     ON CONFLICT (tenant_id, user_id, month_start)
     DO UPDATE SET amount = EXCLUDED.amount, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING *, true AS configured`,
    [tenantId, targetUserId, monthStart, amount, userId]
  );
  if (!r.rowCount) throw domainError('Colaborador não encontrado para esta empresa.', 'INVALID_COLLABORATOR');
  return r.rows[0];
}

async function createTeam({ tenant_id, name, supervisor_id = null, active = true }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await validateAssociations(client, tenant_id, { supervisorId: supervisor_id });
    const r = await client.query(
      `INSERT INTO teams (tenant_id, name, supervisor_id, active)
       VALUES ($1, $2, $3, COALESCE($4, true)) RETURNING *`,
      [tenant_id, name, supervisor_id, active]
    );
    if (supervisor_id) {
      await client.query(
        `UPDATE users SET team_id = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [r.rows[0].id, supervisor_id, tenant_id]
      );
    }
    await client.query('COMMIT');
    return r.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateTeam(id, { name, supervisor_id, active }, tenantId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT * FROM teams WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [id, tenantId]
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return null;
    }
    if (supervisor_id !== undefined) {
      await validateAssociations(client, tenantId, { supervisorId: supervisor_id || null });
    }
    const nextSupervisor = supervisor_id === undefined ? current.rows[0].supervisor_id : (supervisor_id || null);
    const r = await client.query(
      `UPDATE teams
          SET name = COALESCE($1, name), supervisor_id = $2,
              active = COALESCE($3, active), updated_at = NOW()
        WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [name, nextSupervisor, active, id, tenantId]
    );
    if (nextSupervisor) {
      await client.query(
        `UPDATE users SET team_id = $1, updated_at = NOW()
          WHERE id = $2 AND tenant_id = $3`,
        [id, nextSupervisor, tenantId]
      );
    }
    await client.query('COMMIT');
    return r.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteTeam(id, tenantId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET team_id = NULL, updated_at = NOW()
        WHERE team_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    const r = await client.query('DELETE FROM teams WHERE id = $1 AND tenant_id = $2 RETURNING id', [id, tenantId]);
    await client.query('COMMIT');
    return r.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ─── COLABORADORES (users + agregados de venda no mês e no período) ──────────
async function getCollaborators(tenantId, { teamId, monthStart, monthEnd, periodStart, periodEnd } = {}) {
  // Agregados por venda com filtros condicionais de data (mês corrente e período).
  const params = [tenantId, monthStart, monthEnd, periodStart, periodEnd];
  let i = 6;
  let teamClause = '';
  let salesTeamClause = '';
  if (teamId) {
    teamClause = `AND u.team_id = $${i}`;
    salesTeamClause = `AND s.team_id = $${i}`;
    params.push(teamId); i++;
  }

  const r = await pool.query(
    `SELECT
        u.id, u.tenant_id, u.name, u.email, u.role, u.position,
        u.team_id, t.name AS team_name,
        u.supervisor_id, sup.name AS supervisor_name,
        u.commission_percentage, u.commission_threshold,
        umt.amount AS monthly_sales_target,
        (umt.id IS NOT NULL) AS monthly_target_configured,
        umt.updated_at AS monthly_target_updated_at,
        COALESCE(u.is_active, true) AS is_active,
        u.hire_date, u.termination_date, u.avatar, u.seller_id,
        u.salary, u.benefits_amount, u.other_monthly_costs,
        u.employer_charges_percentage, u.thirteenth_salary_enabled, u.employment_type,
        CASE WHEN u.thirteenth_salary_enabled THEN ROUND(u.salary / 12, 2) ELSE 0 END AS thirteenth_provision,
        COALESCE((SELECT SUM(cc.amount) FROM collaborator_costs cc
                  WHERE cc.tenant_id = u.tenant_id AND cc.collaborator_id = u.id
                    AND ((NOT cc.recurring AND cc.competence >= $4 AND cc.competence < $5)
                      OR (cc.recurring AND cc.competence < $5 AND (cc.end_date IS NULL OR cc.end_date >= $4)))), 0) AS additional_cost_period,
        COALESCE(SUM(s.amount) FILTER (WHERE s.closed_at >= $2 AND s.closed_at < $3), 0)            AS sold_month,
        COALESCE(SUM(s.commission_amount) FILTER (WHERE s.closed_at >= $2 AND s.closed_at < $3), 0) AS commission_month,
        COALESCE(SUM(s.amount) FILTER (WHERE s.closed_at >= $4 AND s.closed_at < $5), 0)            AS sold_period,
        COALESCE(SUM(s.commission_amount) FILTER (WHERE s.closed_at >= $4 AND s.closed_at < $5), 0) AS commission_period,
        COUNT(s.id) FILTER (WHERE s.closed_at >= $2 AND s.closed_at < $3)                            AS sales_month
       FROM users u
       LEFT JOIN teams t   ON t.id = u.team_id
       LEFT JOIN users sup ON sup.id = u.supervisor_id
       LEFT JOIN user_monthly_targets umt
         ON umt.tenant_id = u.tenant_id AND umt.user_id = u.id AND umt.month_start = $2::date
       LEFT JOIN sales s   ON s.seller_id = u.id AND s.tenant_id = u.tenant_id
        AND LOWER(COALESCE(s.status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')
        ${salesTeamClause}
      WHERE u.tenant_id = $1
        AND LOWER(u.role) NOT IN ('master','super_admin')
        ${teamClause}
      GROUP BY u.id, t.name, sup.name, umt.id
      ORDER BY sold_month DESC, u.name ASC`,
    params
  );
  return r.rows.map((row) => {
    const policy = commissionPolicyForRole(row.role, row);
    return {
      ...row,
      monthly_sales_target: row.monthly_sales_target === null ? null : row.monthly_sales_target,
      commission_percentage: policy.percentage,
      commission_threshold: policy.threshold,
      commission_mode: policy.mode,
    };
  });
}

// Diretório enxuto usado exclusivamente no campo "Responsável pela venda".
// Cada opção corresponde a uma conta real. A MASTER é "CR Recursos" e a
// conta supervisora é "Supervisão", sem aliases apontando para o mesmo id.
async function getSalesResponsibles(tenantId, { level, actorId, teamId } = {}) {
  const params = [tenantId];
  let scopeClause = 'AND FALSE';
  if (level === 'full') {
    scopeClause = `AND LOWER(u.role) IN ('master', 'seller', 'supervisor')`;
  } else if (level === 'team') {
    params.push(actorId || null, teamId || null);
    scopeClause = `AND (
      (LOWER(u.role) = 'seller' AND u.team_id = $3)
      OR (LOWER(u.role) = 'supervisor' AND u.id = $2)
    )`;
  } else if (level === 'own') {
    params.push(actorId || null);
    scopeClause = `AND u.id = $2 AND LOWER(u.role) = 'seller'`;
  }

  const result = await pool.query(
    `SELECT u.id AS seller_id, u.name, LOWER(u.role) AS role
       FROM users u
      WHERE u.tenant_id = $1
        AND COALESCE(u.is_active, true) = true
        ${scopeClause}
      ORDER BY u.name ASC`,
    params,
  );
  return result.rows;
}

async function updateCollaborator(userId, fields, tenantId) {
  fields = { ...fields };
  await validateAssociations(pool, tenantId, {
    teamId: fields.team_id || null,
    supervisorId: fields.supervisor_id || null,
  });
  const allowed = [
    'team_id', 'supervisor_id',
    'hire_date', 'termination_date', 'position', 'is_active', 'salary',
    'benefits_amount', 'other_monthly_costs', 'employer_charges_percentage',
    'thirteenth_salary_enabled', 'employment_type',
  ];
  const sets = [];
  const params = [];
  let i = 1;
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${i}`);
      params.push(fields[key] === '' ? null : fields[key]);
      i++;
    }
  }
  // Campos de identidade, meta ou comissão enviados por clientes antigos são
  // ignorados sem produzir um falso 404; devolvemos a configuração efetiva.
  if (sets.length === 0) return getCollaboratorById(userId, tenantId);
  sets.push(`updated_at = NOW()`);
  params.push(userId, tenantId);
  const r = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} AND tenant_id = $${i + 1}
     RETURNING id, name, email, role, team_id, supervisor_id, commission_percentage,
               commission_threshold, monthly_sales_target,
               hire_date, termination_date, position, COALESCE(is_active,true) AS is_active,
               salary, benefits_amount, other_monthly_costs, employer_charges_percentage,
               thirteenth_salary_enabled, employment_type, updated_at`,
    params
  );
  return r.rows[0];
}

async function getCollaboratorById(userId, tenantId) {
  const r = await pool.query(
    `SELECT id, name, email, role, is_active, team_id, supervisor_id,
            commission_percentage, commission_threshold, monthly_sales_target,
            salary, benefits_amount, other_monthly_costs,
            employer_charges_percentage, thirteenth_salary_enabled, employment_type
       FROM users WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );
  if (!r.rows[0]) return undefined;
  const policy = commissionPolicyForRole(r.rows[0].role, r.rows[0]);
  return {
    ...r.rows[0],
    commission_percentage: policy.percentage,
    commission_threshold: policy.threshold,
    commission_mode: policy.mode,
  };
}

async function getWorkforceSummary(tenantId, { start, end, teamId } = {}) {
  const params = [tenantId, start, end];
  let teamClause = '';
  if (teamId) {
    params.push(teamId);
    teamClause = 'AND u.team_id = $4';
  }
  const r = await pool.query(
    `WITH commissions AS (
       SELECT seller_id, COALESCE(SUM(commission_amount), 0) AS amount
         FROM sales
        WHERE tenant_id = $1
          AND LOWER(COALESCE(status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')
          AND closed_at >= $2 AND closed_at < $3
        GROUP BY seller_id
     ), extra_costs AS (
       SELECT collaborator_id,
              COALESCE(SUM(amount), 0) AS amount,
              COALESCE(SUM(amount) FILTER (WHERE category = 'transport'), 0) AS transport_amount
         FROM collaborator_costs
         WHERE tenant_id = $1
           AND ((NOT recurring AND competence >= $2 AND competence < $3)
             OR (recurring AND competence < $3 AND (end_date IS NULL OR end_date >= $2)))
        GROUP BY collaborator_id
     )
     SELECT u.id, u.name, u.position, u.team_id, t.name AS team_name,
            u.salary, u.benefits_amount, u.other_monthly_costs,
            u.employer_charges_percentage, u.thirteenth_salary_enabled,
            ROUND(u.salary * u.employer_charges_percentage / 100, 2) AS employer_charges,
            CASE WHEN u.thirteenth_salary_enabled THEN ROUND(u.salary / 12, 2) ELSE 0 END AS thirteenth_provision,
            COALESCE(c.amount, 0) AS commission_amount,
            COALESCE(ec.transport_amount, 0) AS transport_costs,
            COALESCE(ec.amount, 0) AS additional_costs
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id AND t.tenant_id = u.tenant_id
       LEFT JOIN commissions c ON c.seller_id = u.id
       LEFT JOIN extra_costs ec ON ec.collaborator_id = u.id
      WHERE u.tenant_id = $1
        AND LOWER(u.role) NOT IN ('master','super_admin')
        AND COALESCE(u.is_active, true)
        ${teamClause}
      ORDER BY u.name`,
    params
  );
  const totals = {
    collaborators: r.rows.length,
    salary: 0,
    benefits: 0,
    otherMonthly: 0,
    employerCharges: 0,
    thirteenthProvision: 0,
    commissions: 0,
    additionalCosts: 0,
    totalPeopleCost: 0,
  };
  const collaborators = r.rows.map((row) => {
    const values = {
      salary: Number(row.salary || 0),
      benefits: Number(row.benefits_amount || 0),
      otherMonthly: Number(row.other_monthly_costs || 0),
      employerCharges: Number(row.employer_charges || 0),
      thirteenthProvision: Number(row.thirteenth_provision || 0),
      commissions: Number(row.commission_amount || 0),
      additionalCosts: Number(row.additional_costs || 0),
    };
    const totalCost = Object.values(values).reduce((sum, value) => sum + value, 0);
    for (const [key, value] of Object.entries(values)) totals[key] += value;
    totals.totalPeopleCost += totalCost;
    return { ...row, total_cost: totalCost.toFixed(2) };
  });
  for (const key of Object.keys(totals)) {
    if (key !== 'collaborators') totals[key] = totals[key].toFixed(2);
  }
  return { totals, collaborators };
}

async function getCollaboratorCosts(tenantId, { start, end, collaboratorId, teamId } = {}) {
  const params = [tenantId, start, end];
  const clauses = [
    'cc.tenant_id = $1',
    `((NOT cc.recurring AND cc.competence >= $2 AND cc.competence < $3)
      OR (cc.recurring AND cc.competence < $3 AND (cc.end_date IS NULL OR cc.end_date >= $2)))`,
  ];
  if (collaboratorId) { params.push(collaboratorId); clauses.push(`cc.collaborator_id = $${params.length}`); }
  if (teamId) { params.push(teamId); clauses.push(`u.team_id = $${params.length}`); }
  const r = await pool.query(
    `SELECT cc.*, u.name AS collaborator_name, t.name AS team_name
       FROM collaborator_costs cc
       JOIN users u ON u.id = cc.collaborator_id AND u.tenant_id = cc.tenant_id
       LEFT JOIN teams t ON t.id = u.team_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY cc.competence DESC, cc.created_at DESC`,
    params
  );
  return r.rows;
}

async function createCollaboratorCost(data) {
  const collaborator = await getCollaboratorById(data.collaborator_id, data.tenant_id);
  if (!collaborator) throw domainError('Colaborador não encontrado.', 'INVALID_COLLABORATOR');
  const r = await pool.query(
    `INSERT INTO collaborator_costs
       (tenant_id, collaborator_id, category, description, amount, competence, recurring, end_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.tenant_id, data.collaborator_id, data.category, data.description,
     data.amount, data.competence, Boolean(data.recurring), data.end_date || null, data.created_by]
  );
  return r.rows[0];
}

// Define o valor exato da passagem na competência. O upsert impede que abrir
// e salvar novamente o modal transforme o valor mensal em um acumulador.
async function setMonthlyTransport({ tenant_id, collaborator_id, amount, competence, created_by }) {
  const collaborator = await getCollaboratorById(collaborator_id, tenant_id);
  if (!collaborator || ['master', 'super_admin'].includes(String(collaborator.role || '').toLowerCase())) {
    throw domainError('Colaborador não encontrado.', 'INVALID_COLLABORATOR');
  }
  const monthStart = `${String(competence).substring(0, 7)}-01`;
  if (Number(amount) === 0) {
    await pool.query(
      `DELETE FROM collaborator_costs
        WHERE tenant_id = $1 AND collaborator_id = $2
          AND category = 'transport' AND NOT recurring
          AND competence = $3::date`,
      [tenant_id, collaborator_id, monthStart]
    );
    return null;
  }
  const result = await pool.query(
    `INSERT INTO collaborator_costs
       (tenant_id, collaborator_id, category, description, amount, competence, recurring, end_date, created_by)
     VALUES ($1, $2, 'transport', 'Passagem', $3, $4::date, false, NULL, $5)
     ON CONFLICT (tenant_id, collaborator_id, competence)
       WHERE category = 'transport' AND NOT recurring
     DO UPDATE SET amount = EXCLUDED.amount,
                   description = 'Passagem',
                   created_by = EXCLUDED.created_by,
                   updated_at = NOW()
     RETURNING *`,
    [tenant_id, collaborator_id, amount, monthStart, created_by]
  );
  return result.rows[0];
}

async function updateCollaboratorCost(id, data, tenantId) {
  if (data.collaborator_id) {
    const collaborator = await getCollaboratorById(data.collaborator_id, tenantId);
    if (!collaborator) throw domainError('Colaborador não encontrado.', 'INVALID_COLLABORATOR');
  }
  const r = await pool.query(
    `UPDATE collaborator_costs SET
       collaborator_id = COALESCE($1, collaborator_id),
       category = COALESCE($2, category), description = COALESCE($3, description),
       amount = COALESCE($4, amount), competence = COALESCE($5, competence),
       recurring = COALESCE($6, recurring), end_date = $7, updated_at = NOW()
     WHERE id = $8 AND tenant_id = $9 RETURNING *`,
    [data.collaborator_id || null, data.category || null, data.description || null,
     data.amount ?? null, data.competence || null,
     data.recurring === undefined ? null : Boolean(data.recurring), data.end_date || null,
     id, tenantId]
  );
  return r.rows[0];
}

async function deleteCollaboratorCost(id, tenantId) {
  const r = await pool.query(
    'DELETE FROM collaborator_costs WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return r.rows[0];
}

// ─── DESPESAS FIXAS E VARIÁVEIS DO ESCRITÓRIO ───────────────────────────────
async function getOfficeExpenses(tenantId, { start, end, expenseType } = {}) {
  const params = [tenantId, start, end];
  const clauses = ['tenant_id = $1', 'competence >= $2', 'competence < $3'];
  if (expenseType) {
    params.push(expenseType);
    clauses.push(`expense_type = $${params.length}`);
  }
  const result = await pool.query(
    `SELECT * FROM office_expenses
      WHERE ${clauses.join(' AND ')}
      ORDER BY due_date ASC, created_at ASC`,
    params
  );
  return result.rows;
}

async function createOfficeExpense(data) {
  const result = await pool.query(
    `INSERT INTO office_expenses
       (tenant_id, expense_type, category, description, competence, due_date, amount, status, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [data.tenant_id, data.expense_type, data.category, data.description,
     data.competence, data.due_date, data.amount, data.status, data.created_by]
  );
  return result.rows[0];
}

async function updateOfficeExpense(id, data, tenantId) {
  const allowed = ['expense_type', 'category', 'description', 'competence', 'due_date', 'amount', 'status'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      params.push(data[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) {
    const current = await pool.query('SELECT * FROM office_expenses WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    return current.rows[0];
  }
  params.push(id, tenantId);
  const result = await pool.query(
    `UPDATE office_expenses SET ${sets.join(', ')}, updated_at = NOW()
      WHERE id = $${params.length - 1} AND tenant_id = $${params.length}
      RETURNING *`,
    params
  );
  return result.rows[0];
}

async function deleteOfficeExpense(id, tenantId) {
  const result = await pool.query(
    'DELETE FROM office_expenses WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return result.rows[0];
}

// Busca o % de comissão vigente de um colaborador (para SNAPSHOT ao criar venda)
async function getCommissionTiers(collaboratorId, tenantId) {
  void collaboratorId;
  void tenantId;
  return [];
}

async function createCommissionTier(data) {
  const collaborator = await getCollaboratorById(data.collaborator_id, data.tenant_id);
  if (!collaborator) throw domainError('Colaborador não encontrado.', 'INVALID_COLLABORATOR');
  const r = await pool.query(
    `INSERT INTO collaborator_commission_tiers
       (tenant_id, collaborator_id, name, min_sales, percentage)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [data.tenant_id, data.collaborator_id, data.name || null, data.min_sales, data.percentage]
  );
  return r.rows[0];
}

async function updateCommissionTier(id, data, tenantId) {
  const r = await pool.query(
    `UPDATE collaborator_commission_tiers SET
       name = $1, min_sales = COALESCE($2, min_sales),
       percentage = COALESCE($3, percentage), updated_at = NOW()
     WHERE id = $4 AND tenant_id = $5 RETURNING *`,
    [data.name || null, data.min_sales ?? null, data.percentage ?? null, id, tenantId]
  );
  return r.rows[0];
}

async function deleteCommissionTier(id, tenantId) {
  const r = await pool.query(
    'DELETE FROM collaborator_commission_tiers WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [id, tenantId]
  );
  return r.rows[0];
}

async function getCollaboratorDetail(collaboratorId, tenantId, { months = 12, monthStart = null } = {}) {
  const person = await pool.query(
    `SELECT u.id, u.name, u.email, u.role, u.position, u.employment_type,
            u.team_id, t.name AS team_name, u.supervisor_id, sup.name AS supervisor_name,
            u.hire_date, u.termination_date, COALESCE(u.is_active, true) AS is_active,
            u.salary, u.benefits_amount, u.other_monthly_costs,
            u.employer_charges_percentage, u.thirteenth_salary_enabled,
             u.commission_percentage, u.commission_threshold,
            ROUND(u.salary * u.employer_charges_percentage / 100, 2) AS employer_charges,
            CASE WHEN u.thirteenth_salary_enabled THEN ROUND(u.salary / 12, 2) ELSE 0 END AS thirteenth_provision
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id AND t.tenant_id = u.tenant_id
       LEFT JOIN users sup ON sup.id = u.supervisor_id AND sup.tenant_id = u.tenant_id
      WHERE u.id = $1 AND u.tenant_id = $2`,
    [collaboratorId, tenantId]
  );
  if (!person.rowCount) return null;

  const monthly = await pool.query(
    `WITH months AS (
       SELECT generate_series(
         date_trunc('month', CURRENT_DATE) - (($3::int - 1) || ' months')::interval,
         date_trunc('month', CURRENT_DATE), interval '1 month'
       )::date AS month_start
     ), sales_month AS (
       SELECT date_trunc('month', closed_at)::date AS month_start,
              COUNT(*) AS sales_count, COALESCE(SUM(amount), 0) AS total_amount,
               COALESCE(SUM(commission_amount), 0) AS total_commission
          FROM sales
         WHERE tenant_id = $2 AND seller_id = $1
           AND LOWER(COALESCE(status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')
          AND closed_at >= date_trunc('month', CURRENT_DATE) - (($3::int - 1) || ' months')::interval
        GROUP BY 1
     )
     SELECT to_char(m.month_start, 'YYYY-MM') AS month, m.month_start,
            COALESCE(s.sales_count, 0) AS sales_count,
            COALESCE(s.total_amount, 0) AS total_amount,
             COALESCE(s.total_commission, 0) AS total_commission,
             umt.amount AS target_amount,
             (umt.id IS NOT NULL) AS target_configured,
            CASE WHEN COALESCE(s.sales_count, 0) > 0 THEN ROUND(s.total_amount / s.sales_count, 2) ELSE 0 END AS avg_ticket,
            COALESCE((SELECT SUM(cc.amount) FROM collaborator_costs cc
              WHERE cc.tenant_id = $2 AND cc.collaborator_id = $1
                AND ((NOT cc.recurring AND date_trunc('month', cc.competence) = m.month_start)
                  OR (cc.recurring AND cc.competence < (m.month_start + interval '1 month')
                    AND (cc.end_date IS NULL OR cc.end_date >= m.month_start)))), 0) AS additional_costs
       FROM months m
       LEFT JOIN sales_month s ON s.month_start = m.month_start
       LEFT JOIN user_monthly_targets umt
         ON umt.tenant_id = $2 AND umt.user_id = $1 AND umt.month_start = m.month_start
      ORDER BY m.month_start ASC`,
    [collaboratorId, tenantId, Math.min(Math.max(Number(months) || 12, 1), 36)]
  );

  const selectedMonthStart = monthStart || new Date().toISOString().substring(0, 7) + '-01';
  const [tiers, costs, recentSales, selectedTargets] = await Promise.all([
    getCommissionTiers(collaboratorId, tenantId),
    pool.query(
      `SELECT id, category, description, amount, competence, recurring, end_date, created_at
         FROM collaborator_costs
        WHERE collaborator_id = $1 AND tenant_id = $2
        ORDER BY recurring DESC, competence DESC, created_at DESC`,
      [collaboratorId, tenantId]
    ).then((r) => r.rows),
    pool.query(
      `SELECT id, customer_name, service_name, description, amount,
              installment_number, installment_total, payment_method, closing_method,
              commission_percentage, commissionable_amount, commission_trigger_amount,
              commission_amount, status, closed_at
         FROM sales
         WHERE seller_id = $1 AND tenant_id = $2
           AND LOWER(COALESCE(status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')
        ORDER BY closed_at DESC, created_at DESC LIMIT 20`,
      [collaboratorId, tenantId]
    ).then((r) => r.rows),
    getUserTargets(tenantId, selectedMonthStart, { userId: collaboratorId }),
  ]);

  const selectedKey = String(selectedMonthStart).substring(0, 7);
  const current = monthly.rows.find((row) => row.month === selectedKey)
    || { month: selectedKey, total_amount: 0, sales_count: 0, total_commission: 0, avg_ticket: 0 };
  const sold = Number(current.total_amount || 0);
  const target = selectedTargets[0] || {};
  const targetAmount = target.configured ? Number(target.amount || 0) : null;
  const policy = commissionPolicyForRole(person.rows[0].role, person.rows[0]);
  const collaborator = {
    ...person.rows[0],
    monthly_sales_target: targetAmount,
    monthly_target_configured: target.configured === true,
    monthly_target_updated_at: target.updated_at || null,
    commission_percentage: policy.percentage,
    commission_threshold: policy.threshold,
    commission_mode: policy.mode,
  };
  return {
    collaborator, monthly: monthly.rows, costs, tiers: [], recentSales,
    current: {
      ...current,
      effective_percentage: policy.percentage,
      achieved_tier: null,
      next_tier: null,
      amount_to_next_tier: '0.00',
      target_amount: targetAmount,
      target_configured: target.configured === true,
      target_remaining: targetAmount === null ? null : Math.max(targetAmount - sold, 0).toFixed(2),
      target_progress: targetAmount > 0 ? ((sold / targetAmount) * 100).toFixed(2) : '0.00',
      commission_threshold: policy.threshold,
      threshold_remaining: Math.max(policy.threshold - sold, 0).toFixed(2),
    },
  };
}

async function getSellerCommissionPct(sellerId, tenantId, { amount = 0, closedAt = null, excludeSaleId = null } = {}) {
  if (!sellerId) return null;
  const r = await pool.query(
    `SELECT u.id, u.name, LOWER(u.role) AS role, u.team_id, t.supervisor_id,
            u.commission_percentage, u.commission_threshold
       FROM users u
       LEFT JOIN teams t ON t.id = u.team_id AND t.tenant_id = u.tenant_id
      WHERE u.id = $1 AND u.tenant_id = $2 AND COALESCE(u.is_active, true)`,
    [sellerId, tenantId]
  );
  if (!r.rowCount) return null;
  const seller = r.rows[0];
  const policy = commissionPolicyForRole(seller.role, seller);
  if (!amount && !closedAt && !excludeSaleId) return {
    ...seller,
    commission_percentage: policy.percentage,
    commission_threshold: policy.threshold,
    commission_mode: policy.mode,
  };
  const date = closedAt || new Date().toISOString().substring(0, 10);
  const accumulated = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM sales
      WHERE tenant_id = $1 AND seller_id = $2
        AND LOWER(COALESCE(status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')
        AND closed_at >= date_trunc('month', $3::date)::date
        AND closed_at < (date_trunc('month', $3::date) + interval '1 month')::date
        AND ($4::uuid IS NULL OR id <> $4::uuid)`,
    [tenantId, sellerId, date, excludeSaleId]
  );
  const projectedTotal = Number(accumulated.rows[0].total || 0) + Number(amount || 0);
  const threshold = policy.threshold;
  const commissionableAmount = policy.mode === 'full_amount'
    ? Math.max(Number(amount || 0), 0)
    : policy.mode === 'threshold_excess'
      ? computeCommissionableAmount(Number(accumulated.rows[0].total || 0), Number(amount || 0), threshold)
      : 0;
  return {
    ...seller,
    commission_percentage: policy.percentage,
    commission_mode: policy.mode,
    commission_tier: null,
    commission_threshold: threshold,
    commissionable_amount: commissionableAmount,
    projected_month_sales: projectedTotal.toFixed(2),
  };
}

// ─── VENDAS (CRUD) ───────────────────────────────────────────────────────────
async function getSales(tenantId, { start, end, teamId, sellerId, limit = 100, offset = 0 } = {}) {
  const { where, params, nextIndex } = salesFilter(tenantId, { start, end, teamId, sellerId });
  params.push(limit); const limitIdx = nextIndex;
  params.push(offset); const offsetIdx = nextIndex + 1;
  const r = await pool.query(
    `SELECT s.*,
            COALESCE(
              s.seller_display_name_snapshot,
              seller.name
            ) AS seller_name,
            t.name AS team_name,
            cl.name AS client_name, co.razao_social AS company_name,
            COALESCE(s.customer_name, cl.name, co.razao_social, co.nome_fantasia) AS customer_display_name,
            COALESCE(s.service_name, s.description) AS service_display_name
       FROM sales s
       LEFT JOIN users seller ON seller.id = s.seller_id
       LEFT JOIN teams t      ON t.id = s.team_id AND t.tenant_id = s.tenant_id
       LEFT JOIN clients cl   ON cl.id = s.client_id
       LEFT JOIN companies co ON co.id = s.company_id
      WHERE ${where}
      ORDER BY s.closed_at DESC, s.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );
  return r.rows;
}

async function getInstallmentFollowUps(tenantId, {
  teamId, sellerId, supervisorId, periodStart, periodEnd,
} = {}) {
  const { where, params, nextIndex } = salesFilter(tenantId, { teamId, sellerId, supervisorId });
  const selectedStart = periodStart || new Date().toISOString().substring(0, 7) + '-01';
  const selectedEnd = periodEnd || (() => {
    const nextMonth = new Date(`${selectedStart}T12:00:00Z`);
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    return nextMonth.toISOString().substring(0, 10);
  })();
  const periodStartIndex = nextIndex;
  const periodEndIndex = nextIndex + 1;
  params.push(selectedStart, selectedEnd);
  const result = await pool.query(
    `WITH scoped AS (
       SELECT s.*,
              COALESCE(s.seller_display_name_snapshot, seller.name) AS seller_name,
              ROW_NUMBER() OVER (
                PARTITION BY s.installment_plan_id
                ORDER BY s.installment_number DESC, s.closed_at DESC, s.created_at DESC
              ) AS row_number
         FROM sales s
         LEFT JOIN users seller ON seller.id = s.seller_id
        WHERE ${where}
          AND s.installment_plan_id IS NOT NULL
          AND s.installment_total IS NOT NULL
     ), open_plans AS (
       SELECT * FROM scoped
        WHERE row_number = 1
          AND NOT is_settlement
          AND installment_number < installment_total
     ), scheduled AS (
       SELECT open_plans.*,
              item.installment_number AS next_installment_number,
              item.installment_number = open_plans.installment_number + 1 AS is_next_installment,
              item.due_date AS projected_due_date,
              item.expected_amount AS pending_amount
         FROM open_plans
         JOIN sales_installment_schedule item
           ON item.tenant_id = open_plans.tenant_id
          AND item.installment_plan_id = open_plans.installment_plan_id
          AND item.status = 'scheduled'
     )
     SELECT scheduled.*,
            projected_due_date AS next_installment_due_date,
            CASE
              WHEN projected_due_date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'overdue'
              WHEN projected_due_date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'due_today'
              ELSE 'upcoming'
            END AS follow_up_status
       FROM scheduled
      WHERE (
        projected_due_date >= $${periodStartIndex}::date
        AND projected_due_date < $${periodEndIndex}::date
      ) OR (
        projected_due_date < $${periodStartIndex}::date
        AND projected_due_date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
      )
      ORDER BY projected_due_date ASC NULLS LAST, customer_name ASC, next_installment_number ASC
      LIMIT 200`,
    params
  );
  return result.rows;
}

async function resolveInstallmentPlanId(data) {
  if (!data.installment_total) return null;
  if (data.installment_plan_id) {
    const existing = await pool.query(
      `SELECT installment_plan_id
         FROM sales
        WHERE tenant_id = $1 AND installment_plan_id = $2
          AND seller_id = $3
        LIMIT 1`,
      [data.tenant_id, data.installment_plan_id, data.seller_id]
    );
    if (!existing.rowCount) throw domainError('Parcelamento não encontrado para esse responsável.', 'INVALID_INSTALLMENT_PLAN');
    return data.installment_plan_id;
  }
  if (Number(data.installment_number) > 1) {
    const existing = await pool.query(
      `SELECT installment_plan_id
         FROM sales
        WHERE tenant_id = $1 AND seller_id = $2
          AND installment_plan_id IS NOT NULL
          AND installment_total = $3
          AND LOWER(COALESCE(customer_name, '')) = LOWER(COALESCE($4, ''))
          AND LOWER(COALESCE(service_name, description, '')) = LOWER(COALESCE($5, ''))
        ORDER BY installment_number DESC, closed_at DESC, created_at DESC
        LIMIT 1`,
      [data.tenant_id, data.seller_id, data.installment_total, data.customer_name, data.service_name || data.description]
    );
    if (existing.rowCount) return existing.rows[0].installment_plan_id;
    throw domainError(
      'Para registrar uma parcela após a primeira, confirme o pagamento pela lista de cobranças.',
      'INVALID_INSTALLMENT_SEQUENCE'
    );
  }
  return randomUUID();
}

async function getLatestInstallmentPlanRow(tenantId, planId, sellerId) {
  const result = await pool.query(
    `SELECT *
       FROM sales
      WHERE tenant_id = $1 AND installment_plan_id = $2 AND seller_id = $3
      ORDER BY installment_number DESC, closed_at DESC, created_at DESC
      LIMIT 1`,
    [tenantId, planId, sellerId]
  );
  return result.rows[0] || null;
}

async function getLatestInstallmentPlan(tenantId, planId) {
  const result = await pool.query(
    `SELECT *
       FROM sales
      WHERE tenant_id = $1 AND installment_plan_id = $2
      ORDER BY installment_number DESC, closed_at DESC, created_at DESC
      LIMIT 1`,
    [tenantId, planId]
  );
  return result.rows[0] || null;
}

async function updateInstallmentSchedule(planId, data, tenantId) {
  const latest = await getLatestInstallmentPlan(tenantId, planId);
  if (!latest) return null;
  if (latest.is_settlement || Number(latest.installment_number) >= Number(latest.installment_total)) {
    throw domainError('Esse parcelamento já está quitado.', 'INVALID_INSTALLMENT_PLAN');
  }
  const installmentNumber = Number(data.installment_number || (Number(latest.installment_number) + 1));
  const neighbors = await pool.query(
    `SELECT MAX(due_date) FILTER (WHERE installment_number < $3) AS previous_due_date,
            MIN(due_date) FILTER (WHERE installment_number > $3) AS following_due_date
       FROM sales_installment_schedule
      WHERE tenant_id = $1 AND installment_plan_id = $2 AND status <> 'cancelled'`,
    [tenantId, planId, installmentNumber]
  );
  const previousDueDate = neighbors.rows[0]?.previous_due_date;
  const followingDueDate = neighbors.rows[0]?.following_due_date;
  const dateOnly = (value) => value instanceof Date ? value.toISOString().substring(0, 10) : String(value || '').substring(0, 10);
  if ((previousDueDate && String(data.next_installment_due_date) <= dateOnly(previousDueDate))
    || (followingDueDate && String(data.next_installment_due_date) >= dateOnly(followingDueDate))) {
    throw domainError('O vencimento deve ficar entre as demais parcelas do plano.', 'INVALID_INSTALLMENT_DUE_DATE');
  }
  const result = await pool.query(
    `UPDATE sales_installment_schedule
        SET due_date = $1, expected_amount = $2, updated_at = NOW()
      WHERE tenant_id = $3 AND installment_plan_id = $4
        AND installment_number = $5 AND status = 'scheduled'
      RETURNING *`,
    [data.next_installment_due_date, data.next_installment_amount, tenantId, planId, installmentNumber]
  );
  if (!result.rowCount) throw domainError('Esta cobrança já foi paga ou não está mais programada.', 'INVALID_INSTALLMENT_PLAN');
  if (installmentNumber === Number(latest.installment_number) + 1) {
    await pool.query(
      `UPDATE sales SET next_installment_due_date = $1, next_installment_amount = $2, updated_at = NOW()
        WHERE id = $3 AND tenant_id = $4`,
      [data.next_installment_due_date, data.next_installment_amount, latest.id, tenantId]
    );
  }
  return { ...latest, next_installment_due_date: data.next_installment_due_date, next_installment_amount: data.next_installment_amount };
}

function addInstallmentPeriod(dateText, frequency) {
  const normalizedDate = dateText instanceof Date
    ? dateText.toISOString().substring(0, 10)
    : String(dateText || '').substring(0, 10);
  const parts = normalizedDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
    throw domainError('O parcelamento não possui um próximo vencimento válido.', 'INVALID_INSTALLMENT_DUE_DATE');
  }
  const [year, month, day] = parts;
  if (frequency === 'weekly') {
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + 7);
    return date.toISOString().substring(0, 10);
  }
  const targetMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay));
  return targetMonth.toISOString().substring(0, 10);
}

async function getSaleById(id, tenantId) {
  const r = await pool.query(`SELECT * FROM sales WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rows[0];
}

function computeCommission(amount, pct) {
  const a = Number(amount) || 0;
  const p = Number(pct) || 0;
  return Math.round(a * p) / 100; // amount * pct / 100, 2 casas
}

// A comissão começa somente no excedente do gatilho mensal.
// Ex.: acumulado 7.000 + venda 1.000, gatilho 7.500 => base comissionável 500.
function computeCommissionableAmount(accumulated, amount, threshold) {
  const before = Math.max(Number(accumulated) || 0, 0);
  const sale = Math.max(Number(amount) || 0, 0);
  const trigger = Math.max(Number(threshold) || 0, 0);
  const previousExcess = Math.max(before - trigger, 0);
  const projectedExcess = Math.max(before + sale - trigger, 0);
  return Math.round((projectedExcess - previousExcess) * 100) / 100;
}

async function createSale(data) {
  const {
    tenant_id, seller_id = null, client_id = null, company_id = null,
    lead_id = null, fine_id = null, description = null,
    customer_name = null, service_name = null,
    installment_number = null, installment_total = null,
    installment_plan_id = null, installment_frequency = null,
    next_installment_due_date = null, next_installment_amount = null, is_settlement = false,
    payment_method = null, closing_method = null,
    amount = 0, closed_at = null, status = 'confirmed', created_by = null,
    seller_display_name = null,
  } = data;

  // Snapshot financeiro + organizacional vigente no fechamento.
  const seller = await getSellerCommissionPct(seller_id, tenant_id, { amount, closedAt: closed_at });
  if (!seller) throw domainError('Responsável pela venda não encontrado ou inativo.', 'INVALID_SELLER');
  const commission_percentage = Number(seller.commission_percentage || 0);
  const commissionable_amount = Number(seller.commissionable_amount || 0);
  const commission_trigger_amount = Number(seller.commission_threshold || 0);
  const team_id = data.team_id || seller.team_id || null;
  const seller_role_snapshot = seller.role || null;
  const supervisor_id = seller.supervisor_id || null;
  const commission_amount = computeCommission(commissionable_amount, commission_percentage);
  const resolvedPlanId = await resolveInstallmentPlanId({ ...data, installment_plan_id });
  const settled = Boolean(is_settlement) || Boolean(installment_total && installment_number >= installment_total);
  let resolvedFrequency = installment_total ? (installment_frequency || 'monthly') : null;
  let resolvedNextDueDate = settled ? null : next_installment_due_date;
  let resolvedNextAmount = settled ? null : (next_installment_amount ?? amount);
  const explicitSchedule = Array.isArray(data.installment_schedule) ? data.installment_schedule : null;
  let scheduleRows = [];

  if (installment_total && Number(installment_number) === 1 && !settled) {
    if (explicitSchedule) {
      scheduleRows = explicitSchedule.map((item) => ({
        installment_number: Number(item.installment_number),
        due_date: String(item.due_date).substring(0, 10),
        expected_amount: Number(item.expected_amount),
      }));
      if (scheduleRows.length !== Number(installment_total) - 1
        || scheduleRows.some((item, index) => item.installment_number !== index + 2
          || !item.due_date || !Number.isFinite(item.expected_amount) || item.expected_amount <= 0)
        || scheduleRows.some((item, index) => index > 0 && item.due_date < scheduleRows[index - 1].due_date)) {
        throw domainError('A agenda precisa conter todas as parcelas futuras, em ordem.', 'VALIDATION');
      }
    } else if (resolvedNextDueDate) {
      let dueDate = String(resolvedNextDueDate).substring(0, 10);
      const count = resolvedFrequency === 'manual' ? 1 : Number(installment_total) - 1;
      for (let offset = 0; offset < count; offset += 1) {
        scheduleRows.push({
          installment_number: offset + 2,
          due_date: dueDate,
          expected_amount: Number(resolvedNextAmount || amount),
        });
        if (offset + 1 < count) dueDate = addInstallmentPeriod(dueDate, resolvedFrequency);
      }
    }
    if (scheduleRows.length) {
      resolvedNextDueDate = scheduleRows[0].due_date;
      resolvedNextAmount = scheduleRows[0].expected_amount;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let scheduledPayment = null;
    if (installment_total && Number(installment_number) > 1) {
      const latestResult = await client.query(
        `SELECT * FROM sales
          WHERE tenant_id = $1 AND installment_plan_id = $2 AND seller_id = $3
          ORDER BY installment_number DESC, closed_at DESC, created_at DESC
          LIMIT 1 FOR UPDATE`,
        [tenant_id, resolvedPlanId, seller_id]
      );
      const latest = latestResult.rows[0];
      if (!latest) throw domainError('Parcelamento não encontrado para esse responsável.', 'INVALID_INSTALLMENT_PLAN');
      if (Number(installment_number) !== Number(latest.installment_number) + 1) {
        throw domainError('Essa parcela já foi recebida ou existe uma parcela anterior pendente.', 'INVALID_INSTALLMENT_SEQUENCE');
      }
      if (Number(installment_total) !== Number(latest.installment_total)) {
        throw domainError('O total de parcelas não corresponde ao parcelamento.', 'INVALID_INSTALLMENT_SEQUENCE');
      }
      resolvedFrequency = latest.installment_frequency || resolvedFrequency || 'monthly';
      const scheduledResult = await client.query(
        `SELECT * FROM sales_installment_schedule
          WHERE tenant_id = $1 AND installment_plan_id = $2 AND installment_number = $3
            AND status = 'scheduled'
          FOR UPDATE`,
        [tenant_id, resolvedPlanId, installment_number]
      );
      scheduledPayment = scheduledResult.rows[0];
      if (!scheduledPayment) {
        throw domainError('A parcela não está mais programada. Atualize a tela e tente novamente.', 'INVALID_INSTALLMENT_SEQUENCE');
      }
      if (!settled) {
        const following = await client.query(
          `SELECT * FROM sales_installment_schedule
            WHERE tenant_id = $1 AND installment_plan_id = $2 AND installment_number = $3
              AND status = 'scheduled'`,
          [tenant_id, resolvedPlanId, Number(installment_number) + 1]
        );
        if (following.rowCount) {
          resolvedNextDueDate = following.rows[0].due_date;
          resolvedNextAmount = following.rows[0].expected_amount;
        } else {
          // Compatibilidade defensiva para agenda legada incompleta.
          resolvedNextDueDate = resolvedFrequency === 'manual'
            ? (next_installment_due_date || null)
            : addInstallmentPeriod(scheduledPayment.due_date, resolvedFrequency);
          resolvedNextAmount = next_installment_amount ?? scheduledPayment.expected_amount;
          if (resolvedNextDueDate && Number(installment_number) + 1 <= Number(installment_total)) {
            await client.query(
              `INSERT INTO sales_installment_schedule
                 (tenant_id, installment_plan_id, installment_number, installment_total, due_date, expected_amount, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (tenant_id, installment_plan_id, installment_number) DO NOTHING`,
              [tenant_id, resolvedPlanId, Number(installment_number) + 1, installment_total, resolvedNextDueDate, resolvedNextAmount, created_by]
            );
          }
        }
      } else {
        resolvedNextDueDate = null;
        resolvedNextAmount = null;
      }
    }

    const saleResult = await client.query(
      `INSERT INTO sales
         (tenant_id, seller_id, team_id, seller_role_snapshot, seller_display_name_snapshot, supervisor_id,
          client_id, company_id, lead_id, fine_id,
          description, customer_name, service_name, installment_number, installment_total,
           installment_plan_id, installment_frequency, next_installment_due_date, next_installment_amount, is_settlement,
           payment_method, closing_method, amount, commission_percentage,
           commissionable_amount, commission_trigger_amount, commission_amount, status,
           closed_at, source, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
               COALESCE($29, CURRENT_DATE), 'manual', $30)
       RETURNING *`,
      [tenant_id, seller_id, team_id, seller_role_snapshot, seller_display_name || seller.name, supervisor_id,
       client_id, company_id, lead_id, fine_id,
       description, customer_name, service_name, installment_number, installment_total,
       resolvedPlanId, resolvedFrequency, resolvedNextDueDate, resolvedNextAmount, settled,
       payment_method, closing_method, amount, commission_percentage,
       commissionable_amount, commission_trigger_amount, commission_amount, status,
       closed_at, created_by]
    );
    const sale = saleResult.rows[0];

    if (installment_total && Number(installment_number) === 1 && !settled) {
      for (const item of scheduleRows) {
        await client.query(
          `INSERT INTO sales_installment_schedule
             (tenant_id, installment_plan_id, installment_number, installment_total, due_date, expected_amount, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [tenant_id, resolvedPlanId, item.installment_number, installment_total, item.due_date, item.expected_amount, created_by]
        );
      }
    }
    if (scheduledPayment) {
      await client.query(
        `UPDATE sales_installment_schedule SET status = 'paid', paid_sale_id = $1, updated_at = NOW()
          WHERE id = $2`,
        [sale.id, scheduledPayment.id]
      );
      if (settled) {
        await client.query(
          `UPDATE sales_installment_schedule SET status = 'cancelled', updated_at = NOW()
            WHERE tenant_id = $1 AND installment_plan_id = $2 AND installment_number > $3 AND status = 'scheduled'`,
          [tenant_id, resolvedPlanId, installment_number]
        );
      }
    }
    await client.query('COMMIT');
    return sale;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Atualiza venda. NÃO recalcula comissão histórica por mudança futura da regra:
// o snapshot só muda se valor, consultor ou data da venda forem editados.
async function updateSale(id, data, tenantId) {
  const current = await getSaleById(id, tenantId);
  if (!current) return null;

  const amount = data.amount !== undefined ? Number(data.amount) : Number(current.amount);
  const sellerId = data.seller_id || current.seller_id;
  const closedAt = data.closed_at || current.closed_at;
  const sellerChanged = data.seller_id !== undefined && data.seller_id !== current.seller_id;
  const changesCommissionBasis =
    (data.amount !== undefined && Number(data.amount) !== Number(current.amount))
    || sellerChanged
    || (data.closed_at !== undefined && String(data.closed_at).substring(0, 10) !== String(current.closed_at).substring(0, 10));
  const seller = changesCommissionBasis
    ? await getSellerCommissionPct(sellerId, tenantId, { amount, closedAt, excludeSaleId: id })
    : null;
  if (changesCommissionBasis && !seller) throw domainError('Responsável pela venda não encontrado ou inativo.', 'INVALID_SELLER');
  const commission_percentage = seller
    ? Number(seller.commission_percentage || 0)
    : Number(current.commission_percentage);
  const commissionable_amount = seller
    ? Number(seller.commissionable_amount || 0)
    : Number(current.commissionable_amount || 0);
  const commission_trigger_amount = seller
    ? Number(seller.commission_threshold || 0)
    : Number(current.commission_trigger_amount || 0);
  const commission_amount = computeCommission(commissionable_amount, commission_percentage);
  const snapshotTeamId = sellerChanged ? (seller?.team_id || null) : current.team_id;
  const snapshotRole = sellerChanged ? (seller?.role || null) : (current.seller_role_snapshot || seller?.role || null);
  const snapshotSupervisorId = sellerChanged
    ? (seller?.supervisor_id || null)
    : (current.supervisor_id || seller?.supervisor_id || null);
  const installmentChanged = Object.prototype.hasOwnProperty.call(data, 'installment_number')
    || Object.prototype.hasOwnProperty.call(data, 'installment_total')
    || Object.prototype.hasOwnProperty.call(data, 'installment_plan_id')
    || Object.prototype.hasOwnProperty.call(data, 'installment_frequency')
    || Object.prototype.hasOwnProperty.call(data, 'next_installment_due_date')
    || Object.prototype.hasOwnProperty.call(data, 'is_settlement');
  const nextInstallmentNumber = installmentChanged ? data.installment_number : current.installment_number;
  const nextInstallmentTotal = installmentChanged ? data.installment_total : current.installment_total;
  const resolvedPlanId = nextInstallmentTotal
    ? (data.installment_plan_id || current.installment_plan_id || randomUUID())
    : null;
  const resolvedFrequency = nextInstallmentTotal
    ? (data.installment_frequency || current.installment_frequency || 'monthly')
    : null;
  const settled = installmentChanged
    ? (Boolean(data.is_settlement) || (nextInstallmentTotal && nextInstallmentNumber >= nextInstallmentTotal))
    : current.is_settlement;

  const r = await pool.query(
    `UPDATE sales SET
        seller_id  = COALESCE($1, seller_id),
        team_id    = $2,
        seller_role_snapshot = $3,
        supervisor_id = $4,
        seller_display_name_snapshot = COALESCE($5, seller_display_name_snapshot),
        client_id  = $6,
        company_id = $7,
        lead_id    = $8,
        fine_id    = $9,
        description = COALESCE($10, description),
        customer_name = COALESCE($11, customer_name),
        service_name = COALESCE($12, service_name),
        installment_number = CASE WHEN $13 THEN $14 ELSE installment_number END,
        installment_total = CASE WHEN $13 THEN $15 ELSE installment_total END,
        installment_plan_id = CASE WHEN $13 THEN $16 ELSE installment_plan_id END,
        installment_frequency = CASE WHEN $13 THEN $17 ELSE installment_frequency END,
        next_installment_due_date = CASE WHEN $13 THEN $18 ELSE next_installment_due_date END,
        is_settlement = CASE WHEN $13 THEN $19 ELSE is_settlement END,
        payment_method = COALESCE($20, payment_method),
        closing_method = COALESCE($21, closing_method),
        amount = $22,
        commission_percentage = $23,
        commissionable_amount = $24,
        commission_trigger_amount = $25,
        commission_amount = $26,
        status = COALESCE($27, status),
        closed_at = COALESCE($28, closed_at),
        updated_at = NOW()
      WHERE id = $29 AND tenant_id = $30 RETURNING *`,
    [
      data.seller_id ?? null, snapshotTeamId, snapshotRole, snapshotSupervisorId,
      data.seller_display_name ?? null,
      data.client_id ?? null, data.company_id ?? null,
      data.lead_id ?? null, data.fine_id ?? null,
      data.description ?? null, data.customer_name ?? null, data.service_name ?? null,
      installmentChanged, data.installment_number ?? null, data.installment_total ?? null,
      resolvedPlanId, resolvedFrequency,
      settled ? null : (data.next_installment_due_date ?? current.next_installment_due_date ?? null), settled,
      data.payment_method ?? null, data.closing_method ?? null,
      amount, commission_percentage, commissionable_amount, commission_trigger_amount,
      commission_amount, data.status ?? null, data.closed_at ?? null, id, tenantId,
    ]
  );
  return r.rows[0];
}

async function deleteSale(id, tenantId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [id, tenantId]
    );
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return null;
    }
    if (current.installment_plan_id && current.installment_number) {
      const later = await client.query(
        `SELECT 1 FROM sales
          WHERE tenant_id = $1 AND installment_plan_id = $2
            AND installment_number > $3
          LIMIT 1`,
        [tenantId, current.installment_plan_id, current.installment_number]
      );
      if (later.rowCount) {
        throw domainError('Exclua as parcelas na ordem inversa, começando pela mais recente.', 'INVALID_INSTALLMENT_SEQUENCE');
      }
      if (Number(current.installment_number) > 1) {
        await client.query(
          `UPDATE sales_installment_schedule
              SET status = 'scheduled', paid_sale_id = NULL, updated_at = NOW()
            WHERE tenant_id = $1 AND installment_plan_id = $2
              AND installment_number = $3 AND status = 'paid'`,
          [tenantId, current.installment_plan_id, current.installment_number]
        );
        await client.query(
          `UPDATE sales_installment_schedule SET status = 'scheduled', updated_at = NOW()
            WHERE tenant_id = $1 AND installment_plan_id = $2
              AND installment_number > $3 AND status = 'cancelled'`,
          [tenantId, current.installment_plan_id, current.installment_number]
        );
      } else {
        await client.query(
          `UPDATE sales_installment_schedule SET status = 'cancelled', updated_at = NOW()
            WHERE tenant_id = $1 AND installment_plan_id = $2 AND status = 'scheduled'`,
          [tenantId, current.installment_plan_id]
        );
      }
    }
    const deleted = await client.query(
      `DELETE FROM sales WHERE id = $1 AND tenant_id = $2 RETURNING id`, [id, tenantId]
    );
    await client.query('COMMIT');
    return deleted.rows[0] || null;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  getPersonalNote, updatePersonalNote,
  salesFilter,
  getOverview,
  getRanking,
  getMonthlyEvolution,
  getTeamClosing, getSupervisionDashboard,
  buildSupervisionCommission,
  getTeams, getTeamById, getTeamTargets, upsertTeamTarget,
  getCompanyTarget, upsertCompanyTarget, getUserTargets, upsertUserTarget,
  createTeam, updateTeam, deleteTeam,
  getCollaborators, getSalesResponsibles, getCollaboratorById, getCollaboratorDetail, updateCollaborator,
  getSellerCommissionPct, getWorkforceSummary,
  getCollaboratorCosts, createCollaboratorCost, setMonthlyTransport, updateCollaboratorCost, deleteCollaboratorCost,
  getOfficeExpenses, createOfficeExpense, updateOfficeExpense, deleteOfficeExpense,
  getCommissionTiers, createCommissionTier, updateCommissionTier, deleteCommissionTier,
  getSales, getInstallmentFollowUps, getSaleById, getLatestInstallmentPlan,
  createSale, updateSale, updateInstallmentSchedule, deleteSale,
  computeCommission, computeCommissionableAmount,
};
