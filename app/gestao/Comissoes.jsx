'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getRanking, getWorkforceSummary, getCollaboratorCosts, getCollaborators,
  createCollaboratorCost, setMonthlyTransport, updateCollaboratorCost, deleteCollaboratorCost, updateCollaborator,
  getOfficeExpenses, createOfficeExpense, updateOfficeExpense, deleteOfficeExpense,
} from '../lib/managementAPI';
import { formatBRL, formatDate } from '../lib/processConstants';
import PeriodFilter from './components/PeriodFilter';

const now = new Date();
const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };
const FIXED_CATEGORIES = [
  ['rent', 'Aluguel + encargos', 5], ['electricity', 'Energia elétrica', 10],
  ['telecom', 'Telefone / Internet', 15], ['software', 'Sistemas / Softwares', 20],
  ['accounting', 'Contabilidade', 20], ['cleaning', 'Limpeza', 25],
];
const VARIABLE_CATEGORIES = [
  ['office_supplies', 'Material de escritório'], ['marketing', 'Marketing'],
  ['revenue_tax', 'Impostos sobre faturamento'], ['purchases', 'Compras'],
];
const PEOPLE_COST_OPTIONS = [
  ['transport', 'Passagem / transporte'], ['meal_voucher', 'Vale-refeição'],
  ['food_voucher', 'Vale-alimentação'], ['health', 'Plano de saúde'],
  ['phone', 'Telefone / internet'], ['bonus', 'Bônus'], ['benefit', 'Outro benefício'],
  ['reimbursement', 'Reembolso'], ['equipment', 'Equipamento'], ['tax', 'Imposto / encargo'],
  ['training', 'Treinamento'], ['other', 'Outro'],
];
const EXTRA_PEOPLE_COST_OPTIONS = PEOPLE_COST_OPTIONS.filter(([value]) => value !== 'transport');

const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const fixedExpenseRowsForPeriod = (rows, period) => {
  const month = String(period.month).padStart(2, '0');
  const existingCategories = new Set(rows.map((row) => row.category));
  const presets = FIXED_CATEGORIES
    .filter(([category]) => !existingCategories.has(category))
    .map(([category, description, dueDay]) => ({
      id: `preset-${category}`,
      _preset: true,
      expense_type: 'fixed',
      category,
      description,
      competence: `${period.year}-${month}-01`,
      due_date: `${period.year}-${month}-${String(Math.min(dueDay, daysInMonth(period.year, period.month))).padStart(2, '0')}`,
      amount: 0,
      status: 'pending',
    }));
  const order = new Map(FIXED_CATEGORIES.map(([category], index) => [category, index]));
  return [...rows, ...presets].sort((a, b) =>
    (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999)
    || String(a.description).localeCompare(String(b.description), 'pt-BR'));
};

export default function Financeiro() {
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [ranking, setRanking] = useState([]);
  const [summary, setSummary] = useState(null);
  const [costs, setCosts] = useState([]);
  const [officeExpenses, setOfficeExpenses] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const role = String(readUser().role || '').toLowerCase();
  const canManageCosts = role === 'master' || role === 'admin';

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const params = { month: period.month, year: period.year };
      const [rankingData, summaryData, costRows, people, expenseRows] = await Promise.all([
        getRanking(params),
        canManageCosts ? getWorkforceSummary(params) : Promise.resolve(null),
        canManageCosts ? getCollaboratorCosts(params) : Promise.resolve([]),
        canManageCosts ? getCollaborators(params) : Promise.resolve([]),
        canManageCosts ? getOfficeExpenses(params) : Promise.resolve([]),
      ]);
      setRanking(rankingData.ranking || []);
      setSummary(summaryData);
      setCosts(costRows || []);
      setCollaborators(people || []);
      setOfficeExpenses(expenseRows || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [period, canManageCosts]);

  useEffect(() => { load(); }, [load]);

  const savePeopleCost = async (mode, id, body) => {
    if (mode === 'edit') await updateCollaboratorCost(id, body);
    else await createCollaboratorCost(body);
    setModal(null); await load();
  };
  const saveOfficeExpense = async (mode, id, body) => {
    if (mode === 'edit') await updateOfficeExpense(id, body);
    else await createOfficeExpense(body);
    setModal(null); await load();
  };
  const saveCollaborator = async (id, body) => {
    const { transport_amount: transportAmount, ...collaboratorFields } = body;
    await updateCollaborator(id, collaboratorFields);
    await setMonthlyTransport(id, {
      amount: Number(transportAmount),
      competence: `${period.year}-${String(period.month).padStart(2, '0')}-01`,
    });
    setModal(null); await load();
  };
  const removePeopleCost = async (cost) => {
    if (!confirm(`Excluir o custo "${cost.description}"?`)) return;
    try { await deleteCollaboratorCost(cost.id); await load(); } catch (err) { setError(err.message); }
  };
  const removeOfficeExpense = async (expense) => {
    if (!confirm(`Excluir a despesa "${expense.description}"?`)) return;
    try { await deleteOfficeExpense(expense.id); await load(); } catch (err) { setError(err.message); }
  };

  if (loading && ranking.length === 0 && !summary) return <Loading />;
  const totals = summary?.totals || {};
  const totalCommission = ranking.reduce((sum, row) => sum + Number(row.total_commission || 0), 0);
  const totalSales = ranking.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
  const fixedExpenses = officeExpenses.filter((row) => row.expense_type === 'fixed');
  const variableExpenses = officeExpenses.filter((row) => row.expense_type === 'variable');
  const fixedExpenseRows = fixedExpenseRowsForPeriod(fixedExpenses, period);
  const peopleRows = summary?.collaborators || [];
  const peopleColumnTotals = peopleRows.reduce((total, row) => ({
    salary: total.salary + Number(row.salary || 0),
    transport: total.transport + Number(row.transport_costs || 0),
    commissions: total.commissions + Number(row.commission_amount || 0),
    thirteenth: total.thirteenth + Number(row.thirteenth_provision || 0),
    benefits: total.benefits + Number(row.benefits_amount || 0),
    otherMonthly: total.otherMonthly + Number(row.other_monthly_costs || 0),
    charges: total.charges + Number(row.employer_charges || 0),
    extras: total.extras + Math.max(Number(row.additional_costs || 0) - Number(row.transport_costs || 0), 0),
    total: total.total + Number(row.total_cost || 0),
  }), { salary: 0, transport: 0, commissions: 0, thirteenth: 0, benefits: 0, otherMonthly: 0, charges: 0, extras: 0, total: 0 });

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div style={headerStyle}>
      <div><h2 style={titleStyle}>{canManageCosts ? 'Gerência financeira' : 'Comissões'}</h2><p style={subtitleStyle}>{canManageCosts ? 'Receita, pessoas e despesas do escritório por competência' : 'Comissões calculadas no período'}</p></div>
      <div style={headerActions}>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>
    </div>
    {error && <div className="error-message">{error}</div>}

    {canManageCosts ? <>
      <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}>
        <Kpi label="Receita" value={formatBRL(summary?.revenue)} cls="success" />
        <Kpi label="Custo total de pessoas" value={formatBRL(totals.totalPeopleCost)} cls="warning" />
        <Kpi label="Custos fixos" value={formatBRL(summary?.fixed_costs)} />
        <Kpi label="Custos variáveis" value={formatBRL(summary?.variable_costs)} />
        <Kpi label="Custo / receita" value={`${Number(summary?.cost_revenue_ratio || 0).toFixed(1)}%`} cls={Number(summary?.cost_revenue_ratio || 0) > 100 ? 'warning' : 'primary'} />
      </div>

      <OfficeExpenseTable title="Custos fixos do escritório" rows={fixedExpenseRows} onAdd={() => setModal({ type: 'office', mode: 'new', expense: null, expenseType: 'fixed' })} onEdit={(expense) => setModal({ type: 'office', mode: expense._preset ? 'new' : 'edit', expense, expenseType: 'fixed' })} onDelete={removeOfficeExpense} />
      <OfficeExpenseTable title="Custos variáveis" rows={variableExpenses} showCategory categories={VARIABLE_CATEGORIES} onAdd={() => setModal({ type: 'office', mode: 'new', expense: null, expenseType: 'variable' })} onEdit={(expense) => setModal({ type: 'office', mode: 'edit', expense, expenseType: 'variable' })} onDelete={removeOfficeExpense} />

      <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={sectionHeader}><div><span style={cardTitle}>Custo por colaborador</span><div style={muted}>Clique em editar para definir salário, passagem mensal, benefícios, encargos e 13º.</div></div><div style={actions}><span style={muted}>{totals.collaborators || 0} colaborador(es) ativo(s)</span><button className="btn-secondary" style={smallButton} onClick={() => setModal({ type: 'people-cost', mode: 'new', cost: null })}>+ Custo extra</button></div></div>
        <div style={{ overflowX: 'auto' }}><table className="data-table finance-people-table" style={{ border: 'none', borderRadius: 0, minWidth: 1080 }}>
          <thead><tr><th>Colaborador</th><th style={right}>Salário</th><th style={right}>Passagem</th><th style={right}>Comissões</th><th style={right}>13º</th><th style={right}>Benefícios</th><th style={right}>Outros fixos</th><th style={right}>Encargos</th><th style={right}>Extras</th><th style={right}>Total</th><th /></tr></thead>
          <tbody>{(summary?.collaborators || []).map((row) => <tr key={row.id}>
            <td><strong>{row.name}</strong><div style={muted}>{row.team_name || row.position || 'Sem equipe'}</div></td>
            <td style={right}>{formatBRL(row.salary)}</td><td style={right}>{formatBRL(row.transport_costs)}</td><td style={right}>{formatBRL(row.commission_amount)}</td><td style={right}>{formatBRL(row.thirteenth_provision)}</td><td style={right}>{formatBRL(row.benefits_amount)}</td><td style={right}>{formatBRL(row.other_monthly_costs)}</td><td style={right}>{formatBRL(row.employer_charges)}</td><td style={right}>{formatBRL(Math.max(Number(row.additional_costs || 0) - Number(row.transport_costs || 0), 0))}</td><td style={{ ...right, fontWeight: 800 }}>{formatBRL(row.total_cost)}</td>
            <td><button className="btn-secondary" style={smallButton} onClick={() => setModal({ type: 'collaborator', person: row })}>Editar custos</button></td>
          </tr>)}{peopleRows.length === 0 && <tr><td colSpan={11} style={emptyStyle}>Nenhum colaborador ativo.</td></tr>}</tbody>
          {peopleRows.length > 0 && <tfoot><tr className="finance-total-row"><td><strong>Total geral</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.salary)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.transport)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.commissions)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.thirteenth)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.benefits)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.otherMonthly)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.charges)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.extras)}</strong></td><td style={right}><strong>{formatBRL(peopleColumnTotals.total)}</strong></td><td /></tr></tfoot>}
        </table></div>
      </div>

      <details style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <summary style={{ ...sectionHeader, cursor: 'pointer', listStyle: 'none' }}><span style={cardTitle}>Gerenciar passagens e custos extras</span><span style={muted}>{costs.length} lançamento(s)</span></summary>
        <div style={{ overflowX: 'auto', borderTop: '1px solid #f1f5f9' }}><table className="data-table" style={{ border: 'none', borderRadius: 0 }}>
          <thead><tr><th>Competência</th><th>Colaborador</th><th>Categoria</th><th>Descrição</th><th style={right}>Valor</th><th /></tr></thead>
          <tbody>{costs.map((cost) => <tr key={cost.id}><td>{formatDate(cost.competence)}</td><td><strong>{cost.collaborator_name}</strong></td><td><span style={categoryBadge}>{peopleCostLabel(cost.category)}</span></td><td>{cost.description}</td><td style={{ ...right, fontWeight: 750 }}>{formatBRL(cost.amount)}</td><td><div style={actions}><button className="btn-secondary" style={smallButton} onClick={() => setModal({ type: 'people-cost', mode: 'edit', cost })}>Editar</button><button className="btn-secondary" style={{ ...smallButton, color: '#b91c1c' }} onClick={() => removePeopleCost(cost)}>Excluir</button></div></td></tr>)}{costs.length === 0 && <tr><td colSpan={6} style={emptyStyle}>Nenhum custo de pessoa lançado nesta competência.</td></tr>}</tbody>
        </table></div>
      </details>
    </> : <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}><Kpi label="Comissão total" value={formatBRL(totalCommission)} cls="success" /><Kpi label="Vendido no período" value={formatBRL(totalSales)} /><Kpi label="Vendedores com venda" value={ranking.length} cls="primary" /></div>}

    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={sectionHeader}><span style={cardTitle}>Comissões por vendedor</span></div>
      <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ border: 'none', borderRadius: 0 }}><thead><tr><th>Vendedor</th><th>Equipe</th><th style={right}>Vendas</th><th style={right}>Valor vendido</th><th style={right}>% comissão</th><th style={right}>Comissão</th></tr></thead><tbody>{ranking.map((row) => <tr key={row.seller_id}><td><strong>{row.seller_name}</strong></td><td style={muted}>{row.team_name || '—'}</td><td style={right}>{row.sales_count}</td><td style={{ ...right, fontWeight: 700 }}>{formatBRL(row.total_amount)}</td><td style={right}>{Number(row.commission_percentage || 0)}%</td><td style={{ ...right, color: '#15803d', fontWeight: 750 }}>{formatBRL(row.total_commission)}</td></tr>)}{ranking.length === 0 && <tr><td colSpan={6} style={emptyStyle}>Sem comissões no período.</td></tr>}</tbody></table></div>
    </div>

    {modal?.type === 'people-cost' && <PeopleCostModal mode={modal.mode} cost={modal.cost} collaborators={collaborators.filter((item) => item.is_active !== false)} period={period} onClose={() => setModal(null)} onSave={savePeopleCost} />}
    {modal?.type === 'office' && <OfficeExpenseModal mode={modal.mode} expense={modal.expense} expenseType={modal.expenseType} period={period} onClose={() => setModal(null)} onSave={saveOfficeExpense} />}
    {modal?.type === 'collaborator' && <CollaboratorCostModal person={modal.person} period={period} onClose={() => setModal(null)} onSave={saveCollaborator} />}
  </div>;
}

function OfficeExpenseTable({ title, rows, categories = [], showCategory = false, onAdd, onEdit, onDelete }) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return <div style={{ ...card, padding: 0, overflow: 'hidden' }}><div style={sectionHeader}><span style={cardTitle}>{title}</span><div style={actions}><strong>{formatBRL(total)}</strong><button className="btn-primary" style={smallButton} onClick={onAdd}>+ Adicionar</button></div></div><div style={{ overflowX: 'auto' }}><table className="data-table" style={{ border: 'none', borderRadius: 0 }}><thead><tr><th>Despesa</th>{showCategory && <th>Categoria</th>}<th>Vencimento</th><th style={right}>Valor</th><th>Status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id} style={row._preset ? { background: '#fbfdff' } : undefined}><td><strong>{row.description}</strong>{row._preset && <div style={muted}>Aguardando preenchimento</div>}</td>{showCategory && <td>{categoryLabel(row.category, categories)}</td>}<td>{formatDate(row.due_date)}</td><td style={{ ...right, fontWeight: 750 }}>{formatBRL(row.amount)}</td><td><span style={row.status === 'paid' ? paidBadge : pendingBadge}><i style={row.status === 'paid' ? paidDot : pendingDot} />{row.status === 'paid' ? 'Pago' : 'Pendente'}</span></td><td><div style={actions}><button className="btn-secondary" style={smallButton} onClick={() => onEdit(row)}>Editar</button>{!row._preset && <button className="btn-secondary" style={{ ...smallButton, color: '#b91c1c' }} onClick={() => onDelete(row)}>Excluir</button>}</div></td></tr>)}{rows.length === 0 && <tr><td colSpan={showCategory ? 6 : 5} style={emptyStyle}>Nenhuma despesa lançada nesta competência.</td></tr>}</tbody></table></div></div>;
}

function CollaboratorCostModal({ person, period, onClose, onSave }) {
  const [form, setForm] = useState({ salary: person.salary ?? 0, transport_amount: person.transport_costs ?? 0, benefits_amount: person.benefits_amount ?? 0, other_monthly_costs: person.other_monthly_costs ?? 0, employer_charges_percentage: person.employer_charges_percentage ?? 0, thirteenth_salary_enabled: person.thirteenth_salary_enabled !== false });
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  return <Modal title={`Editar custos · ${person.name}`} onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(''); try { await onSave(person.id, { ...form, salary: Number(form.salary || 0), transport_amount: Number(form.transport_amount || 0), benefits_amount: Number(form.benefits_amount || 0), other_monthly_costs: Number(form.other_monthly_costs || 0), employer_charges_percentage: Number(form.employer_charges_percentage || 0) }); } catch (err) { setError(err.message); setSaving(false); } }}>{error && <div className="error-message">{error}</div>}<div style={infoBox}>O campo de passagem representa o total de {String(period.month).padStart(2, '0')}/{period.year}. Ao salvar, o valor anterior é substituído — não é somado novamente.</div><div className="form-row"><MoneyField label="Salário" value={form.salary} onChange={set('salary')} /><Field label="Encargos (%)"><input type="number" min="0" max="100" step="0.01" value={form.employer_charges_percentage} onChange={set('employer_charges_percentage')} /></Field></div><div className="form-row"><MoneyField label="Passagem do mês" value={form.transport_amount} onChange={set('transport_amount')} required={false} /><MoneyField label="Benefícios" value={form.benefits_amount} onChange={set('benefits_amount')} /></div><MoneyField label="Outros custos fixos" value={form.other_monthly_costs} onChange={set('other_monthly_costs')} /><label style={checkStyle}><input type="checkbox" checked={form.thirteenth_salary_enabled} onChange={set('thirteenth_salary_enabled')} /> Provisionar 13º salário</label><FormActions onClose={onClose} saving={saving} /></form></Modal>;
}

function OfficeExpenseModal({ mode, expense, expenseType, period, onClose, onSave }) {
  const month = String(period.month).padStart(2, '0');
  const defaultCategory = expenseType === 'fixed' ? 'fixed_other' : VARIABLE_CATEGORIES[0][0];
  const lockedDescription = expense?._preset === true || FIXED_CATEGORIES.some(([category]) => category === expense?.category);
  const [form, setForm] = useState({ category: expense?.category || defaultCategory, description: expense?.description || '', competence: expense?.competence ? String(expense.competence).substring(0, 10) : `${period.year}-${month}-01`, due_date: expense?.due_date ? String(expense.due_date).substring(0, 10) : `${period.year}-${month}-05`, amount: expense?._preset ? '' : (expense?.amount ?? ''), status: expense?.status || 'pending' });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  return <Modal title={`${mode === 'edit' ? 'Editar' : 'Nova'} despesa ${expenseType === 'fixed' ? 'fixa' : 'variável'}`} onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(''); try { await onSave(mode, expense?._preset ? null : expense?.id, { ...form, amount: Number(form.amount) }); } catch (err) { setError(err.message); setSaving(false); } }}>{error && <div className="error-message">{error}</div>}{expenseType === 'variable' && <div className="form-group"><label>Categoria *</label><select value={form.category} onChange={set('category')}>{VARIABLE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>}<div className="form-group"><label>Despesa *</label><input value={form.description} onChange={set('description')} maxLength={180} placeholder={expenseType === 'fixed' ? 'Ex.: Seguro do escritório' : 'Ex.: Campanha de marketing'} readOnly={lockedDescription} required /></div><div className="form-row"><Field label="Competência *"><input type="date" value={form.competence} onChange={set('competence')} required /></Field><Field label="Vencimento *"><input type="date" value={form.due_date} onChange={set('due_date')} required /></Field></div><div className="form-row"><MoneyField label="Valor *" value={form.amount} onChange={set('amount')} /><Field label="Status *"><select value={form.status} onChange={set('status')}><option value="pending">Pendente</option><option value="paid">Pago</option></select></Field></div><FormActions onClose={onClose} saving={saving} /></form></Modal>;
}

function PeopleCostModal({ mode, cost, collaborators, period, onClose, onSave }) {
  const options = mode === 'edit' ? PEOPLE_COST_OPTIONS : EXTRA_PEOPLE_COST_OPTIONS;
  const [form, setForm] = useState({ collaborator_id: cost?.collaborator_id || '', category: cost?.category || 'meal_voucher', description: cost?.description || '', amount: cost?.amount ?? '', competence: cost?.competence ? String(cost.competence).substring(0, 10) : `${period.year}-${String(period.month).padStart(2, '0')}-01` });
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  return <Modal title={mode === 'edit' ? 'Editar custo de pessoa' : 'Novo custo extra'} onClose={onClose}><form className="modal-form" onSubmit={async (event) => { event.preventDefault(); setSaving(true); setError(''); try { await onSave(mode, cost?.id, { ...form, amount: Number(form.amount) }); } catch (err) { setError(err.message); setSaving(false); } }}>{error && <div className="error-message">{error}</div>}<div className="form-group"><label>Colaborador *</label><select value={form.collaborator_id} onChange={set('collaborator_id')} required><option value="">Selecione</option>{collaborators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="form-row"><Field label="Categoria *"><select value={form.category} onChange={set('category')}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Competência *"><input type="date" value={form.competence} onChange={set('competence')} required /></Field></div><div className="form-group"><label>Descrição *</label><input value={form.description} onChange={set('description')} required maxLength={180} placeholder="Ex.: reembolso de atendimento" /></div><MoneyField label="Valor *" value={form.amount} onChange={set('amount')} /><FormActions onClose={onClose} saving={saving} /></form></Modal>;
}

function Modal({ title, onClose, children }) { return <div className="modal-overlay" onClick={onClose}><div className="modal-content" style={{ maxWidth: 590 }} onClick={(event) => event.stopPropagation()}><div className="modal-header"><h2 style={{ fontSize: 18, fontWeight: 750 }}>{title}</h2><button className="btn-close" onClick={onClose}>×</button></div>{children}</div></div>; }
function FormActions({ onClose, saving }) { return <div className="form-actions"><button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</button></div>; }
function Kpi({ label, value, cls = '' }) { return <div className={`kpi-card ${cls}`}><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div></div>; }
function Field({ label, children }) { return <div className="form-group" style={{ flex: 1 }}><label>{label}</label>{children}</div>; }
function MoneyField({ label, value, onChange, required = true }) { return <Field label={label}><input type="number" min="0" step="0.01" value={value} onChange={onChange} required={required} /></Field>; }
function categoryLabel(value, options) { return options.find(([key]) => key === value)?.[1] || value; }
function peopleCostLabel(value) { return PEOPLE_COST_OPTIONS.find(([key]) => key === value)?.[1] || value; }
function Loading() { return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}><div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} /><p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando financeiro...</p></div>; }

const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 };
const headerActions = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const titleStyle = { fontSize: 20, fontWeight: 750, color: '#0f172a', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#64748b', margin: '3px 0 0' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 };
const sectionHeader = { padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid #f1f5f9' };
const cardTitle = { fontSize: 15, fontWeight: 700, color: '#1e293b' };
const right = { textAlign: 'right' };
const muted = { color: '#64748b', fontSize: 12 };
const emptyStyle = { textAlign: 'center', color: '#94a3b8', padding: 26 };
const smallButton = { padding: '4px 8px', fontSize: 11 };
const actions = { display: 'flex', gap: 6, justifyContent: 'flex-end' };
const categoryBadge = { display: 'inline-flex', padding: '3px 8px', borderRadius: 999, background: '#f1f5f9', fontSize: 11, color: '#475569', fontWeight: 650 };
const paidBadge = { display: 'inline-flex', alignItems: 'center', gap: 7, color: '#166534', fontWeight: 650 };
const pendingBadge = { display: 'inline-flex', alignItems: 'center', gap: 7, color: '#b91c1c', fontWeight: 650 };
const paidDot = { width: 10, height: 10, borderRadius: '50%', background: '#34d399' };
const pendingDot = { width: 10, height: 10, borderRadius: '50%', background: '#f43f5e' };
const infoBox = { padding: '11px 13px', borderRadius: 9, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', fontSize: 12 };
const checkStyle = { display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 };
