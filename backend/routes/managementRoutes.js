// ============================================================================
// routes/managementRoutes.js — MÓDULO GESTÃO (/api/management)
// RBAC:
//   • requireModule('gestao') protege TODO o módulo (consultor = limitado).
//   • Escopo comercial por role:
//       master/admin → tenant inteiro (pode filtrar por equipe/vendedor)
//       supervisor   → apenas a PRÓPRIA equipe (força team_id)
//       seller       → apenas as PRÓPRIAS vendas (força seller_id);
//                      ranking mostra a equipe (peers) quando houver.
//   • Gerência de equipes/colaboradores/comissão: apenas master/admin.
//   • team/:id só libera a própria equipe do supervisor (senão 403).
// Auditoria: mudanças de comissão/equipe/supervisor/venda são logadas.
// ============================================================================

const express = require('express');
const router = express.Router();

const mgmt = require('../models/managementModels');
const { requireModule, requireRole, access } = require('../middlewares/authorize');
const { logActivity } = require('../services/activityLogService');
const { buildSalesWorkbook, salesWorkbookFilename } = require('../services/salesWorkbookService');
const {
  FIXED_COMMISSION_PERCENTAGE,
  FIXED_COMMISSION_THRESHOLD,
} = require('../config/commissionPolicy');

// ─── Datas (períodos) ────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Resolve [start, end) a partir de month/year OU from/to; default = mês atual.
function resolvePeriod(q) {
  if (q.from && q.to) {
    // end exclusivo: soma 1 dia ao "to"
    const to = new Date(`${String(q.to).substring(0, 10)}T00:00:00`);
    to.setDate(to.getDate() + 1);
    return { start: String(q.from).substring(0, 10), end: iso(to), label: 'custom' };
  }
  const now = new Date();
  const year = parseInt(q.year, 10) || now.getFullYear();
  const month = q.month ? parseInt(q.month, 10) : (now.getMonth() + 1); // 1-12
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // 1º dia do mês seguinte
  return { start: iso(start), end: iso(end), year, month, label: 'month' };
}

// Período anterior de mesmo tamanho (para comparação MoM)
function previousPeriod(period) {
  if (period.label === 'month') {
    const start = new Date(period.year, period.month - 2, 1);
    const end = new Date(period.year, period.month - 1, 1);
    return { start: iso(start), end: iso(end) };
  }
  const s = new Date(`${period.start}T00:00:00`);
  const e = new Date(`${period.end}T00:00:00`);
  const days = Math.round((e - s) / 86400000);
  const prevEnd = s;
  const prevStart = new Date(s); prevStart.setDate(prevStart.getDate() - days);
  return { start: iso(prevStart), end: iso(prevEnd) };
}

// Escopo comercial → { teamId, sellerId } a aplicar nas queries.
function commercialScope(req, { rankingMode = false } = {}) {
  const level = access.accessLevel(req.userRole, 'gestao');
  if (level === 'full') {
    // master/admin podem refinar por query (opcional)
    return {
      teamId: req.query.team_id || null,
      sellerId: req.query.seller_id || null,
    };
  }
  if (level === 'team') {
    if (!req.teamId) return { teamId: null, sellerId: req.userId, supervisorId: req.userId };
    return { teamId: req.teamId, sellerId: req.query.seller_id || null, supervisorId: req.userId };
  }
  // own (seller/consultor)
  if (rankingMode && req.teamId) return { teamId: req.teamId, sellerId: null };
  return { teamId: null, sellerId: req.userId };
}

function pctDiff(cur, prev) {
  const c = Number(cur) || 0, p = Number(prev) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return Math.round(((c - p) / p) * 10000) / 100;
}

const COST_CATEGORIES = new Set([
  'transport', 'meal_voucher', 'food_voucher', 'health', 'phone',
  'bonus', 'benefit', 'reimbursement', 'equipment', 'tax', 'training', 'other',
]);

const OFFICE_EXPENSE_CATEGORIES = new Map([
  ['rent', 'fixed'], ['electricity', 'fixed'], ['telecom', 'fixed'],
  ['software', 'fixed'], ['accounting', 'fixed'], ['cleaning', 'fixed'], ['fixed_other', 'fixed'],
  ['office_supplies', 'variable'], ['marketing', 'variable'],
  ['revenue_tax', 'variable'], ['purchases', 'variable'], ['variable_other', 'variable'],
]);
const OFFICE_EXPENSE_STATUSES = new Set(['pending', 'paid']);

function mutationError(res, err, context) {
  console.error(`[management/${context}]`, err.message);
  if (err.code === '23505' && err.constraint === 'sales_installment_plan_number_unique') {
    return res.status(409).json({ success: false, error: 'Essa parcela já foi registrada como recebida.' });
  }
  if (err.code === '23505') return res.status(409).json({ success: false, error: 'Já existe um cadastro com esses dados.' });
  if (err.code === '23514') return res.status(400).json({ success: false, error: 'Os dados informados não atendem às regras do cadastro.' });
  if (['INVALID_TEAM', 'INVALID_SUPERVISOR', 'INVALID_COLLABORATOR', 'INVALID_SELLER', 'INVALID_INSTALLMENT_PLAN', 'INVALID_INSTALLMENT_SEQUENCE', 'INVALID_INSTALLMENT_DUE_DATE'].includes(err.code)) {
    return res.status(400).json({ success: false, error: err.message });
  }
  if (err.code === 'FORBIDDEN') return res.status(403).json({ success: false, error: err.message });
  if (err.code === 'VALIDATION') return res.status(400).json({ success: false, error: err.message });
  return res.status(500).json({ success: false, error: 'Não foi possível concluir a operação.' });
}

function nonNegative(value, label, { max } = {}) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number < 0 || (max !== undefined && number > max)) {
    throw Object.assign(new Error(`${label} inválido.`), { code: 'VALIDATION' });
  }
  return number;
}

const PAYMENT_METHODS = new Set(['a_vista', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia', 'outro']);
const CLOSING_METHODS = new Set(['presencial', 'remoto', 'outro']);
const INSTALLMENT_FREQUENCIES = new Set(['weekly', 'monthly', 'manual']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function oneMonthAfter(dateText) {
  const date = new Date(`${String(dateText || iso(new Date())).substring(0, 10)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().substring(0, 10);
}

function oneWeekAfter(dateText) {
  const date = new Date(`${String(dateText || iso(new Date())).substring(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().substring(0, 10);
}

function cleanText(value, label, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!text || text.length > maxLength) {
    throw Object.assign(new Error(`${label} inválido.`), { code: 'VALIDATION' });
  }
  return text;
}

function saleCommercialFields(body, { partial = false } = {}) {
  const result = {};
  const paymentMethod = cleanText(body.payment_method, 'Forma de pagamento', 40);
  const closingMethod = cleanText(body.closing_method, 'Forma de fechamento', 20);
  const installmentFrequency = cleanText(body.installment_frequency, 'Periodicidade', 16);
  if (paymentMethod && !PAYMENT_METHODS.has(paymentMethod)) {
    throw Object.assign(new Error('Forma de pagamento inválida.'), { code: 'VALIDATION' });
  }
  if (closingMethod && !CLOSING_METHODS.has(closingMethod)) {
    throw Object.assign(new Error('Forma de fechamento inválida.'), { code: 'VALIDATION' });
  }
  if (installmentFrequency && !INSTALLMENT_FREQUENCIES.has(installmentFrequency)) {
    throw Object.assign(new Error('Periodicidade inválida.'), { code: 'VALIDATION' });
  }
  const hasInstallment = body.installment_number !== undefined || body.installment_total !== undefined;
  const hasTracking = hasInstallment
    || body.installment_plan_id !== undefined
    || body.next_installment_due_date !== undefined
    || body.is_settlement !== undefined
    || body.installment_frequency !== undefined;
  let installmentNumber = null, installmentTotal = null;
  if (hasInstallment && body.installment_number !== null && body.installment_total !== null) {
    installmentNumber = Number(body.installment_number);
    installmentTotal = Number(body.installment_total);
    if (!Number.isInteger(installmentNumber) || !Number.isInteger(installmentTotal)
      || installmentNumber < 1 || installmentTotal < 1 || installmentNumber > installmentTotal || installmentTotal > 120) {
      throw Object.assign(new Error('Parcela inválida.'), { code: 'VALIDATION' });
    }
  }
  if (!partial || body.customer_name !== undefined) result.customer_name = cleanText(body.customer_name, 'Nome do cliente', 180);
  if (!partial || body.service_name !== undefined || body.description !== undefined) result.service_name = cleanText(body.service_name ?? body.description, 'Serviço', 160);
  if (!partial || hasInstallment) {
    result.installment_number = installmentNumber;
    result.installment_total = installmentTotal;
  }
  if (!partial || hasTracking) {
    const planId = cleanText(body.installment_plan_id, 'Parcelamento', 36);
    if (planId && !UUID_PATTERN.test(planId)) {
      throw Object.assign(new Error('Parcelamento inválido.'), { code: 'VALIDATION' });
    }
    const requestedDueDate = cleanText(body.next_installment_due_date, 'Próximo vencimento', 10);
    if (requestedDueDate && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDueDate)) {
      throw Object.assign(new Error('Próximo vencimento inválido.'), { code: 'VALIDATION' });
    }
    const settlement = Boolean(installmentTotal && installmentNumber >= installmentTotal)
      || body.is_settlement === true;
    const frequency = installmentTotal
      ? (installmentFrequency || (planId ? null : 'monthly'))
      : null;
    result.installment_plan_id = installmentTotal ? planId : null;
    result.installment_frequency = frequency;
    result.is_settlement = installmentTotal ? settlement : false;
    if (installmentTotal && !settlement && frequency === 'manual' && !requestedDueDate) {
      throw Object.assign(new Error('Informe o próximo vencimento para a periodicidade manual.'), { code: 'VALIDATION' });
    }
    result.next_installment_due_date = installmentTotal && !settlement
      ? (requestedDueDate || (planId ? null : (frequency === 'weekly' ? oneWeekAfter(body.closed_at) : oneMonthAfter(body.closed_at))))
      : null;
  }
  if (!partial || body.payment_method !== undefined) result.payment_method = paymentMethod;
  if (!partial || body.closing_method !== undefined) result.closing_method = closingMethod;
  return result;
}

function installmentScheduleFields(body) {
  const dueDate = cleanText(body.next_installment_due_date, 'Vencimento da cobrança', 10);
  const frequency = cleanText(body.installment_frequency, 'Periodicidade', 16);
  const amount = Number(body.next_installment_amount);
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
    throw Object.assign(new Error('Informe um vencimento válido para a cobrança.'), { code: 'VALIDATION' });
  }
  const parsedDate = new Date(`${dueDate}T12:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().substring(0, 10) !== dueDate) {
    throw Object.assign(new Error('Informe um vencimento válido para a cobrança.'), { code: 'VALIDATION' });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw Object.assign(new Error('Informe um valor previsto maior que zero.'), { code: 'VALIDATION' });
  }
  if (!frequency || !INSTALLMENT_FREQUENCIES.has(frequency)) {
    throw Object.assign(new Error('Periodicidade inválida.'), { code: 'VALIDATION' });
  }
  return {
    next_installment_due_date: dueDate,
    next_installment_amount: amount,
    installment_frequency: frequency,
  };
}

async function assertSellerAllowed(req, sellerId) {
  if (!sellerId) throw Object.assign(new Error('Selecione o responsável pela venda.'), { code: 'VALIDATION' });
  const seller = await mgmt.getSellerCommissionPct(sellerId, req.tenantId);
  if (!seller || !['master', 'seller', 'supervisor'].includes(seller.role)) {
    throw Object.assign(new Error('Responsável pela venda não encontrado ou inativo.'), { code: 'INVALID_SELLER' });
  }
  if (seller.role === 'master' && (String(req.userRole || '').toLowerCase() !== 'master' || seller.id !== req.userId)) {
    throw Object.assign(new Error('A proprietária só pode registrar as próprias vendas.'), { code: 'FORBIDDEN' });
  }
  const level = access.accessLevel(req.userRole, 'gestao');
  if (level === 'own' && seller.id !== req.userId) {
    throw Object.assign(new Error('O consultor só pode registrar as próprias vendas.'), { code: 'FORBIDDEN' });
  }
  if (level === 'team') {
    const allowedConsultant = seller.role === 'seller' && req.teamId && seller.team_id === req.teamId;
    const allowedOwnSale = seller.role === 'supervisor' && seller.id === req.userId;
    if (!allowedConsultant && !allowedOwnSale) {
      throw Object.assign(new Error('Responsável fora da sua equipe.'), { code: 'FORBIDDEN' });
    }
  }
  return seller;
}

function resolveSalesResponsibleDisplayName(seller, requestedName) {
  const requested = cleanText(requestedName, 'Responsável pela venda', 255);
  if (!requested || requested === seller.name) return seller.name;

  throw Object.assign(new Error('Responsável pela venda inválido.'), { code: 'VALIDATION' });
}

function canManageCollaborator(req, target, nextRole) {
  const actorRole = String(req.userRole || '').toLowerCase();
  const targetRole = String(target?.role || '').toLowerCase();
  if (!['master', 'admin', 'supervisor', 'seller'].includes(nextRole)) return false;
  if (targetRole === 'super_admin') return false;
  if (actorRole === 'admin' && ['master', 'admin'].includes(targetRole)) return false;
  if (actorRole === 'admin' && ['master', 'admin'].includes(nextRole)) return false;
  return true;
}

// TODO o módulo exige acesso a "gestao"
router.use(requireModule('gestao'));

// ─── NOTA PESSOAL ────────────────────────────────────────────────────────────
// Cada usuário mantém o próprio bloco de metas/anotações. O registro fica na
// ficha dele, nunca é compartilhado com equipe, supervisor ou ranking.
router.get('/personal-note', async (req, res) => {
  try {
    const result = await mgmt.getPersonalNote(req.userId, req.tenantId);
    res.json({ success: true, data: { note: result || '' } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Não foi possível carregar sua anotação.' });
  }
});

router.put('/personal-note', async (req, res) => {
  try {
    const note = String(req.body?.note || '').trim();
    if (note.length > 4000) {
      return res.status(400).json({ success: false, error: 'A anotação pode ter no máximo 4.000 caracteres.' });
    }
    await mgmt.updatePersonalNote(req.userId, req.tenantId, note || null);
    await logActivity({
      tenant_id: req.tenantId,
      user_id: req.userId,
      action: 'update',
      entity_type: 'personal_note',
      entity_id: req.userId,
      description: 'Atualizou a anotação pessoal de metas',
    });
    res.json({ success: true, data: { note } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Não foi possível salvar sua anotação.' });
  }
});

// ─── VISÃO GERAL ─────────────────────────────────────────────────────────────
// GET /api/management/overview?month=&year= | ?from=&to=
router.get('/overview', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const scope = commercialScope(req);
    const prev = previousPeriod(period);

    const [current, previous, monthly, ranking] = await Promise.all([
      mgmt.getOverview(req.tenantId, { ...period, ...scope }),
      mgmt.getOverview(req.tenantId, { ...prev, ...scope }),
      mgmt.getMonthlyEvolution(req.tenantId, { months: 12, ...scope }),
      mgmt.getRanking(req.tenantId, { ...period, ...commercialScope(req, { rankingMode: true }) }),
    ]);

    res.json({
      success: true,
      data: {
        period,
        scope: access.accessLevel(req.userRole, 'gestao'),
        current,
        previous,
        comparison: {
          amount_diff: (Number(current.total_amount) - Number(previous.total_amount)).toFixed(2),
          amount_pct: pctDiff(current.total_amount, previous.total_amount),
        },
        monthly,
        ranking,
      },
    });
  } catch (err) {
    console.error('[management/overview]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── RANKING ─────────────────────────────────────────────────────────────────
// GET /api/management/ranking?month=&year=&team_id=&seller_id=
router.get('/ranking', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const scope = commercialScope(req, { rankingMode: true });
    const ranking = await mgmt.getRanking(req.tenantId, { ...period, ...scope });
    res.json({ success: true, data: { period, ranking } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── EVOLUÇÃO MÊS A MÊS ──────────────────────────────────────────────────────
router.get('/monthly-evolution', async (req, res) => {
  try {
    const months = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 36);
    const scope = commercialScope(req);
    const data = await mgmt.getMonthlyEvolution(req.tenantId, { months, ...scope });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── EQUIPES ─────────────────────────────────────────────────────────────────
router.get('/teams', async (req, res) => {
  try {
    let teams = await mgmt.getTeams(req.tenantId);
    // Supervisor/consultor só enxergam a própria equipe
    const level = access.accessLevel(req.userRole, 'gestao');
    if (level !== 'full' && req.teamId) teams = teams.filter((t) => t.id === req.teamId);
    else if (level !== 'full') teams = [];
    res.json({ success: true, data: teams });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/teams', requireRole('master', 'admin'), async (req, res) => {
  try {
    const { name, supervisor_id, active } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'Nome da equipe é obrigatório' });
    const team = await mgmt.createTeam({ tenant_id: req.tenantId, name: name.trim(), supervisor_id: supervisor_id || null, active });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'create', entity_type: 'team', entity_id: team.id, description: `Equipe "${team.name}" criada` });
    res.status(201).json({ success: true, data: team });
  } catch (err) {
    return mutationError(res, err, 'teams/create');
  }
});

router.put('/teams/:id', requireRole('master', 'admin'), async (req, res) => {
  try {
    const before = await mgmt.getTeamById(req.params.id, req.tenantId);
    if (!before) return res.status(404).json({ success: false, error: 'Equipe não encontrada' });
    const team = await mgmt.updateTeam(req.params.id, req.body, req.tenantId);
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'update', entity_type: 'team', entity_id: team.id, description: `Equipe "${team.name}" atualizada`, metadata: { before: { supervisor_id: before.supervisor_id, active: before.active }, after: req.body } });
    res.json({ success: true, data: team });
  } catch (err) {
    return mutationError(res, err, 'teams/update');
  }
});

router.delete('/teams/:id', requireRole('master', 'admin'), async (req, res) => {
  try {
    const deleted = await mgmt.deleteTeam(req.params.id, req.tenantId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Equipe não encontrada' });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'delete', entity_type: 'team', entity_id: req.params.id, description: 'Equipe excluída' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Meta comercial da equipe é mensal e independente da meta individual.
router.get('/team-targets', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const level = access.accessLevel(req.userRole, 'gestao');
    const teamId = level === 'full' ? (req.query.team_id || null) : (req.teamId || null);
    if (level !== 'full' && !teamId) return res.json({ success: true, data: [], period });
    const rows = await mgmt.getTeamTargets(req.tenantId, period.start, { teamId });
    res.json({ success: true, data: rows, period });
  } catch (err) {
    return mutationError(res, err, 'team-targets/list');
  }
});

router.put('/teams/:id/target', requireRole('master'), async (req, res) => {
  try {
    const period = resolvePeriod(req.body);
    const amount = nonNegative(req.body.amount, 'Meta da equipe');
    const target = await mgmt.upsertTeamTarget({
      tenantId: req.tenantId,
      teamId: req.params.id,
      monthStart: period.start,
      amount,
      userId: req.userId,
    });
    await logActivity({
      tenant_id: req.tenantId,
      user_id: req.userId,
      action: 'update',
      entity_type: 'team_target',
      entity_id: req.params.id,
      description: 'Meta mensal da equipe atualizada',
      metadata: { month_start: period.start, amount },
    });
    res.json({ success: true, data: target });
  } catch (err) {
    return mutationError(res, err, 'team-targets/update');
  }
});

// Metas por competência. A leitura é escopada por perfil; somente Master edita.
router.get('/targets', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const level = access.accessLevel(req.userRole, 'gestao');
    let companyTarget = null;
    let teamTargets = [];
    let userTargets = [];
    if (level === 'full') {
      [companyTarget, teamTargets, userTargets] = await Promise.all([
        mgmt.getCompanyTarget(req.tenantId, period.start),
        mgmt.getTeamTargets(req.tenantId, period.start),
        mgmt.getUserTargets(req.tenantId, period.start),
      ]);
    } else if (level === 'team') {
      [teamTargets, userTargets] = await Promise.all([
        req.teamId ? mgmt.getTeamTargets(req.tenantId, period.start, { teamId: req.teamId }) : [],
        req.teamId ? mgmt.getUserTargets(req.tenantId, period.start, { teamId: req.teamId }) : mgmt.getUserTargets(req.tenantId, period.start, { userId: req.userId }),
      ]);
      userTargets = userTargets.filter((row) => row.role === 'seller' || row.user_id === req.userId);
    } else {
      userTargets = await mgmt.getUserTargets(req.tenantId, period.start, { userId: req.userId });
    }
    res.json({ success: true, data: { period, company_target: companyTarget, team_targets: teamTargets, user_targets: userTargets } });
  } catch (err) {
    return mutationError(res, err, 'targets/list');
  }
});

router.put('/targets/company', requireRole('master'), async (req, res) => {
  try {
    const period = resolvePeriod(req.body);
    const amount = nonNegative(req.body.amount, 'Meta geral da empresa');
    const target = await mgmt.upsertCompanyTarget({ tenantId: req.tenantId, monthStart: period.start, amount, userId: req.userId });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'update', entity_type: 'company_target', description: 'Meta mensal geral atualizada', metadata: { month_start: period.start, amount } });
    res.json({ success: true, data: target });
  } catch (err) {
    return mutationError(res, err, 'targets/company');
  }
});

router.put('/targets/users/:id', requireRole('master'), async (req, res) => {
  try {
    const period = resolvePeriod(req.body);
    const amount = nonNegative(req.body.amount, 'Meta individual');
    const target = await mgmt.upsertUserTarget({ tenantId: req.tenantId, targetUserId: req.params.id, monthStart: period.start, amount, userId: req.userId });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'update', entity_type: 'user_target', entity_id: req.params.id, description: 'Meta mensal individual atualizada', metadata: { month_start: period.start, amount } });
    res.json({ success: true, data: target });
  } catch (err) {
    return mutationError(res, err, 'targets/user');
  }
});

// ─── COLABORADORES ───────────────────────────────────────────────────────────
router.get('/collaborators', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const monthStart = period.start;
    const monthEnd = period.end;

    const level = access.accessLevel(req.userRole, 'gestao');
    const filterTeam = level === 'full' ? (req.query.team_id || null) : req.teamId || null;

    let rows = await mgmt.getCollaborators(req.tenantId, {
      teamId: filterTeam,
      monthStart, monthEnd,
      periodStart: period.start, periodEnd: period.end,
    });

    // Consultor só vê a si mesmo
    if (level === 'own') rows = rows.filter((u) => u.id === req.userId);
    if (level === 'team') rows = rows.filter((u) => u.id === req.userId || String(u.role).toLowerCase() === 'seller');
    if (level !== 'full') {
      rows = rows.map((row) => {
        const safe = { ...row };
        for (const field of ['salary', 'benefits_amount', 'other_monthly_costs',
          'employer_charges_percentage', 'thirteenth_salary_enabled',
          'thirteenth_provision', 'additional_cost_period']) delete safe[field];
        return safe;
      });
    }
    res.json({ success: true, data: rows, period });
  } catch (err) {
    console.error('[management/collaborators]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/collaborators/:id/detail', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const detail = await mgmt.getCollaboratorDetail(req.params.id, req.tenantId, { months: req.query.months, monthStart: period.start });
    if (!detail) return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });
    const level = access.accessLevel(req.userRole, 'gestao');
    if (level === 'team' && (!req.teamId || detail.collaborator.team_id !== req.teamId)) {
      return res.status(403).json({ success: false, error: 'Colaborador fora da sua equipe.' });
    }
    if (level === 'own' && detail.collaborator.id !== req.userId) {
      return res.status(403).json({ success: false, error: 'Acesso negado a este colaborador.' });
    }
    if (level !== 'full') {
      for (const field of ['salary', 'benefits_amount', 'other_monthly_costs',
        'employer_charges_percentage', 'employer_charges', 'thirteenth_salary_enabled',
        'thirteenth_provision']) delete detail.collaborator[field];
      detail.costs = [];
    }
    res.json({ success: true, data: detail });
  } catch (err) {
    return mutationError(res, err, 'collaborators/detail');
  }
});

router.post('/collaborators/:id/commission-tiers', requireRole('master', 'admin'), async (req, res) => {
  void req;
  return res.status(409).json({ success: false, error: 'A comissão é fixa em 10% acima de R$ 7.500,00; faixas adicionais estão desativadas.' });
});

router.put('/commission-tiers/:id', requireRole('master', 'admin'), async (req, res) => {
  void req;
  return res.status(409).json({ success: false, error: 'A comissão é fixa em 10% acima de R$ 7.500,00; faixas adicionais estão desativadas.' });
});

router.delete('/commission-tiers/:id', requireRole('master', 'admin'), async (req, res) => {
  void req;
  return res.status(409).json({ success: false, error: 'A comissão é fixa em 10% acima de R$ 7.500,00; faixas adicionais estão desativadas.' });
});

// Usuários são provisionados fora do módulo Gestão. Aqui só administramos
// colaboradores já existentes e seus dados organizacionais/financeiros.
router.post('/collaborators', requireRole('master', 'admin'), (_req, res) => {
  res.status(405).json({
    success: false,
    error: 'A Gestão de Colaboradores não cria usuários; ela administra usuários já cadastrados.',
  });
});

// Atualiza cadastro, organização e remuneração do colaborador — master/admin.
router.put('/collaborators/:id', requireRole('master', 'admin'), async (req, res) => {
  try {
    const before = await mgmt.getCollaboratorById(req.params.id, req.tenantId);
    if (!before) return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });
    if (!canManageCollaborator(req, before, before.role)) {
      return res.status(403).json({ success: false, error: 'Você não pode administrar este colaborador.' });
    }
    if (req.params.id === req.userId && req.body.is_active === false) {
      return res.status(400).json({ success: false, error: 'Você não pode desativar o próprio acesso.' });
    }
    const numeric = {};
    const numericFields = [
      ['salary', 'Salário'], ['benefits_amount', 'Benefícios'],
      ['other_monthly_costs', 'Outros custos mensais'],
      ['employer_charges_percentage', 'Percentual de encargos', 100],
    ];
    for (const [field, label, max] of numericFields) {
      if (req.body[field] !== undefined) numeric[field] = nonNegative(req.body[field], label, { max });
    }
    const fields = {
      ...numeric,
      team_id: req.body.team_id,
      supervisor_id: req.body.supervisor_id,
      hire_date: req.body.hire_date,
      termination_date: req.body.termination_date,
      position: req.body.position === undefined ? undefined : String(req.body.position).trim(),
      is_active: req.body.is_active,
      thirteenth_salary_enabled: req.body.thirteenth_salary_enabled,
      employment_type: req.body.employment_type === undefined ? undefined : String(req.body.employment_type).trim().substring(0, 30),
    };
    const updated = await mgmt.updateCollaborator(req.params.id, {
      ...fields,
    }, req.tenantId);
    if (!updated) return res.status(404).json({ success: false, error: 'Colaborador não encontrado' });

    // Auditoria de mudanças sensíveis
    if (req.body.team_id !== undefined || req.body.supervisor_id !== undefined) {
      await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'update', entity_type: 'collaborator_org', entity_id: req.params.id, description: 'Equipe/supervisor alterados', metadata: { team_id: req.body.team_id, supervisor_id: req.body.supervisor_id } });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    return mutationError(res, err, 'collaborators/update');
  }
});

// Folha e custos são dados sensíveis: somente Master/Admin.
router.get('/workforce-summary', requireRole('master', 'admin'), async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const [workforce, commercial, officeExpenses] = await Promise.all([
      mgmt.getWorkforceSummary(req.tenantId, { ...period, teamId: req.query.team_id || null }),
      mgmt.getOverview(req.tenantId, { ...period, teamId: req.query.team_id || null }),
      mgmt.getOfficeExpenses(req.tenantId, period),
    ]);
    const revenue = Number(commercial.total_amount || 0);
    const peopleCost = Number(workforce.totals.totalPeopleCost || 0);
    const fixedCosts = officeExpenses.filter((row) => row.expense_type === 'fixed').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const variableCosts = officeExpenses.filter((row) => row.expense_type === 'variable').reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const totalCost = peopleCost + fixedCosts + variableCosts;
    res.json({
      success: true,
      data: {
        period, ...workforce, revenue: revenue.toFixed(2),
        fixed_costs: fixedCosts.toFixed(2),
        variable_costs: variableCosts.toFixed(2),
        total_cost: totalCost.toFixed(2),
        operating_result: (revenue - totalCost).toFixed(2),
        people_cost_ratio: revenue > 0 ? ((peopleCost / revenue) * 100).toFixed(2) : '0.00',
        cost_revenue_ratio: revenue > 0 ? ((totalCost / revenue) * 100).toFixed(2) : '0.00',
      },
    });
  } catch (err) {
    return mutationError(res, err, 'workforce-summary');
  }
});

router.get('/collaborator-costs', requireRole('master', 'admin'), async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const rows = await mgmt.getCollaboratorCosts(req.tenantId, {
      ...period,
      collaboratorId: req.query.collaborator_id || null,
      teamId: req.query.team_id || null,
    });
    res.json({ success: true, data: rows, period });
  } catch (err) {
    return mutationError(res, err, 'collaborator-costs/list');
  }
});

router.post('/collaborator-costs', requireRole('master', 'admin'), async (req, res) => {
  try {
    const collaboratorId = req.body.collaborator_id;
    const description = String(req.body.description || '').trim();
    const category = String(req.body.category || 'other').toLowerCase();
    const amount = nonNegative(req.body.amount, 'Valor do custo');
    const competence = String(req.body.competence || '').substring(0, 10);
    if (!collaboratorId || !description || !/^\d{4}-\d{2}-\d{2}$/.test(competence) || !COST_CATEGORIES.has(category)) {
      throw Object.assign(new Error('Preencha colaborador, categoria, descrição e competência.'), { code: 'VALIDATION' });
    }
    if (category === 'transport') {
      throw Object.assign(new Error('Defina a passagem mensal em “Editar custos”; ela substitui o valor anterior.'), { code: 'VALIDATION' });
    }
    const cost = await mgmt.createCollaboratorCost({
      tenant_id: req.tenantId, collaborator_id: collaboratorId, category,
      description, amount, competence, recurring: req.body.recurring === true,
      end_date: req.body.end_date || null, created_by: req.userId,
    });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'create', entity_type: 'collaborator_cost', entity_id: cost.id, description: `Custo "${description}" lançado` });
    res.status(201).json({ success: true, data: cost });
  } catch (err) {
    return mutationError(res, err, 'collaborator-costs/create');
  }
});

router.put('/collaborators/:id/monthly-transport', requireRole('master', 'admin'), async (req, res) => {
  try {
    const amount = nonNegative(req.body.amount, 'Valor da passagem');
    const competence = String(req.body.competence || '').substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(competence)) {
      throw Object.assign(new Error('Competência inválida.'), { code: 'VALIDATION' });
    }
    const cost = await mgmt.setMonthlyTransport({
      tenant_id: req.tenantId,
      collaborator_id: req.params.id,
      amount,
      competence,
      created_by: req.userId,
    });
    await logActivity({
      tenant_id: req.tenantId,
      user_id: req.userId,
      action: 'update',
      entity_type: 'collaborator_transport',
      entity_id: req.params.id,
      description: `Passagem mensal definida em R$ ${amount}`,
    });
    res.json({ success: true, data: cost, cleared: cost === null });
  } catch (err) {
    return mutationError(res, err, 'collaborators/monthly-transport');
  }
});

router.put('/collaborator-costs/:id', requireRole('master', 'admin'), async (req, res) => {
  try {
    const fields = {};
    if (req.body.collaborator_id !== undefined) fields.collaborator_id = req.body.collaborator_id;
    if (req.body.category !== undefined) {
      fields.category = String(req.body.category).toLowerCase();
      if (!COST_CATEGORIES.has(fields.category)) throw Object.assign(new Error('Categoria inválida.'), { code: 'VALIDATION' });
    }
    if (req.body.description !== undefined) fields.description = String(req.body.description).trim();
    if (req.body.amount !== undefined) fields.amount = nonNegative(req.body.amount, 'Valor do custo');
    if (req.body.competence !== undefined) fields.competence = String(req.body.competence).substring(0, 10);
    if (req.body.recurring !== undefined) fields.recurring = req.body.recurring === true;
    if (req.body.end_date !== undefined) fields.end_date = req.body.end_date || null;
    const updated = await mgmt.updateCollaboratorCost(req.params.id, fields, req.tenantId);
    if (!updated) return res.status(404).json({ success: false, error: 'Custo não encontrado' });
    res.json({ success: true, data: updated });
  } catch (err) {
    return mutationError(res, err, 'collaborator-costs/update');
  }
});

router.delete('/collaborator-costs/:id', requireRole('master', 'admin'), async (req, res) => {
  try {
    const deleted = await mgmt.deleteCollaboratorCost(req.params.id, req.tenantId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Custo não encontrado' });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'delete', entity_type: 'collaborator_cost', entity_id: req.params.id, description: 'Custo de colaborador excluído' });
    res.json({ success: true });
  } catch (err) {
    return mutationError(res, err, 'collaborator-costs/delete');
  }
});

router.get('/office-expenses', requireRole('master', 'admin'), async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const expenseType = req.query.expense_type || null;
    if (expenseType && !['fixed', 'variable'].includes(expenseType)) {
      throw Object.assign(new Error('Tipo de despesa inválido.'), { code: 'VALIDATION' });
    }
    const rows = await mgmt.getOfficeExpenses(req.tenantId, { ...period, expenseType });
    res.json({ success: true, data: rows, period });
  } catch (err) {
    return mutationError(res, err, 'office-expenses/list');
  }
});

router.post('/office-expenses', requireRole('master', 'admin'), async (req, res) => {
  try {
    const category = String(req.body.category || '').toLowerCase();
    const expenseType = OFFICE_EXPENSE_CATEGORIES.get(category);
    const description = String(req.body.description || '').trim();
    const competence = String(req.body.competence || '').substring(0, 10);
    const dueDate = String(req.body.due_date || '').substring(0, 10);
    const status = String(req.body.status || 'pending').toLowerCase();
    const amount = nonNegative(req.body.amount, 'Valor da despesa');
    if (!expenseType || !description || description.length > 180
      || !/^\d{4}-\d{2}-\d{2}$/.test(competence) || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
      || !OFFICE_EXPENSE_STATUSES.has(status)) {
      throw Object.assign(new Error('Preencha categoria, despesa, competência, vencimento, valor e status.'), { code: 'VALIDATION' });
    }
    const expense = await mgmt.createOfficeExpense({
      tenant_id: req.tenantId, expense_type: expenseType, category, description,
      competence, due_date: dueDate, amount, status, created_by: req.userId,
    });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'create', entity_type: 'office_expense', entity_id: expense.id, description: `Despesa "${description}" lançada` });
    res.status(201).json({ success: true, data: expense });
  } catch (err) {
    return mutationError(res, err, 'office-expenses/create');
  }
});

router.put('/office-expenses/:id', requireRole('master', 'admin'), async (req, res) => {
  try {
    const fields = {};
    if (req.body.category !== undefined) {
      fields.category = String(req.body.category).toLowerCase();
      fields.expense_type = OFFICE_EXPENSE_CATEGORIES.get(fields.category);
      if (!fields.expense_type) throw Object.assign(new Error('Categoria inválida.'), { code: 'VALIDATION' });
    }
    if (req.body.description !== undefined) {
      fields.description = String(req.body.description).trim();
      if (!fields.description || fields.description.length > 180) throw Object.assign(new Error('Descrição inválida.'), { code: 'VALIDATION' });
    }
    if (req.body.competence !== undefined) fields.competence = String(req.body.competence).substring(0, 10);
    if (req.body.due_date !== undefined) fields.due_date = String(req.body.due_date).substring(0, 10);
    if (req.body.amount !== undefined) fields.amount = nonNegative(req.body.amount, 'Valor da despesa');
    if (req.body.status !== undefined) {
      fields.status = String(req.body.status).toLowerCase();
      if (!OFFICE_EXPENSE_STATUSES.has(fields.status)) throw Object.assign(new Error('Status inválido.'), { code: 'VALIDATION' });
    }
    const updated = await mgmt.updateOfficeExpense(req.params.id, fields, req.tenantId);
    if (!updated) return res.status(404).json({ success: false, error: 'Despesa não encontrada' });
    res.json({ success: true, data: updated });
  } catch (err) {
    return mutationError(res, err, 'office-expenses/update');
  }
});

router.delete('/office-expenses/:id', requireRole('master', 'admin'), async (req, res) => {
  try {
    const deleted = await mgmt.deleteOfficeExpense(req.params.id, req.tenantId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Despesa não encontrada' });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'delete', entity_type: 'office_expense', entity_id: req.params.id, description: 'Despesa do escritório excluída' });
    res.json({ success: true });
  } catch (err) {
    return mutationError(res, err, 'office-expenses/delete');
  }
});

// ─── FECHAMENTO / FINANCEIRO DA EQUIPE ───────────────────────────────────────
// GET /api/management/team/:id?month=&year=
// Supervisor só acessa a própria equipe (senão 403). master/admin qualquer.
router.get('/team/:id', async (req, res) => {
  try {
    const level = access.accessLevel(req.userRole, 'gestao');
    if (level !== 'full') {
      if (!req.teamId || req.params.id !== req.teamId) {
        return res.status(403).json({ success: false, error: 'Você só pode consultar a sua própria equipe.' });
      }
    }
    const team = await mgmt.getTeamById(req.params.id, req.tenantId);
    if (!team) return res.status(404).json({ success: false, error: 'Equipe não encontrada' });

    const period = resolvePeriod(req.query);
    const prev = previousPeriod(period);
    if (level === 'team') {
      if (team.supervisor_id !== req.userId) {
        return res.status(403).json({ success: false, error: 'Somente o supervisor responsável pode consultar este painel.' });
      }
      const [dashboard, previousDashboard] = await Promise.all([
        mgmt.getSupervisionDashboard(req.tenantId, team.id, req.userId, period),
        mgmt.getSupervisionDashboard(req.tenantId, team.id, req.userId, prev),
      ]);
      return res.json({
        success: true,
        data: {
          team, period,
          current: dashboard.team,
          previous: previousDashboard.team,
          comparison: {
            amount_diff: (Number(dashboard.team.total_amount) - Number(previousDashboard.team.total_amount)).toFixed(2),
            amount_pct: pctDiff(dashboard.team.total_amount, previousDashboard.team.total_amount),
          },
          ranking: dashboard.ranking,
          monthly: dashboard.monthly,
          collaborators: dashboard.consultants,
          workforce: null,
          team_target: dashboard.team,
          personal: dashboard.personal,
          supervision_commission: dashboard.supervision_commission,
        },
      });
    }
    const [current, previous, ranking, monthly, collaborators, workforce, teamTargets, supervisionTeam, supervisorPersonal] = await Promise.all([
      mgmt.getOverview(req.tenantId, { ...period, teamId: team.id }),
      mgmt.getOverview(req.tenantId, { ...prev, teamId: team.id }),
      mgmt.getRanking(req.tenantId, { ...period, teamId: team.id }),
      mgmt.getMonthlyEvolution(req.tenantId, { months: 12, teamId: team.id }),
      mgmt.getCollaborators(req.tenantId, {
        teamId: team.id,
        monthStart: period.start, monthEnd: period.end,
        periodStart: period.start, periodEnd: period.end,
      }),
      level === 'full' ? mgmt.getWorkforceSummary(req.tenantId, { ...period, teamId: team.id }) : Promise.resolve(null),
      mgmt.getTeamTargets(req.tenantId, period.start, { teamId: team.id }),
      team.supervisor_id
        ? mgmt.getOverview(req.tenantId, { ...period, teamId: team.id, supervisorId: team.supervisor_id })
        : Promise.resolve(null),
      team.supervisor_id
        ? mgmt.getOverview(req.tenantId, { ...period, teamId: team.id, sellerId: team.supervisor_id })
        : Promise.resolve(null),
    ]);

    res.json({
      success: true,
      data: {
        team, period, current, previous,
        comparison: {
          amount_diff: (Number(current.total_amount) - Number(previous.total_amount)).toFixed(2),
          amount_pct: pctDiff(current.total_amount, previous.total_amount),
        },
        ranking, monthly, collaborators, workforce,
        team_target: teamTargets[0] || { team_id: team.id, team_name: team.name, amount: null, configured: false },
        supervision_commission: supervisionTeam && supervisorPersonal
          ? mgmt.buildSupervisionCommission(supervisionTeam.total_amount, supervisorPersonal.total_amount)
          : null,
      },
    });
  } catch (err) {
    console.error('[management/team]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── VENDAS ──────────────────────────────────────────────────────────────────
router.get('/sales', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const scope = commercialScope(req);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;
    const sales = await mgmt.getSales(req.tenantId, { ...period, ...scope, limit, offset });
    res.json({ success: true, data: sales, period });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sales/installments', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const scope = commercialScope(req);
    const rows = await mgmt.getInstallmentFollowUps(req.tenantId, {
      ...scope,
      periodStart: period.start,
      periodEnd: period.end,
    });
    res.json({ success: true, data: rows, period });
  } catch (err) {
    return mutationError(res, err, 'sales/installments');
  }
});

router.patch('/sales/installments/:planId', async (req, res) => {
  try {
    if (!UUID_PATTERN.test(req.params.planId)) {
      return res.status(400).json({ success: false, error: 'Parcelamento inválido.' });
    }
    const existing = await mgmt.getLatestInstallmentPlan(req.tenantId, req.params.planId);
    if (!existing) return res.status(404).json({ success: false, error: 'Cobrança não encontrada.' });
    const level = access.accessLevel(req.userRole, 'gestao');
    if (level === 'own' && existing.seller_id !== req.userId) {
      return res.status(403).json({ success: false, error: 'Acesso negado a esta cobrança.' });
    }
    if (level === 'team') {
      const visibleRole = String(existing.seller_role_snapshot || '').toLowerCase();
      const visibleSchedule = existing.team_id === req.teamId
        && (visibleRole === 'seller' || existing.seller_id === req.userId);
      if (!visibleSchedule) return res.status(403).json({ success: false, error: 'Cobrança fora da sua equipe.' });
    }
    const schedule = installmentScheduleFields(req.body);
    const updated = await mgmt.updateInstallmentSchedule(req.params.planId, schedule, req.tenantId);
    await logActivity({
      tenant_id: req.tenantId,
      user_id: req.userId,
      action: 'update',
      entity_type: 'installment_schedule',
      entity_id: req.params.planId,
      description: 'Cobrança programada atualizada sem alterar o faturamento',
      metadata: {
        before: {
          next_installment_due_date: existing.next_installment_due_date,
          next_installment_amount: existing.next_installment_amount,
          installment_frequency: existing.installment_frequency,
        },
        after: schedule,
      },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    return mutationError(res, err, 'sales/installments/update');
  }
});

router.get('/sales/responsibles', async (req, res) => {
  try {
    const level = access.accessLevel(req.userRole, 'gestao');
    const rows = await mgmt.getSalesResponsibles(req.tenantId, {
      level,
      actorId: req.userId,
      teamId: req.teamId,
    });
    const options = rows.map((row) => ({
      option_key: `user:${row.seller_id}`,
      seller_id: row.seller_id,
      name: row.name,
      role: row.role,
    }));
    options.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json({ success: true, data: options });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/sales/export', async (req, res) => {
  try {
    const period = resolvePeriod(req.query);
    const scope = commercialScope(req);
    const [sales, collaboratorRows, teamTargets, companyTarget, scopedUserTargets] = await Promise.all([
      mgmt.getSales(req.tenantId, { ...period, ...scope, limit: 50000, offset: 0 }),
      mgmt.getCollaborators(req.tenantId, {
        teamId: scope.teamId,
        monthStart: period.start,
        monthEnd: period.end,
        periodStart: period.start,
        periodEnd: period.end,
      }),
      mgmt.getTeamTargets(req.tenantId, period.start, { teamId: scope.teamId || null }),
      scope.teamId || scope.sellerId ? Promise.resolve(null) : mgmt.getCompanyTarget(req.tenantId, period.start),
      scope.sellerId ? mgmt.getUserTargets(req.tenantId, period.start, { userId: scope.sellerId }) : Promise.resolve([]),
    ]);
    let consultants = collaboratorRows.filter((item) =>
      ['seller', 'supervisor'].includes(String(item.role || '').toLowerCase()) && item.is_active !== false
    );
    if (scope.sellerId) {
      consultants = consultants.filter((item) => item.id === scope.sellerId);
      const target = scopedUserTargets.find((item) => item.user_id === scope.sellerId);
      consultants = consultants.map((item) => ({
        ...item,
        monthly_sales_target: target?.configured ? Number(target.amount || 0) : 0,
        monthly_target_configured: target?.configured === true,
      }));
    }

    const generalTarget = scope.sellerId
      ? Number(consultants[0]?.monthly_sales_target || 0)
      : scope.teamId
        ? Number(teamTargets[0]?.configured ? teamTargets[0].amount : 0)
        : Number(companyTarget?.configured ? companyTarget.amount : 0);
    const file = await buildSalesWorkbook({ sales, consultants, period, generalTarget });
    const filename = salesWorkbookFilename(period);
    await logActivity({
      tenant_id: req.tenantId,
      user_id: req.userId,
      action: 'export',
      entity_type: 'sales_workbook',
      description: `Exportou o quadro mensal de vendas (${period.start} a ${period.end})`,
      metadata: { rows: sales.length, consultants: consultants.length },
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', file.length);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file);
  } catch (err) {
    return mutationError(res, err, 'sales/export');
  }
});

router.post('/sales', async (req, res) => {
  try {
    const level = access.accessLevel(req.userRole, 'gestao');
    // Consultor só registra venda PRÓPRIA
    let seller_id = req.body.seller_id || null;
    if (level === 'own') seller_id = req.userId;
    const seller = await assertSellerAllowed(req, seller_id);
    const seller_display_name = resolveSalesResponsibleDisplayName(seller, req.body.seller_display_name);

    if (!req.body.amount || Number(req.body.amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valor da venda é obrigatório e deve ser maior que zero.' });
    }
    const commercial = saleCommercialFields(req.body);

    const sale = await mgmt.createSale({
      tenant_id: req.tenantId,
      seller_id,
      client_id: req.body.client_id || null,
      company_id: req.body.company_id || null,
      lead_id: req.body.lead_id || null,
      fine_id: req.body.fine_id || null,
      description: req.body.description || null,
      ...commercial,
      amount: req.body.amount,
      closed_at: req.body.closed_at || null,
      status: req.body.status || 'confirmed',
      created_by: req.userId,
      seller_display_name,
    });
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'create', entity_type: 'sale', entity_id: sale.id, description: `Venda registrada (R$ ${sale.amount})` });
    res.status(201).json({ success: true, data: sale });
  } catch (err) {
    return mutationError(res, err, 'sales/create');
  }
});

router.put('/sales/:id', async (req, res) => {
  try {
    const existing = await mgmt.getSaleById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ success: false, error: 'Venda não encontrada' });
    const level = access.accessLevel(req.userRole, 'gestao');
    // Consultor só edita a própria venda
    if (level === 'own' && existing.seller_id !== req.userId) {
      return res.status(403).json({ success: false, error: 'Acesso negado a esta venda.' });
    }
    if (level === 'team') {
      const visibleRole = String(existing.seller_role_snapshot || '').toLowerCase();
      const visibleSale = existing.team_id === req.teamId
        && (visibleRole === 'seller' || existing.seller_id === req.userId);
      if (!visibleSale) return res.status(403).json({ success: false, error: 'Venda fora da sua equipe.' });
    }
    const sellerId = level === 'own' ? req.userId : (req.body.seller_id || existing.seller_id);
    const displayNameWasSent = Object.prototype.hasOwnProperty.call(req.body, 'seller_display_name');
    let seller = null;
    if (sellerId !== existing.seller_id || level !== 'team' || displayNameWasSent) {
      seller = await assertSellerAllowed(req, sellerId);
    }
    const seller_display_name = displayNameWasSent
      ? resolveSalesResponsibleDisplayName(seller, req.body.seller_display_name)
      : (sellerId !== existing.seller_id ? resolveSalesResponsibleDisplayName(seller) : undefined);
    if (req.body.amount !== undefined && Number(req.body.amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valor da venda deve ser maior que zero.' });
    }
    const commercial = saleCommercialFields(req.body, { partial: true });
    const sale = await mgmt.updateSale(req.params.id, {
      ...req.body, ...commercial, seller_id: sellerId, seller_display_name,
    }, req.tenantId);
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'update', entity_type: 'sale', entity_id: req.params.id, description: 'Venda atualizada', metadata: { before: { amount: existing.amount, status: existing.status }, after: req.body } });
    res.json({ success: true, data: sale });
  } catch (err) {
    return mutationError(res, err, 'sales/update');
  }
});

router.delete('/sales/:id', requireRole('master', 'admin', 'supervisor'), async (req, res) => {
  try {
    const existing = await mgmt.getSaleById(req.params.id, req.tenantId);
    if (!existing) return res.status(404).json({ success: false, error: 'Venda não encontrada' });
    // Supervisor só cancela venda da própria equipe
    if (access.accessLevel(req.userRole, 'gestao') === 'team') {
      const visibleRole = String(existing.seller_role_snapshot || '').toLowerCase();
      if (!req.teamId || existing.team_id !== req.teamId
        || (visibleRole !== 'seller' && existing.seller_id !== req.userId)) {
        return res.status(403).json({ success: false, error: 'Venda fora da sua equipe.' });
      }
    }
    await mgmt.deleteSale(req.params.id, req.tenantId);
    await logActivity({ tenant_id: req.tenantId, user_id: req.userId, action: 'delete', entity_type: 'sale', entity_id: req.params.id, description: 'Venda excluída/cancelada' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
