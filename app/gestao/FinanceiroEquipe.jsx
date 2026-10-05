'use client';

import { useState, useEffect, useCallback } from 'react';
import { getTeams, getTeamClosing } from '../lib/managementAPI';
import { formatBRL } from '../lib/processConstants';
import { SUPERVISOR_PERSONAL_PERCENTAGE, SUPERVISOR_TEAM_PERCENTAGE } from '../lib/commissionPolicy';
import PeriodFilter from './components/PeriodFilter';
import MiniBarChart from './components/MiniBarChart';
import Podium from './components/Podium';

const now = new Date();

export default function FinanceiroEquipe() {
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [team, setTeam] = useState(null);
  const [closing, setClosing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadTeam = useCallback(async () => {
    try {
      const teams = await getTeams();
      setTeam(teams?.[0] || null);
    } catch (err) { setError(err.message); }
  }, []);

  const loadClosing = useCallback(async () => {
    if (!team) { setLoading(false); return; }
    try {
      setLoading(true); setError(null);
      setClosing(await getTeamClosing(team.id, period));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [team, period]);

  useEffect(() => { loadTeam(); }, [loadTeam]);
  useEffect(() => { loadClosing(); }, [loadClosing]);

  if (loading && !closing) return <Loading />;
  if (!team) return <div style={empty}>Você ainda não está vinculada como responsável por uma equipe.</div>;

  const performance = closing?.current || {};
  const personal = closing?.personal || {};
  const commission = closing?.supervision_commission || {};
  const teamProgress = Number(performance.target_progress || 0);
  const personalProgress = Number(personal.target_progress || 0);

  return (
    <div className="supervision-dashboard">
      <div style={header}>
        <div>
          <h2 style={title}>Desempenho da equipe · {team.name}</h2>
          <p style={subtitle}>Resultados da equipe e produção pessoal, separados por competência</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {error && <div className="error-message">{error}</div>}

      <section style={heroCard}>
        <div style={{ flex: '1 1 260px' }}>
          <span style={eyebrow}>Faturamento da equipe no mês</span>
          <strong style={heroValue}>{formatBRL(performance.total_amount)}</strong>
          <span style={muted}>{performance.sales_count || 0} contrato(s) válido(s)</span>
        </div>
        <div style={{ flex: '2 1 360px' }}>
          <div style={progressHead}><span>Progresso da meta da equipe</span><strong>{teamProgress.toFixed(1)}%</strong></div>
          <div style={track}><i style={{ ...fill, width: `${Math.min(teamProgress, 100)}%` }} /></div>
          <div style={progressMeta}>
            <span>Meta: <strong>{performance.target_configured ? formatBRL(performance.target_amount) : 'Não definida'}</strong></span>
            <span>Restante: <strong>{performance.target_configured ? formatBRL(performance.target_remaining) : '—'}</strong></span>
          </div>
        </div>
      </section>

      <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}>
        <Kpi label="Meta mensal da equipe" value={performance.target_configured ? formatBRL(performance.target_amount) : 'Não definida'} cls="primary" />
        <Kpi label="Valor realizado" value={formatBRL(performance.total_amount)} cls="success" />
        <Kpi label="Valor restante" value={performance.target_configured ? formatBRL(performance.target_remaining) : '—'} cls="warning" />
        <Kpi label="Percentual atingido" value={`${teamProgress.toFixed(1)}%`} />
      </div>

      <section style={card}>
        <div style={cardHead}>
          <div><span style={cardTitle}>Comissão gerada para a supervisão</span><div style={muted}>Sem duplicidade: suas vendas não entram na base de 5% da equipe.</div></div>
        </div>
        <div className="supervision-commission-grid">
          <CommissionLine label={`Comissão pessoal — ${SUPERVISOR_PERSONAL_PERCENTAGE}%`} base={commission.personal_sales_base} value={commission.personal_commission} />
          <CommissionLine label={`Comissão da equipe — ${SUPERVISOR_TEAM_PERCENTAGE}%`} base={commission.team_sales_base} value={commission.team_commission} />
          <CommissionLine label="Comissão total" value={commission.total_commission} total />
        </div>
      </section>

      <section style={card}>
        <div style={cardHead}><div><span style={cardTitle}>Minha produção</span><div style={muted}>Vendas pessoais separadas da produção dos consultores</div></div></div>
        <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 14 }}>
          <Kpi label="Vendas pessoais" value={personal.sales_count || 0} cls="primary" />
          <Kpi label="Faturamento pessoal" value={formatBRL(personal.total_amount)} cls="success" />
          <Kpi label="Meta individual" value={personal.target_configured ? formatBRL(personal.target_amount) : 'Não definida'} />
          <Kpi label={`Comissão pessoal · ${SUPERVISOR_PERSONAL_PERCENTAGE}%`} value={formatBRL(personal.commission_amount)} cls="warning" />
        </div>
        <div style={progressHead}><span>Progresso individual</span><strong>{personalProgress.toFixed(1)}%</strong></div>
        <div style={track}><i style={{ ...fill, width: `${Math.min(personalProgress, 100)}%` }} /></div>
        <div style={progressMeta}>
          <span>Realizado: <strong>{formatBRL(personal.total_amount)}</strong></span>
          <span>Restante: <strong>{personal.target_configured ? formatBRL(personal.target_remaining) : '—'}</strong></span>
        </div>
      </section>

      <section style={card}>
        <div style={cardHead}><span style={cardTitle}>🏆 Ranking interno da equipe</span></div>
        <Podium top={closing?.ranking || []} />
      </section>

      <section style={{ ...card, padding: 0, overflow: 'hidden' }}>
        <div style={{ ...cardHead, padding: '16px 18px', borderBottom: '1px solid #e2e8f0', margin: 0 }}>
          <div><span style={cardTitle}>Detalhamento dos consultores vinculados</span><div style={muted}>Comissão individual segue a regra validada de 10% acima de R$ 7.500.</div></div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ border: 'none', minWidth: 840 }}>
            <thead><tr><th>Consultor</th><th style={right}>Vendas</th><th style={right}>Faturamento</th><th style={right}>Meta</th><th style={right}>Progresso</th><th style={right}>Comissão individual</th></tr></thead>
            <tbody>
              {(closing?.collaborators || []).map((row) => <tr key={row.id}>
                <td><strong>{row.name}</strong></td>
                <td style={right}>{row.sales_month || 0}</td>
                <td style={{ ...right, fontWeight: 700 }}>{formatBRL(row.sold_period)}</td>
                <td style={right}>{row.monthly_target_configured ? formatBRL(row.monthly_sales_target) : 'Não definida'}</td>
                <td style={right}>{Number(row.target_progress || 0).toFixed(1)}%</td>
                <td style={{ ...right, color: '#15803d', fontWeight: 750 }}>{formatBRL(row.commission_period)}</td>
              </tr>)}
              {(closing?.collaborators || []).length === 0 && <tr><td colSpan={6} style={empty}>Nenhum consultor vinculado à equipe.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section style={card}>
        <div style={cardHead}><span style={cardTitle}>Desempenho mês a mês</span></div>
        <MiniBarChart data={closing?.monthly || []} />
      </section>
    </div>
  );
}

function Kpi({ label, value, cls = '' }) {
  return <div className={`kpi-card ${cls}`}><div className="kpi-value">{value}</div><div className="kpi-label">{label}</div></div>;
}

function CommissionLine({ label, base, value, total = false }) {
  return <div className={`supervision-commission-line${total ? ' total' : ''}`}>
    <div><span>{label}</span>{base !== undefined && <small>Base elegível: {formatBRL(base)}</small>}</div>
    <strong>{formatBRL(value)}</strong>
  </div>;
}

function Loading() {
  return <div style={empty}><div className="loading-spinner" style={{ width: 32, height: 32, margin: '0 auto 12px', border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />Carregando desempenho da equipe...</div>;
}

const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 };
const title = { fontSize: 20, fontWeight: 760, color: '#0f172a', margin: 0 };
const subtitle = { fontSize: 13, color: '#64748b', margin: '3px 0 0' };
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18 };
const heroCard = { ...card, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', borderLeft: '5px solid #751518' };
const cardHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 };
const cardTitle = { fontSize: 15, fontWeight: 750, color: '#1e293b' };
const eyebrow = { display: 'block', color: '#751518', fontSize: 12, fontWeight: 750, textTransform: 'uppercase', letterSpacing: '.05em' };
const heroValue = { display: 'block', color: '#0f172a', fontSize: 34, lineHeight: 1.15, margin: '5px 0' };
const muted = { color: '#64748b', fontSize: 12 };
const progressHead = { display: 'flex', justifyContent: 'space-between', gap: 12, color: '#334155', fontSize: 13, marginBottom: 8 };
const track = { height: 10, borderRadius: 99, background: '#e2e8f0', overflow: 'hidden' };
const fill = { display: 'block', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#751518,#b52d42)' };
const progressMeta = { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: '#64748b', fontSize: 12, marginTop: 8 };
const right = { textAlign: 'right' };
const empty = { padding: 40, textAlign: 'center', color: '#94a3b8' };
