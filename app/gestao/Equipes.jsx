'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTeams, createTeam, updateTeam, deleteTeam, getTeamClosing, getCollaborators, updateTeamTarget, getManagementTargets, updateCompanyTarget } from '../lib/managementAPI';
import { formatBRL } from '../lib/processConstants';
import PeriodFilter from './components/PeriodFilter';
import MiniBarChart from './components/MiniBarChart';

const now = new Date();
const readUser = () => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } };

// Aceita tanto o formato brasileiro (30.000,00) quanto o digitado sem máscara
// (30000.00). O input continua como texto para não sumir com os pontos ao
// usuário digitar a meta.
const parseMoney = (value) => {
  const raw = String(value ?? '').replace(/R\$|\s/g, '').trim();
  if (!raw) return 0;
  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  let normalized = raw;
  if (comma >= 0 && dot >= 0) {
    normalized = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '');
  } else if (comma >= 0) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(raw)) {
    normalized = raw.replace(/\./g, '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : NaN;
};
const formatMoneyInput = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';
};

export default function Equipes() {
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [teams, setTeams] = useState([]);
  const [people, setPeople] = useState([]);
  const [selected, setSelected] = useState(null);
  const [closing, setClosing] = useState(null);
  const [companyTarget, setCompanyTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // {mode:'new'|'edit', team}

  const role = (readUser().role || '').toLowerCase();
  const canManage = role === 'master' || role === 'admin';
  const canManageTarget = role === 'master';

  const loadTeams = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [tms, ppl] = await Promise.all([getTeams(), getCollaborators().catch(() => [])]);
      setTeams(tms || []);
      setPeople(ppl || []);
      if (!selected && tms && tms.length) setSelected(tms[0].id);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadClosing = useCallback(async () => {
    if (!selected) { setClosing(null); return; }
    try {
      const [teamClosing, targets] = await Promise.all([
        getTeamClosing(selected, { month: period.month, year: period.year }),
        getManagementTargets({ month: period.month, year: period.year }),
      ]);
      setClosing(teamClosing);
      setCompanyTarget(targets.company_target || null);
    }
    catch (err) { setError(err.message); }
  }, [selected, period]);

  useEffect(() => { loadTeams(); }, [loadTeams]);
  useEffect(() => { loadClosing(); }, [loadClosing]);

  const submitTeam = async (form) => {
    try {
      if (modal.mode === 'edit') await updateTeam(modal.team.id, form);
      else await createTeam(form);
      setModal(null); loadTeams();
    } catch (err) { alert(err.message); }
  };
  const removeTeam = async (t) => {
    if (!confirm(`Excluir a equipe "${t.name}"? Os membros ficarão sem equipe.`)) return;
    try { await deleteTeam(t.id); if (selected === t.id) setSelected(null); loadTeams(); }
    catch (err) { alert(err.message); }
  };
  const saveTeamTarget = async (amount) => {
    const parsed = parseMoney(amount);
    if (!Number.isFinite(parsed)) throw new Error('Informe a meta em um valor válido.');
    await updateTeamTarget(selected, { month: period.month, year: period.year, amount: parsed });
    await loadClosing();
  };
  const saveCompanyTarget = async (amount) => {
    const parsed = parseMoney(amount);
    if (!Number.isFinite(parsed)) throw new Error('Informe a meta em um valor válido.');
    await updateCompanyTarget({ month: period.month, year: period.year, amount: parsed });
    await loadClosing();
  };

  if (loading && teams.length === 0) return <Loading />;

  const cur = closing?.current || {};
  const prev = closing?.previous || {};
  const cmp = closing?.comparison || {};
  const pct = Number(cmp.amount_pct) || 0;
  const workforce = closing?.workforce?.totals || null;
  const supervisionCommission = closing?.supervision_commission || null;
  const selectedTeam = teams.find((team) => team.id === selected);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Equipes</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>Fechamento mensal e desempenho por equipe</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <PeriodFilter value={period} onChange={setPeriod} />
          {canManage && <button className="btn-primary" onClick={() => setModal({ mode: 'new', team: null })}>+ Equipe</button>}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {companyTarget && <MonthlyTargetCard
        key={`company-${period.year}-${period.month}-${companyTarget.amount ?? 'none'}`}
        title="Meta geral da empresa"
        description="Consolidado mensal de todas as equipes. Cada competência mantém seu próprio histórico."
        target={companyTarget}
        period={period}
        canEdit={canManageTarget}
        onSave={saveCompanyTarget}
      />}

      {/* Seletor de equipes */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {teams.map((t) => (
          <button key={t.id} onClick={() => setSelected(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: '1px solid ' + (selected === t.id ? '#751518' : '#e2e8f0'),
              background: selected === t.id ? 'rgba(117,21,24,0.08)' : '#fff',
              color: selected === t.id ? '#751518' : '#64748b',
            }}>
            {t.name}
            <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: 999 }}>{t.members_count || 0}</span>
            {canManage && <span onClick={(e) => { e.stopPropagation(); setModal({ mode: 'edit', team: t }); }} title="Editar" style={{ opacity: 0.6 }}>✎</span>}
          </button>
        ))}
        {teams.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>Nenhuma equipe cadastrada.</div>}
      </div>

      {selected && closing && (
        <>
          {/* Fechamento do mês */}
          <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}>
            <Kpi label="Total vendido" value={formatBRL(cur.total_amount)} cls="success" />
            <Kpi label="Vendas" value={cur.sales_count || 0} cls="primary" />
            <Kpi label="Vendedores ativos" value={cur.active_sellers || 0} cls="" />
            <Kpi label="Ticket médio" value={formatBRL(cur.avg_ticket)} cls="warning" />
            <Kpi label="Comissão total" value={formatBRL(cur.total_commission)} cls="" />
          </div>

          {supervisionCommission && (
            <div style={card}>
              <div style={cardHead}>
                <span style={cardTitle}>Comissão da supervisão</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{selectedTeam?.supervisor_name || 'Supervisão'}</span>
              </div>
              <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}>
                <Kpi label={`Pessoal (${supervisionCommission.personal_percentage}%)`} value={formatBRL(supervisionCommission.personal_commission)} cls="primary" />
                <Kpi label={`Equipe (${supervisionCommission.team_percentage}%)`} value={formatBRL(supervisionCommission.team_commission)} cls="warning" />
                <Kpi label="Total da supervisão" value={formatBRL(supervisionCommission.total_commission)} cls="success" />
              </div>
            </div>
          )}

          <MonthlyTargetCard
            key={`${selected}-${period.year}-${period.month}-${closing.team_target?.amount ?? 'none'}`}
            target={closing.team_target}
            title="Meta mensal da equipe"
            description="Meta coletiva desta equipe, independente das metas individuais dos colaboradores."
            period={period}
            canEdit={canManageTarget}
            onSave={saveTeamTarget}
          />

          {canManage && workforce && (
            <div style={card}>
              <div style={cardHead}><span style={cardTitle}>Financeiro da equipe</span><span style={{ fontSize: 12, color: '#64748b' }}>{workforce.collaborators || 0} colaborador(es)</span></div>
              <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}>
                <Kpi label="Salários" value={formatBRL(workforce.salary)} cls="" />
                <Kpi label="13º provisionado" value={formatBRL(workforce.thirteenthProvision)} cls="warning" />
                <Kpi label="Custo total" value={formatBRL(workforce.totalPeopleCost)} cls="" />
                <Kpi label="Resultado após pessoas" value={formatBRL(Number(cur.total_amount || 0) - Number(workforce.totalPeopleCost || 0))} cls="success" />
              </div>
            </div>
          )}

          {/* Comparação mês atual x anterior */}
          <div style={card}>
            <div style={cardHead}><span style={cardTitle}>Mês atual × mês anterior</span></div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
              <Compare label="Mês anterior" value={formatBRL(prev.total_amount)} muted />
              <span style={{ fontSize: 22, color: '#cbd5e1' }}>→</span>
              <Compare label="Mês atual" value={formatBRL(cur.total_amount)} />
              <div style={{
                marginLeft: 'auto', padding: '10px 16px', borderRadius: 10, fontWeight: 800, fontSize: 18,
                background: pct >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: pct >= 0 ? '#16a34a' : '#dc2626',
              }}>
                {pct >= 0 ? '▲' : '▼'} {pct >= 0 ? '+' : ''}{pct}%
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>{formatBRL(cmp.amount_diff)}</div>
              </div>
            </div>
          </div>

          {/* Desempenho mês a mês */}
          <div style={card}>
            <div style={cardHead}><span style={cardTitle}>Desempenho mês a mês</span></div>
            <MiniBarChart data={closing.monthly || []} />
          </div>

          {/* Ranking da equipe */}
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <div style={{ ...cardHead, padding: '14px 18px', marginBottom: 0, borderBottom: '1px solid #f1f5f9' }}>
              <span style={cardTitle}>Ranking da equipe</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ border: 'none', borderRadius: 0 }}>
                <thead><tr><th>#</th><th>Vendedor</th><th style={{ textAlign: 'right' }}>Vendas</th><th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'right' }}>Comissão</th></tr></thead>
                <tbody>
                  {(closing.ranking || []).map((r) => (
                    <tr key={r.seller_id}>
                      <td style={{ fontWeight: 700, color: '#751518' }}>{r.position}º</td>
                      <td style={{ fontWeight: 600 }}>{r.seller_name}</td>
                      <td style={{ textAlign: 'right' }}>{r.sales_count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatBRL(r.total_amount)}</td>
                      <td style={{ textAlign: 'right', color: '#16a34a' }}>{formatBRL(r.total_commission)}</td>
                    </tr>
                  ))}
                  {(closing.ranking || []).length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 20 }}>Sem vendas no período.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modal && (
        <TeamModal
          mode={modal.mode}
          team={modal.team}
          supervisors={people.filter((p) => ['master', 'admin', 'supervisor'].includes((p.role || '').toLowerCase()))}
          onClose={() => setModal(null)}
          onSubmit={submitTeam}
          onDelete={modal.mode === 'edit' ? () => removeTeam(modal.team) : null}
        />
      )}
    </div>
  );
}

function TeamModal({ mode, team, supervisors, onClose, onSubmit, onDelete }) {
  const [form, setForm] = useState({
    name: team?.name || '',
    supervisor_id: team?.supervisor_id || '',
    active: team?.active !== false,
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{mode === 'edit' ? 'Editar equipe' : 'Nova equipe'}</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>
        <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ name: form.name.trim(), supervisor_id: form.supervisor_id || null, active: form.active }); }}>
          <div className="form-group"><label>Nome da equipe *</label>
            <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          </div>
          <div className="form-group"><label>Supervisor</label>
            <select value={form.supervisor_id} onChange={(e) => setForm((p) => ({ ...p, supervisor_id: e.target.value }))}>
              <option value="">Nenhum</option>
              {supervisors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))} style={{ width: 16, height: 16 }} /> Ativa
          </label>
          <div className="form-actions" style={{ justifyContent: 'space-between' }}>
            {onDelete ? <button type="button" className="btn-secondary" style={{ color: '#dc2626' }} onClick={onDelete}>Excluir</button> : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn-primary">Salvar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function MonthlyTargetCard({ target, period, canEdit, onSave, title, description }) {
  const [value, setValue] = useState(() => formatMoneyInput(target?.amount));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(period.year, period.month - 1, 1));
  const submit = async (event) => {
    event.preventDefault();
    try {
      setSaving(true); setError('');
      await onSave(value);
    } catch (err) {
      setError(err.message || 'Não foi possível salvar a meta.');
    } finally {
      setSaving(false);
    }
  };
  return <div style={{ ...card, borderLeft: '4px solid #751518' }}>
    <div style={{ ...cardHead, marginBottom: canEdit ? 12 : 0 }}>
      <div><span style={cardTitle}>{title} · {monthName}</span><div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{description}</div></div>
      {!canEdit && <strong style={{ fontSize: 20, color: '#751518' }}>{target?.configured ? formatBRL(target.amount) : 'Não definida'}</strong>}
    </div>
    {canEdit && <form onSubmit={submit} style={{ display: 'flex', alignItems: 'end', gap: 10, flexWrap: 'wrap' }}>
      <div className="form-group" style={{ margin: 0, minWidth: 220 }}><label>Valor da meta (R$)</label><input type="text" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ex.: 30.000,00" required /></div>
      <button className="btn-primary" disabled={saving}>{saving ? 'Salvando...' : target?.configured ? 'Atualizar meta' : 'Definir meta'}</button>
      {error && <span style={{ color: '#b91c1c', fontSize: 12 }}>{error}</span>}
    </form>}
  </div>;
}

function Kpi({ label, value, cls }) {
  return <div className={`kpi-card ${cls}`}><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div></div>;
}
function Compare({ label, value, muted }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: muted ? '#94a3b8' : '#0f172a' }}>{value}</div>
    </div>
  );
}
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const cardHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 };
const cardTitle = { fontSize: 15, fontWeight: 700, color: '#1e293b' };
function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando equipes...</p>
    </div>
  );
}
