'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getCollaborators, getTeams, getCollaboratorDetail,
  updateCollaborator, updateUserTarget, createCollaboratorCost, updateCollaboratorCost, deleteCollaboratorCost,
} from '../lib/managementAPI';
import { formatBRL, formatDate } from '../lib/processConstants';
import { FIXED_COMMISSION_PERCENTAGE, FIXED_COMMISSION_THRESHOLD, SUPERVISOR_PERSONAL_PERCENTAGE } from '../lib/commissionPolicy';
import PeriodFilter from './components/PeriodFilter';
import MiniBarChart from './components/MiniBarChart';

const now = new Date();
const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

export default function Colaboradores() {
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const role = String(readUser().role || '').toLowerCase();
  const canManage = role === 'master' || role === 'admin';
  const canManageTarget = role === 'master';

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const params = { month: period.month, year: period.year };
      const [collaborators, teamRows] = await Promise.all([
        getCollaborators(params), getTeams().catch(() => []),
      ]);
      setRows(collaborators || []);
      setTeams(teamRows || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const refreshDetail = useCallback(async (id) => {
    try {
      setDetailLoading(true);
      setDetail(await getCollaboratorDetail(id, { months: 12, month: period.month, year: period.year }));
    } catch (err) { setError(err.message); }
    finally { setDetailLoading(false); }
  }, [period]);

  const openDetail = (user) => {
    setSelected(user);
    setDetail(null);
    refreshDetail(user.id);
  };

  const changed = async () => {
    await Promise.all([load(), refreshDetail(selected.id)]);
  };

  if (loading && rows.length === 0) return <Loading />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={headerStyle}>
        <div><h2 style={titleStyle}>Base de colaboradores</h2><p style={subtitleStyle}>Dados cadastrais, vínculo, remuneração e desempenho individual</p></div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {error && <div className="error-message">{error}</div>}

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ ...cardHead, padding: '14px 18px', marginBottom: 0, borderBottom: '1px solid #f1f5f9' }}>
          <span style={cardTitle}>Colaboradores</span><span style={muted}>{rows.length} usuário(s) · clique para ver a ficha</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ border: 'none', borderRadius: 0, minWidth: canManage ? 1450 : 1060 }}>
            <thead><tr><th>Colaborador</th><th>Cargo / regime</th><th>Equipe</th>{canManage && <><th style={right}>Salário</th><th style={right}>Custo fixo</th></>}<th style={right}>Comissão fixa</th><th style={right}>Meta mensal</th><th style={right}>Vendido</th><th style={right}>Falta</th><th style={right}>Comissão</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((user) => <tr key={user.id} className="clickable-row" tabIndex={0} role="button" onClick={() => openDetail(user)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') openDetail(user); }} style={user.is_active === false ? { opacity: 0.55 } : undefined}>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={user.name} /><div><div style={nameLink}>{user.name}</div><div style={muted}>{user.email}</div></div></div></td>
                <td><div>{user.position || roleLabel(user.role)}</div><div style={muted}>{user.employment_type || '—'}</div></td>
                <td style={{ color: '#475569' }}>{user.team_name || '—'}</td>
                {canManage && <><td style={right}>{formatBRL(user.salary)}</td><td style={{ ...right, fontWeight: 700 }}>{formatBRL(fixedCost(user))}</td></>}
                <td style={right}>{Number(user.commission_percentage || 0)}%</td>
                <td style={right}>{user.monthly_target_configured ? formatBRL(user.monthly_sales_target) : 'Não definida'}</td>
                <td style={{ ...right, fontWeight: 700 }}>{formatBRL(user.sold_period)}</td>
                <td style={{ ...right, color: user.monthly_target_configured && Math.max(Number(user.monthly_sales_target || 0) - Number(user.sold_period || 0), 0) === 0 ? '#15803d' : '#b45309', fontWeight: 700 }}>{user.monthly_target_configured ? formatBRL(Math.max(Number(user.monthly_sales_target || 0) - Number(user.sold_period || 0), 0)) : '—'}</td>
                <td style={{ ...right, color: '#15803d', fontWeight: 750 }}>{formatBRL(user.commission_period)}</td>
                <td><Status active={user.is_active !== false} /></td>
              </tr>)}
              {rows.length === 0 && <tr><td colSpan={canManage ? 11 : 9} style={emptyStyle}>Nenhum colaborador disponível.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <DetailSheet basic={selected} detail={detail} loading={detailLoading} canManage={canManage} canManageTarget={canManageTarget} period={period} teams={teams} allPeople={rows} onClose={() => { setSelected(null); setDetail(null); }} onChanged={changed} />}
    </div>
  );
}

function DetailSheet({ basic, detail, loading, canManage, canManageTarget, period, teams, allPeople, onClose, onChanged }) {
  const [tab, setTab] = useState('overview');
  const [costForm, setCostForm] = useState(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const person = detail?.collaborator || basic;

  const run = async (action) => {
    try { setActionError(''); await action(); await onChanged(); }
    catch (err) { setActionError(err.message); throw err; }
  };

  const removeCost = async (cost) => {
    if (!confirm(`Excluir o custo "${cost.description}"?`)) return;
    await run(() => deleteCollaboratorCost(cost.id));
  };
  const tabs = [
    ['overview', 'Visão geral'], ['performance', 'Mês a mês'],
    ...(canManageTarget ? [['target', 'Meta mensal']] : []),
    ...(canManage ? [['costs', 'Custos'], ['commission', 'Comissão'], ['admin', 'Administração']] : []),
  ];

  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" style={{ maxWidth: 1120, width: 'calc(100% - 28px)', maxHeight: '94vh', overflow: 'hidden', padding: 0 }} onClick={(event) => event.stopPropagation()}>
      <div style={detailHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}><Avatar name={person.name} large /><div><h2 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>{person.name}</h2><div style={{ ...muted, marginTop: 3 }}>{person.position || roleLabel(person.role)} · {person.team_name || 'Sem equipe'} · {person.email}</div></div></div>
        <button className="btn-close" onClick={onClose} aria-label="Fechar">×</button>
      </div>
      <div style={tabBar}>{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} style={{ ...tabButton, ...(tab === key ? activeTabButton : {}) }}>{label}</button>)}</div>
      <div style={{ padding: 20, overflowY: 'auto', minHeight: 430, maxHeight: 'calc(94vh - 132px)' }}>
        {actionError && <div className="error-message" style={{ marginBottom: 14 }}>{actionError}</div>}
        {loading || !detail ? <InlineLoading /> : <>
          {tab === 'overview' && <OverviewTab detail={detail} canManage={canManage} />}
          {tab === 'performance' && <PerformanceTab detail={detail} />}
          {tab === 'target' && canManageTarget && <TargetTab person={person} period={period} onSave={(amount) => run(() => updateUserTarget(person.id, { ...period, amount }))} />}
          {tab === 'costs' && canManage && <CostsTab detail={detail} form={costForm} setForm={setCostForm} onSave={(mode, id, body) => run(async () => { if (mode === 'edit') await updateCollaboratorCost(id, body); else await createCollaboratorCost(body); setCostForm(null); })} onDelete={removeCost} />}
          {tab === 'commission' && canManage && <CommissionTab detail={detail} />}
          {tab === 'admin' && canManage && <AdminTab person={person} teams={teams} people={allPeople} open={adminOpen} setOpen={setAdminOpen} onSave={(body) => run(async () => { await updateCollaborator(person.id, body); setAdminOpen(false); })} />}
        </>}
      </div>
    </div>
  </div>;
}

function OverviewTab({ detail, canManage }) {
  const person = detail.collaborator;
  const current = detail.current || {};
  const fixed = Number(person.salary || 0) + Number(person.benefits_amount || 0) + Number(person.other_monthly_costs || 0) + Number(person.employer_charges || 0) + Number(person.thirteenth_provision || 0);
  return <div style={stack}>
    <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}><Kpi label="Vendido na competência" value={formatBRL(current.total_amount)} cls="success" /><Kpi label="Meta mensal" value={current.target_configured ? formatBRL(current.target_amount) : 'Não definida'} cls="primary" /><Kpi label="Falta para a meta" value={current.target_configured ? formatBRL(current.target_remaining) : '—'} /><Kpi label="Comissão gerada" value={formatBRL(current.total_commission)} cls="warning" /></div>
    {canManage && <div style={summaryGrid}><SummaryItem label="Salário base" value={formatBRL(person.salary)} /><SummaryItem label="Custos fixos e provisões" value={formatBRL(fixed - Number(person.salary || 0))} /><SummaryItem label="Regra pessoal" value={commissionRuleLabel(person)} /><SummaryItem label="Percentual" value={`${Number(person.commission_percentage || 0)}%`} /></div>}
    <div style={sectionCard}><div style={sectionHead}><span style={cardTitle}>Últimas vendas</span><span style={muted}>{detail.recentSales.length} registro(s)</span></div><div style={{ overflowX: 'auto' }}><table className="data-table" style={{ border: 'none' }}><thead><tr><th>Data</th><th>Cliente</th><th>Serviço</th><th style={right}>Valor pago</th><th style={right}>% aplicado</th><th style={right}>Base comissionável</th><th style={right}>Comissão</th></tr></thead><tbody>{detail.recentSales.map((sale) => <tr key={sale.id}><td>{formatDate(sale.closed_at)}</td><td>{sale.customer_name || '—'}</td><td>{sale.service_name || sale.description || 'Venda'}</td><td style={right}>{formatBRL(sale.amount)}</td><td style={right}>{Number(sale.commission_percentage || 0)}%</td><td style={right}>{formatBRL(sale.commissionable_amount)}</td><td style={{ ...right, color: '#15803d', fontWeight: 700 }}>{formatBRL(sale.commission_amount)}</td></tr>)}{detail.recentSales.length === 0 && <tr><td colSpan={7} style={emptyStyle}>Ainda não há vendas.</td></tr>}</tbody></table></div></div>
  </div>;
}

function PerformanceTab({ detail }) {
  return <div style={stack}>
    <div style={sectionCard}><div style={sectionHead}><span style={cardTitle}>Evolução de vendas · últimos 12 meses</span></div><MiniBarChart data={detail.monthly} /></div>
    <div style={{ ...sectionCard, padding: 0, overflow: 'hidden' }}><div style={{ ...sectionHead, padding: '14px 16px', borderBottom: '1px solid #f1f5f9', margin: 0 }}><span style={cardTitle}>Detalhamento mês a mês</span></div><div style={{ overflowX: 'auto' }}><table className="data-table" style={{ border: 'none' }}><thead><tr><th>Mês</th><th style={right}>Vendas</th><th style={right}>Total vendido</th><th style={right}>Meta</th><th style={right}>Ticket médio</th><th style={right}>Comissão</th><th style={right}>Custos adicionais</th></tr></thead><tbody>{[...detail.monthly].reverse().map((month) => <tr key={month.month}><td style={{ fontWeight: 650 }}>{monthLabel(month.month)}</td><td style={right}>{month.sales_count}</td><td style={{ ...right, fontWeight: 700 }}>{formatBRL(month.total_amount)}</td><td style={right}>{month.target_configured ? formatBRL(month.target_amount) : 'Não definida'}</td><td style={right}>{formatBRL(month.avg_ticket)}</td><td style={{ ...right, color: '#15803d' }}>{formatBRL(month.total_commission)}</td><td style={right}>{formatBRL(month.additional_costs)}</td></tr>)}</tbody></table></div></div>
  </div>;
}

function TargetTab({ person, period, onSave }) {
  const configured = person.monthly_target_configured === true;
  const [amount, setAmount] = useState(configured ? Number(person.monthly_sales_target || 0) : '');
  const [saving, setSaving] = useState(false);
  const competence = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(Number(period.year), Number(period.month) - 1, 1));

  return <form style={stack} onSubmit={async (event) => {
    event.preventDefault();
    setSaving(true);
    try { await onSave(Number(amount || 0)); } finally { setSaving(false); }
  }}>
    <div style={infoBox}>A meta é registrada por competência e preserva o histórico. Alterar {competence} não modifica nenhum outro mês.</div>
    <div style={sectionCard}>
      <div style={sectionHead}><div><div style={cardTitle}>Meta individual · {competence}</div><div style={muted}>{person.name}</div></div><span className={`client-status-badge ${configured ? 'fechado' : 'negociacao'}`}>{configured ? 'Configurada' : 'Não definida'}</span></div>
      <MoneyField label="Valor da meta" value={amount} onChange={(event) => setAmount(event.target.value)} />
      <div style={{ ...muted, marginTop: 8 }}>Aceita zero como meta explícita. O responsável pela alteração e a data ficam registrados para auditoria.</div>
    </div>
    <div className="form-actions"><button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar meta mensal'}</button></div>
  </form>;
}

function CostsTab({ detail, form, setForm, onSave, onDelete }) {
  const person = detail.collaborator;
  const recurring = detail.costs.filter((cost) => cost.recurring).reduce((sum, cost) => sum + Number(cost.amount || 0), 0);
  return <div style={stack}>
    <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}><Kpi label="Salário base" value={formatBRL(person.salary)} cls="primary" /><Kpi label="Encargos" value={formatBRL(person.employer_charges)} /><Kpi label="Provisão de 13º" value={formatBRL(person.thirteenth_provision)} cls="warning" /><Kpi label="Detalhados recorrentes" value={formatBRL(recurring)} cls="success" /></div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={cardTitle}>Composição detalhada de custos</div><div style={muted}>Passagem, VR, VA, saúde, telefone, bônus e outros</div></div><button className="btn-primary" onClick={() => setForm({ mode: 'new', cost: null })}>+ Adicionar custo</button></div>
    {form && <CostEditor collaboratorId={person.id} mode={form.mode} cost={form.cost} onCancel={() => setForm(null)} onSave={onSave} />}
    <div style={{ ...sectionCard, padding: 0, overflow: 'hidden' }}><div style={{ overflowX: 'auto' }}><table className="data-table" style={{ border: 'none' }}><thead><tr><th>Tipo</th><th>Descrição</th><th>Recorrência</th><th>Início</th><th>Fim</th><th style={right}>Valor</th><th /></tr></thead><tbody>{detail.costs.map((cost) => <tr key={cost.id}><td><span style={categoryBadge}>{costLabel(cost.category)}</span></td><td style={{ fontWeight: 650 }}>{cost.description}</td><td>{cost.recurring ? 'Mensal' : 'Avulso'}</td><td>{formatDate(cost.competence)}</td><td>{cost.end_date ? formatDate(cost.end_date) : '—'}</td><td style={{ ...right, fontWeight: 700 }}>{formatBRL(cost.amount)}</td><td><div style={{ display: 'flex', gap: 6 }}><button className="btn-secondary" style={smallButton} onClick={() => setForm({ mode: 'edit', cost })}>Editar</button><button className="btn-secondary" style={{ ...smallButton, color: '#b91c1c' }} onClick={() => onDelete(cost)}>Excluir</button></div></td></tr>)}{detail.costs.length === 0 && <tr><td colSpan={7} style={emptyStyle}>Nenhum custo detalhado. Adicione passagem, VR e outros componentes.</td></tr>}</tbody></table></div></div>
  </div>;
}

function CostEditor({ collaboratorId, mode, cost, onCancel, onSave }) {
  const [data, setData] = useState({ collaborator_id: collaboratorId, category: cost?.category || 'transport', description: cost?.description || '', amount: cost?.amount ?? '', competence: dateValue(cost?.competence) || firstDayCurrentMonth(), recurring: cost?.recurring ?? true, end_date: dateValue(cost?.end_date) });
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setData((previous) => ({ ...previous, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  return <form style={editorCard} onSubmit={async (event) => { event.preventDefault(); setSaving(true); try { await onSave(mode, cost?.id, { ...data, amount: Number(data.amount), end_date: data.end_date || null }); } finally { setSaving(false); } }}><div style={formGrid}><Field label="Tipo"><select value={data.category} onChange={set('category')}>{COST_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Descrição"><input value={data.description} onChange={set('description')} required placeholder="Ex.: Vale-refeição mensal" /></Field><Field label="Valor"><input type="number" min="0" step="0.01" value={data.amount} onChange={set('amount')} required /></Field><Field label="Início / competência"><input type="date" value={data.competence} onChange={set('competence')} required /></Field><Field label="Fim (opcional)"><input type="date" value={data.end_date} onChange={set('end_date')} disabled={!data.recurring} /></Field></div><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}><label style={checkStyle}><input type="checkbox" checked={data.recurring} onChange={set('recurring')} /> Repetir mensalmente</label><div style={{ display: 'flex', gap: 8 }}><button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar custo'}</button></div></div></form>;
}

function CommissionTab({ detail }) {
  const current = detail.current || {};
  const person = detail.collaborator || {};
  const sold = Number(current.total_amount || 0);
  const isSupervisor = String(person.role || '').toLowerCase() === 'supervisor';
  if (isSupervisor) return <div style={stack}>
    <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}><Kpi label="Percentual pessoal" value={`${SUPERVISOR_PERSONAL_PERCENTAGE}%`} /><Kpi label="Vendas pessoais" value={formatBRL(sold)} cls="primary" /><Kpi label="Comissão pessoal" value={formatBRL(current.total_commission)} cls="warning" /></div>
    <div style={infoBox}>As vendas pessoais da supervisão recebem {SUPERVISOR_PERSONAL_PERCENTAGE}% sobre o valor integral. A comissão adicional de 5% da equipe é exibida somente no painel da supervisão e não inclui estas vendas pessoais.</div>
  </div>;
  const percentage = Number(person.commission_percentage ?? FIXED_COMMISSION_PERCENTAGE);
  const threshold = Number(person.commission_threshold ?? FIXED_COMMISSION_THRESHOLD);
  if (threshold === 0) return <div style={stack}>
    <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}><Kpi label="Percentual pessoal" value={`${percentage}%`} /><Kpi label="Vendido na competência" value={formatBRL(sold)} cls="primary" /><Kpi label="Gatilho mínimo" value="Desde a 1ª venda" cls="success" /><Kpi label="Comissão no mês" value={formatBRL(current.total_commission)} cls="warning" /></div>
    <div style={infoBox}>{percentage}% sobre o valor integral das vendas, desde a primeira venda. As vendas não entram no cálculo de comissão da supervisão. Cada venda mantém o percentual e a base como snapshot auditável.</div>
  </div>;
  const progress = Math.min((sold / threshold) * 100, 100);
  const thresholdReached = sold >= threshold;
  return <div style={stack}>
    <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}><Kpi label="Percentual fixo" value={`${percentage}%`} /><Kpi label="Gatilho fixo" value={formatBRL(threshold)} cls="primary" /><Kpi label="Falta para comissionar" value={formatBRL(current.threshold_remaining)} cls="success" /><Kpi label="Comissão no mês" value={formatBRL(current.total_commission)} cls="warning" /></div>
    <div style={infoBox}>A comissão é fixa em {percentage}% sobre o valor vendido que exceder {formatBRL(threshold)} no mês. Abaixo do gatilho, a comissão é zero. Cada venda mantém o percentual e a base como snapshot auditável.</div>
    <div style={progressCard}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><div><strong>{thresholdReached ? 'Gatilho atingido' : 'Progresso até o gatilho'}</strong><div style={muted}>{thresholdReached ? `${formatBRL(sold)} vendidos no mês` : `Faltam ${formatBRL(current.threshold_remaining)} para iniciar a comissão`}</div></div><strong>{progress.toFixed(0)}%</strong></div><div style={progressTrack}><div style={{ ...progressFill, width: `${progress}%` }} /></div></div>
    {thresholdReached && <div style={successBox}>As próximas vendas do mês geram {percentage}% de comissão sobre o valor que exceder o gatilho.</div>}
  </div>;
}

function AdminTab({ person, teams, people, open, setOpen, onSave }) {
  if (!open) return <div style={stack}><div style={infoBox}>A identidade e o acesso do usuário não são alterados aqui. Esta aba administra cargo, vínculo e remuneração. As metas são históricas e ficam na aba “Meta mensal”.</div><div style={summaryGrid}><SummaryItem label="Cargo" value={person.position || 'Não informado'} /><SummaryItem label="Equipe" value={person.team_name || 'Sem equipe'} /><SummaryItem label="Meta da competência" value={person.monthly_target_configured ? formatBRL(person.monthly_sales_target) : 'Não definida'} /><SummaryItem label="Regra de comissão" value={commissionRuleLabel(person)} /></div><button className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Editar administração</button></div>;
  return <AdminEditor person={person} teams={teams} people={people} onCancel={() => setOpen(false)} onSave={onSave} />;
}

function commissionRuleLabel(person) {
  if (String(person.role || '').toLowerCase() === 'supervisor') return `${SUPERVISOR_PERSONAL_PERCENTAGE}% sobre vendas próprias`;
  const percentage = Number(person.commission_percentage ?? FIXED_COMMISSION_PERCENTAGE);
  const threshold = Number(person.commission_threshold ?? FIXED_COMMISSION_THRESHOLD);
  return threshold === 0
    ? `${percentage}% sobre o valor integral, desde a 1ª venda`
    : `${percentage}% sobre o excedente de ${formatBRL(threshold)}`;
}

function AdminEditor({ person, teams, people, onCancel, onSave }) {
  const [form, setForm] = useState({ position: person.position || '', employment_type: person.employment_type || 'CLT', team_id: person.team_id || '', supervisor_id: person.supervisor_id || '', hire_date: dateValue(person.hire_date), termination_date: dateValue(person.termination_date), salary: person.salary ?? 0, benefits_amount: person.benefits_amount ?? 0, other_monthly_costs: person.other_monthly_costs ?? 0, employer_charges_percentage: person.employer_charges_percentage ?? 0, thirteenth_salary_enabled: person.thirteenth_salary_enabled !== false, is_active: person.is_active !== false });
  const [saving, setSaving] = useState(false); const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  return <form style={stack} onSubmit={async (event) => { event.preventDefault(); setSaving(true); const payload = { ...form }; for (const field of ['salary', 'benefits_amount', 'other_monthly_costs', 'employer_charges_percentage']) payload[field] = Number(payload[field] || 0); for (const field of ['position', 'team_id', 'supervisor_id', 'hire_date', 'termination_date']) payload[field] = payload[field] || null; try { await onSave(payload); } finally { setSaving(false); } }}><div style={infoBox}>{person.name} · {person.email}. Nome, e-mail, perfil e senha permanecem inalterados.</div><Section title="Vínculo"><div className="form-row"><Field label="Cargo"><input value={form.position} onChange={set('position')} /></Field><Field label="Regime"><select value={form.employment_type} onChange={set('employment_type')}><option>CLT</option><option>PJ</option><option>Estágio</option><option>Autônomo</option><option>Sócio</option></select></Field></div><div className="form-row"><Field label="Equipe"><select value={form.team_id} onChange={set('team_id')}><option value="">Sem equipe</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field><Field label="Supervisor"><select value={form.supervisor_id} onChange={set('supervisor_id')}><option value="">Nenhum</option>{people.filter((item) => item.id !== person.id && ['master', 'admin', 'supervisor'].includes(String(item.role).toLowerCase())).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field></div><div className="form-row"><Field label="Entrada"><input type="date" value={form.hire_date} onChange={set('hire_date')} /></Field><Field label="Desligamento"><input type="date" value={form.termination_date} onChange={set('termination_date')} /></Field></div></Section><Section title="Valores gerais"><div className="form-row"><MoneyField label="Salário base" value={form.salary} onChange={set('salary')} /><Field label="Encargos (%)"><input type="number" min="0" max="100" step="0.01" value={form.employer_charges_percentage} onChange={set('employer_charges_percentage')} /></Field></div><div className="form-row"><MoneyField label="Benefícios agregados (legado)" value={form.benefits_amount} onChange={set('benefits_amount')} /><MoneyField label="Outros custos agregados (legado)" value={form.other_monthly_costs} onChange={set('other_monthly_costs')} /></div><label style={checkStyle}><input type="checkbox" checked={form.thirteenth_salary_enabled} onChange={set('thirteenth_salary_enabled')} /> Provisionar 13º</label></Section><label style={checkStyle}><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Colaborador ativo</label><div className="form-actions"><button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button><button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar administração'}</button></div></form>;
}

const COST_OPTIONS = [['transport', 'Passagem / transporte'], ['meal_voucher', 'Vale-refeição (VR)'], ['food_voucher', 'Vale-alimentação (VA)'], ['health', 'Plano de saúde'], ['phone', 'Telefone / internet'], ['bonus', 'Bônus'], ['benefit', 'Outro benefício'], ['reimbursement', 'Reembolso'], ['equipment', 'Equipamento'], ['tax', 'Imposto / encargo'], ['training', 'Treinamento'], ['other', 'Outro']];
function costLabel(value) { return COST_OPTIONS.find(([key]) => key === value)?.[1] || value; }
function monthLabel(value) { if (!value) return '—'; const [year, month] = value.split('-'); return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1))); }
function firstDayCurrentMonth() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`; }
function dateValue(value) { return value ? String(value).substring(0, 10) : ''; }
function fixedCost(row) { const salary = Number(row.salary || 0); return salary + Number(row.benefits_amount || 0) + Number(row.other_monthly_costs || 0) + salary * Number(row.employer_charges_percentage || 0) / 100 + Number(row.thirteenth_provision || 0) + Number(row.additional_cost_period || 0); }
function roleLabel(value) { return ({ master: 'Master', admin: 'Administrador', supervisor: 'Supervisor', seller: 'Consultor' })[String(value || '').toLowerCase()] || 'Colaborador'; }
function Avatar({ name, large = false }) { const size = large ? 46 : 34; return <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(117,21,24,0.1)', color: '#751518', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flexShrink: 0, fontSize: large ? 18 : 13 }}>{String(name || '?').charAt(0).toUpperCase()}</div>; }
function Status({ active }) { return <span className={`client-status-badge ${active ? 'fechado' : 'negociacao'}`}>{active ? 'Ativo' : 'Inativo'}</span>; }
function Kpi({ label, value, cls = '' }) { return <div className={`kpi-card ${cls}`}><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div></div>; }
function SummaryItem({ label, value }) { return <div style={summaryItem}><span style={muted}>{label}</span><strong style={{ color: '#0f172a' }}>{value}</strong></div>; }
function Field({ label, children }) { return <div className="form-group"><label>{label}</label>{children}</div>; }
function MoneyField({ label, value, onChange }) { return <Field label={label}><input type="number" min="0" step="0.01" value={value} onChange={onChange} /></Field>; }
function Section({ title, children }) { return <fieldset style={fieldsetStyle}><legend style={legendStyle}>{title}</legend>{children}</fieldset>; }
function InlineLoading() { return <div style={{ display: 'grid', placeItems: 'center', minHeight: 360 }}><div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} /></div>; }
function Loading() { return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}><div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} /><p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando colaboradores...</p></div>; }

const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 };
const titleStyle = { fontSize: 20, fontWeight: 750, color: '#0f172a', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#64748b', margin: '3px 0 0' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 };
const cardHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 };
const cardTitle = { fontSize: 15, fontWeight: 700, color: '#1e293b' };
const right = { textAlign: 'right' };
const muted = { color: '#64748b', fontSize: 12 };
const nameLink = { fontWeight: 750, color: '#751518', textDecoration: 'underline', textDecorationColor: 'rgba(117,21,24,.25)', textUnderlineOffset: 3 };
const emptyStyle = { textAlign: 'center', color: '#94a3b8', padding: 28 };
const detailHeader = { padding: '17px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', background: '#fff' };
const tabBar = { display: 'flex', gap: 2, padding: '0 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', overflowX: 'auto' };
const tabButton = { border: 0, background: 'transparent', padding: '12px 14px', fontSize: 13, color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap', borderBottom: '2px solid transparent', fontWeight: 650 };
const activeTabButton = { color: '#751518', borderBottomColor: '#751518', background: 'rgba(117,21,24,.04)' };
const stack = { display: 'flex', flexDirection: 'column', gap: 18 };
const sectionCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16 };
const sectionHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 };
const summaryGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 };
const summaryItem = { display: 'flex', flexDirection: 'column', gap: 5, padding: 13, background: '#f8fafc', borderRadius: 9 };
const editorCard = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 };
const formGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(165px,1fr))', gap: 10 };
const categoryBadge = { display: 'inline-flex', padding: '3px 8px', borderRadius: 999, background: '#f1f5f9', color: '#475569', fontSize: 11, fontWeight: 650 };
const smallButton = { padding: '4px 8px', fontSize: 11 };
const checkStyle = { display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 };
const fieldsetStyle = { border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 14px 4px', margin: 0 };
const legendStyle = { padding: '0 7px', fontSize: 13, fontWeight: 750, color: '#751518' };
const infoBox = { padding: '11px 13px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: 12 };
const successBox = { padding: 13, borderRadius: 9, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: 13, fontWeight: 650 };
const progressCard = { padding: 14, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' };
const progressTrack = { height: 8, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', marginTop: 10 };
const progressFill = { height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#751518,#b4232a)' };
