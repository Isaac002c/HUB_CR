'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSales, getSalesResponsibles, getInstallmentFollowUps, updateInstallmentSchedule, createSale, updateSale, deleteSale, getManagementTargets, exportSalesWorkbook } from '../lib/managementAPI';
import { formatBRL, formatDate } from '../lib/processConstants';
import { FIXED_COMMISSION_PERCENTAGE, FIXED_COMMISSION_THRESHOLD, SUPERVISOR_PERSONAL_PERCENTAGE } from '../lib/commissionPolicy';
import PeriodFilter from './components/PeriodFilter';

const now = new Date();
const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

const PAYMENT_METHODS = [
  ['a_vista', 'À vista'], ['pix', 'PIX'], ['cartao_credito', 'Cartão de crédito'],
  ['cartao_debito', 'Cartão de débito'], ['boleto', 'Boleto'], ['dinheiro', 'Dinheiro'],
  ['transferencia', 'Transferência'], ['outro', 'Outro'],
];
const CLOSING_METHODS = [['presencial', 'Presencial'], ['remoto', 'Remoto'], ['outro', 'Outro']];
const INSTALLMENT_FREQUENCIES = [['weekly', 'Semanal'], ['monthly', 'Mensal'], ['manual', 'Definir manualmente']];
const SERVICE_SUGGESTIONS = ['Suspensão', 'Multa', 'Cassação', 'CRCI', 'Frota', 'Multa mandatória', 'Outro'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function Vendas() {
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [sales, setSales] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [responsibles, setResponsibles] = useState([]);
  const [installmentFollowUps, setInstallmentFollowUps] = useState([]);
  const [targets, setTargets] = useState({ company_target: null, team_targets: [], user_targets: [] });
  const [selectedSeller, setSelectedSeller] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [scheduleModal, setScheduleModal] = useState(null);
  const [search, setSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [closingFilter, setClosingFilter] = useState('all');
  const [exporting, setExporting] = useState(false);

  const user = readUser();
  const role = String(user.role || '').toLowerCase();
  const isConsultor = role === 'seller';
  const isSupervisor = role === 'supervisor';
  const showCommissionTotal = role === 'master';

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const params = { month: period.month, year: period.year };
      const [saleRows, responsibleRows, targetSummary, followUpRows] = await Promise.all([
        getSales({ ...params, limit: 500 }),
        getSalesResponsibles(),
        getManagementTargets(params).catch(() => ({ company_target: null, team_targets: [], user_targets: [] })),
        getInstallmentFollowUps(params).catch(() => []),
      ]);
      const targetByUser = new Map((targetSummary?.user_targets || []).map((item) => [item.user_id, item]));
      const consultants = (responsibleRows || []).map((item) => ({
        ...item,
        id: item.seller_id,
        monthly_sales_target: Number(targetByUser.get(item.seller_id)?.amount || 0),
      }));
      setSales(saleRows || []);
      setSellers(consultants);
      setResponsibles(responsibleRows || []);
      setInstallmentFollowUps(followUpRows || []);
      setTargets(targetSummary || { company_target: null, team_targets: [], user_targets: [] });
      if (isConsultor && user.id) setSelectedSeller(user.id);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [period, isConsultor, user.id]);

  useEffect(() => { load(); }, [load]);

  const submit = async (form) => {
    try {
      if (modal.sale) await updateSale(modal.sale.id, form);
      else await createSale(form);
      setModal(null); await load();
      return true;
    } catch (err) { alert(err.message); return false; }
  };

  const submitSchedule = async (form) => {
    try {
      await updateInstallmentSchedule(scheduleModal.installment_plan_id, form);
      setScheduleModal(null); await load();
      return true;
    } catch (err) { alert(err.message); return false; }
  };

  const remove = async (sale) => {
    if (!confirm(`Excluir a venda de ${sale.customer_display_name || sale.customer_name || 'cliente não informado'}?`)) return;
    try { await deleteSale(sale.id); await load(); } catch (err) { alert(err.message); }
  };

  const exportWorkbook = async () => {
    try {
      setExporting(true);
      await exportSalesWorkbook({ month: period.month, year: period.year });
    } catch (err) { alert(err.message); }
    finally { setExporting(false); }
  };

  const selectedSales = selectedSeller === 'all' ? sales : sales.filter((sale) => sale.seller_id === selectedSeller);
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleSales = selectedSales.filter((sale) => {
    const matchesSearch = !normalizedSearch || [
      sale.customer_display_name, sale.customer_name, sale.service_display_name,
      sale.service_name, sale.description, sale.seller_name,
    ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedSearch));
    const matchesPayment = paymentFilter === 'all' || sale.payment_method === paymentFilter;
    const matchesClosing = closingFilter === 'all' || sale.closing_method === closingFilter;
    return matchesSearch && matchesPayment && matchesClosing;
  });
  const selectedConsultant = sellers.find((seller) => seller.id === selectedSeller) || null;
  const generalTeamTarget = (targets.team_targets || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const generalCompanyTarget = targets.company_target?.configured ? Number(targets.company_target.amount || 0) : 0;
  const generalTarget = (role === 'master' || role === 'admin') ? generalCompanyTarget : generalTeamTarget;
  const revenueSales = selectedSales.filter(isRevenueSale);
  const filteredRevenueSales = visibleSales.filter(isRevenueSale);
  const total = revenueSales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
  const totalCommission = revenueSales.reduce((sum, sale) => sum + Number(sale.commission_amount || 0), 0);
  const filteredTotal = filteredRevenueSales.reduce((sum, sale) => sum + Number(sale.amount || 0), 0);
  const filteredCommission = filteredRevenueSales.reduce((sum, sale) => sum + Number(sale.commission_amount || 0), 0);
  const target = selectedConsultant
    ? Number(selectedConsultant.monthly_sales_target || 0)
    : generalTarget;
  const remaining = Math.max(target - total, 0);
  const progress = target > 0 ? (total / target) * 100 : 0;
  const isGeneral = selectedSeller === 'all';
  const visibleFollowUps = selectedSeller === 'all'
    ? installmentFollowUps
    : installmentFollowUps.filter((item) => item.seller_id === selectedSeller);

  if (loading && sales.length === 0) return <Loading />;

  return (
    <div style={pageStack}>
      <div style={headerStyle}>
        <div>
          <h2 style={titleStyle}>Quadro mensal de vendas</h2>
          <p style={subtitleStyle}>Visão geral do mês e controle automático por consultor</p>
        </div>
        <div style={headerActions}>
          <PeriodFilter value={period} onChange={setPeriod} />
          <button className="btn-secondary sales-export-button" onClick={exportWorkbook} disabled={exporting}>
            {exporting ? 'Gerando Excel...' : '⇩ Exportar Excel'}
          </button>
          <button className="btn-primary" onClick={() => setModal({ sale: null })}>+ Lançar venda</button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <section className="sales-command-center">
        <div className="sales-command-primary">
          <span className="sales-eyebrow">{isGeneral ? 'Faturamento geral' : selectedConsultant?.name}</span>
          <strong>{formatBRL(total)}</strong>
          <span>{revenueSales.length} venda(s) confirmada(s) em {MONTHS[period.month - 1]} de {period.year}</span>
        </div>
        <div className="sales-command-progress">
          <div>
            <span>Progresso da meta</span>
            <strong>{progress.toFixed(0)}%</strong>
          </div>
          <div className="sales-command-track"><div style={{ width: `${Math.min(progress, 100)}%` }} /></div>
          <small>{target > 0 ? `${formatBRL(total)} de ${formatBRL(target)}` : 'Meta do período ainda não definida'}</small>
        </div>
        <MetricCard label="Falta para a meta" value={target > 0 ? formatBRL(remaining) : 'Não definida'} tone={target > 0 && remaining === 0 ? 'success' : 'warning'} />
        {showCommissionTotal && <MetricCard label="Comissão gerada" value={formatBRL(totalCommission)} tone="commission" />}
      </section>

      <section style={followUpCard}>
        <div style={followUpHeader}>
          <div><strong>Cobranças programadas · {MONTHS[period.month - 1]} de {period.year}</strong><div style={muted}>Parcelas da competência selecionada e pendências vencidas de meses anteriores. Ajustes não alteram o faturamento.</div></div>
          <span style={followUpCount}>{visibleFollowUps.length} pendência(s)</span>
        </div>
        {visibleFollowUps.length > 0 ? <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ border: 0, borderRadius: 0, minWidth: 1120 }}>
          <thead><tr><th>Vencimento</th><th>Cliente</th><th>Serviço</th><th className="sales-value-cell">Valor previsto</th><th>Parcela</th><th>Periodicidade</th><th>Responsável</th><th>Status</th><th /></tr></thead>
          <tbody>{visibleFollowUps.map((item) => <tr key={`${item.installment_plan_id}:${item.next_installment_number}`}>
            <td><strong>{formatDate(item.next_installment_due_date)}</strong></td>
            <td><strong>{item.customer_name || '—'}</strong></td>
            <td>{item.service_name || item.description || '—'}</td>
            <td className="sales-value-cell"><strong>{formatBRL(item.pending_amount)}</strong></td>
            <td>{item.next_installment_number}/{item.installment_total}</td>
            <td>{installmentFrequencyLabel(item.installment_frequency)}</td>
            <td>{item.seller_name || '—'}</td>
            <td><span style={followUpStatusStyle(item.follow_up_status)}>{followUpStatusLabel(item.follow_up_status)}</span></td>
            <td><div style={followUpActions}>
              <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => setScheduleModal(item)}>✎ Ajustar</button>
              {item.is_next_installment
                ? <button className="btn-secondary" style={{ whiteSpace: 'nowrap' }} onClick={() => setModal({ sale: null, nextFrom: item })}>✓ Confirmar pagamento</button>
                : <span style={{ ...muted, whiteSpace: 'nowrap' }}>Aguardar anterior</span>}
            </div></td>
          </tr>)}</tbody>
        </table></div> : <div style={followUpEmpty}>Nenhuma cobrança pendente para esta competência.</div>}
      </section>

      <section className="sales-management-card">
        <div className="sales-management-header">
          <div>
            <strong>{isGeneral ? 'Lançamentos do mês' : `Vendas de ${selectedConsultant?.name || 'consultor'}`}</strong>
            <span>{visibleSales.length} de {selectedSales.length} registro(s) exibidos</span>
          </div>
          {sales.length >= 500 && <span style={warningBadge}>Mostrando os 500 mais recentes</span>}
        </div>

        <div className="sales-filter-bar">
          <label className="sales-search-field">
            <span>⌕</span>
            <input aria-label="Buscar vendas" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar cliente, serviço ou consultor..." />
          </label>
          {!isConsultor && <select aria-label="Filtrar consultor" value={selectedSeller} onChange={(event) => setSelectedSeller(event.target.value)}>
            <option value="all">Todos os consultores</option>
            {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
          </select>}
          <select aria-label="Filtrar forma de pagamento" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            <option value="all">Todos os pagamentos</option>
            {PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="Filtrar forma de fechamento" value={closingFilter} onChange={(event) => setClosingFilter(event.target.value)}>
            <option value="all">Todos os fechamentos</option>
            {CLOSING_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {(search || paymentFilter !== 'all' || closingFilter !== 'all') && <button className="sales-clear-filters" onClick={() => { setSearch(''); setPaymentFilter('all'); setClosingFilter('all'); }}>Limpar filtros</button>}
        </div>

        <div className="sales-modern-table-wrap">
          <table className="data-table sales-modern-table">
            {isGeneral ? <colgroup>
              <col style={{ width: '8%' }} /><col style={{ width: '15%' }} /><col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '6%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '10%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '9%' }} /><col style={{ width: '5%' }} />
            </colgroup> : <colgroup>
              <col style={{ width: '9%' }} /><col style={{ width: '18%' }} /><col style={{ width: '13%' }} />
              <col style={{ width: '11%' }} /><col style={{ width: '7%' }} /><col style={{ width: '9%' }} />
              <col style={{ width: '10%' }} /><col style={{ width: '11%' }} /><col style={{ width: '8%' }} />
              <col style={{ width: '4%' }} />
            </colgroup>}
            <thead><tr>
              <th>Data</th><th>Cliente</th><th>Serviço</th><th className="sales-value-cell">Valor pago</th>
              <th>Parcela</th><th>Percentual</th><th className="sales-value-cell">Comissão</th>
              <th>Pagamento</th><th>Fechamento</th>{isGeneral && <th>Consultor</th>}<th style={{ width: 86 }} />
            </tr></thead>
            <tbody>
              {visibleSales.map((sale) => <tr key={sale.id}>
                <td style={{ whiteSpace: 'nowrap' }}><strong>{formatDate(sale.closed_at)}</strong><div style={muted}>{statusLabel(sale.status)}</div></td>
                <td><strong>{sale.customer_display_name || sale.customer_name || '—'}</strong></td>
                <td><span className="sales-service-pill">{sale.service_display_name || sale.service_name || sale.description || '—'}</span></td>
                <td className="sales-value-cell" style={{ fontWeight: 750 }}>{formatBRL(sale.amount)}</td>
                <td>{installmentLabel(sale)}</td>
                <td style={{ color: '#64748b' }}>{Number(sale.commission_percentage || 0)}%</td>
                <td className="sales-value-cell" style={{ color: '#15803d', fontWeight: 750 }} title={`Base comissionável: ${formatBRL(sale.commissionable_amount || 0)}`}>{formatBRL(sale.commission_amount)}</td>
                <td><span className="sales-method-badge">{paymentLabel(sale.payment_method)}</span></td>
                <td>{closingLabel(sale.closing_method)}</td>
                {isGeneral && <td style={{ fontWeight: 650 }}>{sale.seller_name || '—'}</td>}
                <td><div className="actions-cell">
                  <button className="btn-icon" title="Editar" onClick={() => setModal({ sale })}>✎</button>
                  {(role === 'master' || role === 'admin' || role === 'supervisor') && <button className="btn-icon danger" title="Excluir" onClick={() => remove(sale)}>×</button>}
                </div></td>
              </tr>)}
              {visibleSales.length === 0 && <tr><td colSpan={isGeneral ? 11 : 10} className="sales-empty-state"><strong>Nenhuma venda encontrada</strong><span>Ajuste os filtros ou lance uma nova venda para este período.</span></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="sales-table-summary">
          <span>Resultado dos filtros atuais</span>
          <div><small>Valor</small><strong>{formatBRL(filteredTotal)}</strong></div>
          {showCommissionTotal && <div><small>Comissão</small><strong className="success-text">{formatBRL(filteredCommission)}</strong></div>}
        </div>
      </section>

      {modal && <SaleModal
        sale={modal.sale}
        nextFrom={modal.nextFrom}
        responsibles={responsibles}
        defaultSellerId={selectedConsultant?.id || ((isConsultor || isSupervisor) ? user.id : '')}
        lockSeller={isConsultor}
        onClose={() => setModal(null)}
        onSubmit={submit}
      />}
      {scheduleModal && <InstallmentScheduleModal
        installment={scheduleModal}
        onClose={() => setScheduleModal(null)}
        onSubmit={submitSchedule}
      />}
    </div>
  );
}

function SaleModal({ sale, nextFrom, responsibles, defaultSellerId, lockSeller, onClose, onSubmit }) {
  const source = sale || nextFrom;
  const nextNumber = nextFrom ? Number(nextFrom.next_installment_number) : null;
  const initialInstallment = Boolean(source?.installment_total);
  const initialResponsible = source
    ? responsibles.find((item) => item.seller_id === source.seller_id && item.name === source.seller_name)
      || responsibles.find((item) => item.seller_id === source.seller_id)
    : responsibles.find((item) => item.seller_id === defaultSellerId);
  const [hasInstallment, setHasInstallment] = useState(initialInstallment);
  const [submitting, setSubmitting] = useState(false);
  const initialFrequency = source?.installment_frequency || 'monthly';
  const [form, setForm] = useState({
    responsible_key: initialResponsible?.option_key || '',
    closed_at: nextFrom ? localIsoDate() : (sale?.closed_at ? String(sale.closed_at).substring(0, 10) : localIsoDate()),
    customer_name: source?.customer_display_name || source?.customer_name || source?.client_name || source?.company_name || '',
    service_name: source?.service_display_name || source?.service_name || source?.description || '',
    amount: source?.pending_amount ?? source?.amount ?? '',
    installment_number: nextNumber ?? source?.installment_number ?? 1,
    installment_total: source?.installment_total ?? 2,
    installment_frequency: initialFrequency,
    next_installment_due_date: nextFrom
      ? nextDateAfter(nextFrom.next_installment_due_date, initialFrequency)
      : (sale?.next_installment_due_date ? String(sale.next_installment_due_date).substring(0, 10) : nextDateAfter(localIsoDate(), initialFrequency)),
    is_settlement: Boolean(sale?.is_settlement) || Boolean(nextFrom && nextNumber >= Number(nextFrom.installment_total)),
    payment_method: source?.payment_method || 'a_vista',
    closing_method: source?.closing_method || 'remoto',
    status: sale?.status || 'confirmed',
  });
  const [futureSchedule, setFutureSchedule] = useState(() => createFutureSchedule(
    source?.installment_total ?? 2,
    source?.next_installment_due_date || nextDateAfter(localIsoDate(), initialFrequency),
    initialFrequency,
  ));
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));
  const setInstallmentTotal = (event) => {
    const total = Number(event.target.value);
    setForm((previous) => ({ ...previous, installment_total: event.target.value }));
    setFutureSchedule((previous) => createFutureSchedule(
      total, nextDateAfter(form.closed_at, form.installment_frequency), form.installment_frequency, previous,
    ));
  };
  const setScheduleField = (installmentNumber, key) => (event) => {
    const value = event.target.value;
    setFutureSchedule((previous) => previous.map((item) => item.installment_number === installmentNumber
      ? { ...item, [key]: value }
      : item));
  };
  const setFrequency = (event) => {
    const frequency = event.target.value;
    const firstDue = nextDateAfter(form.closed_at, frequency);
    setForm((previous) => ({
      ...previous,
      installment_frequency: frequency,
      next_installment_due_date: frequency === 'manual'
        ? ''
        : firstDue,
    }));
    setFutureSchedule((previous) => createFutureSchedule(
      form.installment_total, firstDue, frequency, previous.map((item) => ({ ...item, due_date: '' })),
    ));
  };
  const consultant = responsibles.find((item) => item.option_key === form.responsible_key);
  const finalInstallment = hasInstallment && Number(form.installment_number) >= Number(form.installment_total);
  const settled = finalInstallment || form.is_settlement === true;

  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" style={{ maxWidth: 760 }} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div><h2 style={{ fontSize: 19, fontWeight: 750, margin: 0 }}>{sale ? 'Editar venda' : nextFrom ? 'Confirmar pagamento da parcela' : 'Lançar venda do dia'}</h2><div style={muted}>{nextFrom ? 'A cobrança programada ainda não faz parte do faturamento.' : 'Cada valor pago entra uma única vez na receita e no histórico do parcelamento.'}</div></div>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>
      <form className="modal-form" onSubmit={async (event) => {
        event.preventDefault();
        if (submitting) return;
        if (!consultant) return alert('Selecione o responsável pela venda.');
        if (!form.customer_name.trim()) return alert('Informe o nome do cliente.');
        if (!form.service_name.trim()) return alert('Informe o serviço.');
        if (!form.amount || Number(form.amount) <= 0) return alert('Informe um valor pago válido.');
        if (hasInstallment && Number(form.installment_number) > Number(form.installment_total)) return alert('A parcela atual não pode ser maior que o total de parcelas.');
        const shouldCreateSchedule = !sale && !nextFrom && hasInstallment && !settled;
        if (shouldCreateSchedule && futureSchedule.some((item) => !item.due_date || !item.expected_amount || Number(item.expected_amount) <= 0)) {
          return alert('Informe o vencimento e o valor previsto de cada parcela futura.');
        }
        setSubmitting(true);
        const succeeded = await onSubmit({
          seller_id: consultant.seller_id,
          seller_display_name: consultant.name,
          closed_at: form.closed_at,
          customer_name: form.customer_name.trim(),
          service_name: form.service_name.trim(),
          description: form.service_name.trim(),
          amount: Number(form.amount),
          installment_number: hasInstallment ? Number(form.installment_number) : null,
          installment_total: hasInstallment ? Number(form.installment_total) : null,
          installment_plan_id: hasInstallment ? source?.installment_plan_id || null : null,
          installment_frequency: hasInstallment ? form.installment_frequency : null,
          next_installment_due_date: hasInstallment && !settled ? form.next_installment_due_date : null,
          ...(shouldCreateSchedule ? { installment_schedule: futureSchedule.map((item) => ({
            installment_number: item.installment_number,
            due_date: item.due_date,
            expected_amount: Number(item.expected_amount),
          })) } : {}),
          is_settlement: hasInstallment ? settled : false,
          payment_method: form.payment_method,
          closing_method: form.closing_method,
          status: form.status,
        });
        if (!succeeded) setSubmitting(false);
      }}>
        <div className="form-row">
          <Field label="Responsável pela venda *"><select value={form.responsible_key} onChange={set('responsible_key')} disabled={lockSeller || Boolean(nextFrom)} required><option value="">Selecione...</option>{responsibles.map((item) => <option key={item.option_key} value={item.option_key}>{item.name}</option>)}</select></Field>
          <Field label={`${nextFrom ? 'Data do recebimento' : 'Data do fechamento'} *`}><input type="date" value={form.closed_at} onChange={set('closed_at')} required /></Field>
        </div>
        <div className="form-row">
          <Field label="Nome do cliente *"><input value={form.customer_name} onChange={set('customer_name')} maxLength={180} placeholder="Nome completo / razão social" required /></Field>
          <Field label="Serviço *"><input value={form.service_name} onChange={set('service_name')} list="sale-services" maxLength={160} placeholder="Suspensão, multa, cassação..." required /><datalist id="sale-services">{SERVICE_SUGGESTIONS.map((service) => <option key={service} value={service} />)}</datalist></Field>
        </div>
        <div className="form-row">
          <Field label="Valor pago (R$) *"><input type="number" step="0.01" min="0.01" value={form.amount} onChange={set('amount')} required /></Field>
          <Field label="Forma de pagamento *"><select value={form.payment_method} onChange={set('payment_method')}>{PAYMENT_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </div>
        <div style={{ ...muted, marginTop: -8 }}>Informe somente o valor recebido nesta parcela. Ele será somado uma vez ao faturamento do mês.</div>
        {nextFrom && <div style={paymentConfirmationInfo}>Vencimento contratual: <strong>{formatDate(nextFrom.next_installment_due_date)}</strong>. Se o cliente pagou depois, mantenha acima a data real do recebimento.</div>}
        <div className="form-row">
          <Field label="Forma de fechamento *"><select value={form.closing_method} onChange={set('closing_method')}>{CLOSING_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          {sale ? <Field label="Status"><select value={form.status} onChange={set('status')}><option value="confirmed">Confirmada</option><option value="pending">Pendente</option><option value="canceled">Cancelada</option></select></Field> : <div />}
        </div>
        <div style={installmentCard}>
          <label style={checkStyle}><input type="checkbox" checked={hasInstallment} disabled={Boolean(nextFrom)} onChange={(event) => setHasInstallment(event.target.checked)} /> Pagamento parcelado</label>
          {hasInstallment && <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', width: '100%' }}>
            <Field label="Parcela atual"><input type="number" min="1" max="120" value={form.installment_number} onChange={set('installment_number')} readOnly={!sale || Boolean(nextFrom)} required /></Field>
            <Field label="Total de parcelas"><input type="number" min="1" max="120" value={form.installment_total} onChange={setInstallmentTotal} readOnly={Boolean(nextFrom)} required /></Field>
            <Field label="Periodicidade"><select value={form.installment_frequency} onChange={setFrequency}>{INSTALLMENT_FREQUENCIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            {!settled && (sale || nextFrom) && <Field label="Vencimento da próxima"><input type="date" value={form.next_installment_due_date} onChange={set('next_installment_due_date')} required /></Field>}
            <label style={{ ...checkStyle, minHeight: 42 }}><input type="checkbox" checked={settled} disabled={finalInstallment} onChange={(event) => setForm((previous) => ({ ...previous, is_settlement: event.target.checked }))} /> Quitação</label>
          </div>}
          {!sale && !nextFrom && hasInstallment && !settled && Number(form.installment_number) === 1 && <div style={{ width: '100%', marginTop: 12 }}>
            <div style={{ ...muted, marginBottom: 8 }}>Informe o valor e o vencimento de cada cobrança. Esses valores são previsões e só entram no faturamento quando o pagamento for confirmado.</div>
            <div style={{ display: 'grid', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
              {futureSchedule.map((item) => <div key={item.installment_number} style={scheduleEditorRow}>
                <strong style={{ gridColumn: '1 / -1', fontSize: 12, color: '#334155' }}>Parcela {item.installment_number}/{form.installment_total}</strong>
                <Field label="Vencimento *"><input aria-label={`Vencimento da parcela ${item.installment_number}`} type="date" value={item.due_date} onChange={setScheduleField(item.installment_number, 'due_date')} required /></Field>
                <Field label="Valor previsto (R$) *"><input aria-label={`Valor previsto da parcela ${item.installment_number}`} type="number" step="0.01" min="0.01" value={item.expected_amount} onChange={setScheduleField(item.installment_number, 'expected_amount')} required /></Field>
              </div>)}
            </div>
          </div>}
        </div>
        <div style={commissionInfo}>
          <strong style={{ color: '#166534' }}>Comissão automática e auditável</strong>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>
            {consultant
              ? consultant.role === 'master'
                ? <>Venda pessoal da proprietária, sem comissão automática e invisível para a supervisão.</>
                : consultant.role === 'supervisor'
                ? <><strong>{SUPERVISOR_PERSONAL_PERCENTAGE}%</strong> sobre o valor integral das vendas pessoais da supervisão.</>
                : <><strong>{FIXED_COMMISSION_PERCENTAGE}% fixos</strong> sobre o valor que exceder <strong>{formatBRL(FIXED_COMMISSION_THRESHOLD)}</strong> em vendas no mês.</>
              : <>Regra global: <strong>{FIXED_COMMISSION_PERCENTAGE}% fixos</strong> acima de <strong>{formatBRL(FIXED_COMMISSION_THRESHOLD)}</strong>.</>}
          </div>
        </div>
        <div className="form-actions"><button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Salvando...' : nextFrom ? 'Confirmar pagamento' : 'Salvar venda'}</button></div>
      </form>
    </div>
  </div>;
}

function InstallmentScheduleModal({ installment, onClose, onSubmit }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    next_installment_due_date: String(installment.next_installment_due_date || '').substring(0, 10),
    next_installment_amount: installment.pending_amount ?? installment.amount ?? '',
    installment_frequency: installment.installment_frequency || 'monthly',
    installment_number: installment.next_installment_number,
  });
  const set = (key) => (event) => setForm((previous) => ({ ...previous, [key]: event.target.value }));

  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" style={{ maxWidth: 650 }} onClick={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div><h2 style={{ fontSize: 19, fontWeight: 750, margin: 0 }}>Ajustar cobrança programada</h2><div style={muted}>A alteração fica na agenda e não cria uma venda.</div></div>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>
      <form className="modal-form" onSubmit={async (event) => {
        event.preventDefault();
        if (submitting) return;
        if (!form.next_installment_due_date) return alert('Informe o vencimento da cobrança.');
        if (!form.next_installment_amount || Number(form.next_installment_amount) <= 0) return alert('Informe um valor previsto válido.');
        setSubmitting(true);
        const succeeded = await onSubmit({
          next_installment_due_date: form.next_installment_due_date,
          next_installment_amount: Number(form.next_installment_amount),
          installment_frequency: form.installment_frequency,
          installment_number: form.installment_number,
        });
        if (!succeeded) setSubmitting(false);
      }}>
        <div className="form-row">
          <Field label="Cliente"><input value={installment.customer_name || '—'} readOnly /></Field>
          <Field label="Serviço"><input value={installment.service_name || installment.description || '—'} readOnly /></Field>
        </div>
        <div className="form-row">
          <Field label="Vencimento desta cobrança *"><input type="date" value={form.next_installment_due_date} onChange={set('next_installment_due_date')} required /></Field>
          <Field label="Valor previsto (R$) *"><input type="number" step="0.01" min="0.01" value={form.next_installment_amount} onChange={set('next_installment_amount')} required /></Field>
        </div>
        <div className="form-row">
          <Field label="Parcela"><input value={`${installment.next_installment_number}/${installment.installment_total}`} readOnly /></Field>
          <Field label="Periodicidade"><input value={installmentFrequencyLabel(form.installment_frequency)} readOnly /></Field>
        </div>
        <div style={paymentConfirmationInfo}><strong>Importante:</strong> salvar aqui não soma valor ao faturamento. A receita só será lançada em “Confirmar pagamento”.</div>
        <div className="form-actions"><button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>Cancelar</button><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Salvando...' : 'Salvar cobrança'}</button></div>
      </form>
    </div>
  </div>;
}

function MetricCard({ label, value, tone }) {
  return <div className={`sales-metric-card ${tone || ''}`}><span>{label}</span><strong>{value}</strong></div>;
}
function Field({ label, children }) { return <div className="form-group" style={{ flex: 1 }}><label>{label}</label>{children}</div>; }
function installmentLabel(sale) {
  if (!sale.installment_total) return '—';
  return sale.is_settlement ? `${sale.installment_number}/${sale.installment_total} · Quitado` : `${sale.installment_number}/${sale.installment_total}`;
}
function paymentLabel(value) { return PAYMENT_METHODS.find(([key]) => key === value)?.[1] || value || '—'; }
function closingLabel(value) { return CLOSING_METHODS.find(([key]) => key === value)?.[1] || value || '—'; }
function installmentFrequencyLabel(value) { return INSTALLMENT_FREQUENCIES.find(([key]) => key === value)?.[1] || 'Mensal'; }
function statusLabel(value) { return ({ confirmed: 'Confirmada', pending: 'Pendente', canceled: 'Cancelada' })[value] || 'Confirmada'; }
function followUpStatusLabel(value) { return ({ overdue: 'Atrasada', due_today: 'Vence hoje', upcoming: 'Programada' })[value] || 'Programada'; }
function followUpStatusStyle(value) {
  const colors = value === 'overdue' ? ['#fee2e2', '#b91c1c'] : value === 'due_today' ? ['#ffedd5', '#c2410c'] : ['#e0f2fe', '#0369a1'];
  return { display: 'inline-flex', padding: '4px 9px', borderRadius: 999, background: colors[0], color: colors[1], fontSize: 11, fontWeight: 750 };
}
function isRevenueSale(sale) { return String(sale?.status || 'confirmed').toLowerCase() !== 'pending'; }
function localIsoDate() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function nextDateAfter(value, frequency) {
  if (frequency === 'manual') return '';
  const text = String(value || localIsoDate()).substring(0, 10);
  const [year, month, day] = text.split('-').map(Number);
  if (frequency === 'weekly') {
    const date = new Date(year, month - 1, day, 12);
    date.setDate(date.getDate() + 7);
    return localIsoDateFor(date);
  }
  const lastDay = new Date(year, month + 1, 0).getDate();
  return localIsoDateFor(new Date(year, month, Math.min(day, lastDay), 12));
}
function createFutureSchedule(total, firstDueDate, frequency, existing = []) {
  const count = Math.max(0, Math.min(Number(total || 1) - 1, 119));
  const previous = new Map((existing || []).map((item) => [Number(item.installment_number), item]));
  const rows = [];
  let dueDate = firstDueDate || '';
  for (let index = 0; index < count; index += 1) {
    const installmentNumber = index + 2;
    const old = previous.get(installmentNumber);
    const suggestedDate = frequency === 'manual' ? (old?.due_date || '') : (old?.due_date || dueDate);
    rows.push({
      installment_number: installmentNumber,
      due_date: suggestedDate,
      expected_amount: old?.expected_amount ?? '',
    });
    dueDate = suggestedDate ? nextDateAfter(suggestedDate, frequency) : '';
  }
  return rows;
}
function localIsoDateFor(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function Loading() { return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}><div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} /><p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando quadro de vendas...</p></div>; }

const pageStack = { display: 'flex', flexDirection: 'column', gap: 18 };
const headerStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 };
const headerActions = { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' };
const titleStyle = { fontSize: 20, fontWeight: 750, color: '#0f172a', margin: 0 };
const subtitleStyle = { fontSize: 13, color: '#64748b', margin: '3px 0 0' };
const muted = { color: '#64748b', fontSize: 12 };
const warningBadge = { background: '#fff7ed', color: '#c2410c', borderRadius: 999, padding: '4px 9px', fontSize: 11, fontWeight: 650 };
const installmentCard = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 9, padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, flexWrap: 'wrap' };
const scheduleEditorRow = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, alignItems: 'end', border: '1px solid #e2e8f0', borderRadius: 8, padding: 9, background: '#fff' };
const checkStyle = { display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13, fontWeight: 650 };
const commissionInfo = { background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '11px 13px' };
const paymentConfirmationInfo = { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', borderRadius: 9, padding: '10px 12px', fontSize: 12 };
const followUpCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' };
const followUpHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid #f1f5f9' };
const followUpCount = { background: '#fff7ed', color: '#c2410c', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 750 };
const followUpEmpty = { color: '#64748b', fontSize: 13, padding: '18px', textAlign: 'center' };
const followUpActions = { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 7 };
