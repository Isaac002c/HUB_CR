'use client';

import { useState, useEffect, useCallback } from 'react';
import { getOverview, getPersonalNote, updatePersonalNote } from '../lib/managementAPI';
import { formatBRL } from '../lib/processConstants';
import PeriodFilter from './components/PeriodFilter';
import Podium from './components/Podium';
import MiniBarChart from './components/MiniBarChart';
import { getDailyMotivationalQuote } from '../lib/motivationalQuotes';

const now = new Date();

export default function VisaoGeral() {
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [data, setData] = useState(null);
  const [personalNote, setPersonalNote] = useState('');
  const [noteLoaded, setNoteLoaded] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteMessage, setNoteMessage] = useState('');
  const [dailyQuote, setDailyQuote] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentUser = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
  const isConsultor = String(currentUser?.role || '').toLowerCase() === 'seller';

  useEffect(() => {
    setDailyQuote(getDailyMotivationalQuote(currentUser));
  }, [currentUser?.id, currentUser?.email, currentUser?.name]);

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const [res, note] = await Promise.all([
        getOverview({ month: period.month, year: period.year }),
        isConsultor ? getPersonalNote() : Promise.resolve(null),
      ]);
      setData(res);
      if (isConsultor && !noteLoaded) {
        setPersonalNote(note?.note || '');
        setNoteLoaded(true);
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [period, isConsultor, noteLoaded]);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="error-message">{error}</div>;

  const cur = data?.current || {};
  const cmp = data?.comparison || {};
  const ranking = data?.ranking || [];
  const pct = Number(cmp.amount_pct) || 0;
  const saveNote = async () => {
    try {
      setSavingNote(true); setNoteMessage('');
      await updatePersonalNote(personalNote);
      setNoteMessage('Anotação salva.');
    } catch (err) {
      setNoteMessage(err.message || 'Não foi possível salvar a anotação.');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {dailyQuote && <div style={quoteCardStyle}>
        <div style={quoteIconStyle} aria-hidden="true">“</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#8b2529', fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', marginBottom: 5 }}>Mensagem do dia</div>
          <p style={{ margin: 0, color: '#334155', fontSize: 15, fontWeight: 600, lineHeight: 1.5 }}>{dailyQuote}</p>
        </div>
      </div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>{isConsultor ? 'Meu painel' : 'Visão Geral'}</h2>
          <p style={{ fontSize: 13, color: '#94a3b8', margin: '2px 0 0' }}>{isConsultor ? 'Acompanhe somente suas vendas e suas metas pessoais.' : 'Desempenho comercial do período'}</p>
        </div>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      {/* KPIs */}
      <div className="kpi-grid management-kpi-grid" style={{ marginBottom: 0 }}>
        <Kpi label={isConsultor ? 'Minhas vendas no mês' : 'Vendas do mês'} value={formatBRL(cur.total_amount)} cls="success"
             change={pct} changeLabel={`${pct >= 0 ? '+' : ''}${pct}% vs mês anterior`} />
        <Kpi label="Vendas" value={cur.sales_count || 0} cls="primary" />
        <Kpi label="Ticket médio" value={formatBRL(cur.avg_ticket)} cls="warning" />
        <Kpi label={isConsultor ? 'Minha comissão' : 'Comissões'} value={formatBRL(cur.total_commission)} cls="" />
      </div>

      {isConsultor && (
        <div style={cardStyle}>
          <div style={cardHead}>
            <div><span style={cardTitle}>Minhas anotações</span><div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>Espaço pessoal para metas, prioridades e lembretes.</div></div>
            <button className="btn-primary" type="button" onClick={saveNote} disabled={savingNote}>{savingNote ? 'Salvando...' : 'Salvar anotação'}</button>
          </div>
          <textarea value={personalNote} onChange={(event) => { setPersonalNote(event.target.value); setNoteMessage(''); }} maxLength={4000} rows={5} placeholder="Ex.: Meta da semana, retorno para clientes, foco do mês..." style={{ width: '100%', resize: 'vertical', padding: 12, border: '1px solid #dbe3ee', borderRadius: 9, color: '#1e293b', fontSize: 14, lineHeight: 1.5 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, color: noteMessage.includes('Não foi') ? '#b91c1c' : '#64748b', fontSize: 12 }}><span>{noteMessage}</span><span>{personalNote.length}/4000</span></div>
        </div>
      )}

      {!isConsultor && <div style={cardStyle}>
        <div style={cardHead}><span style={cardTitle}>🏆 Top Vendedores</span></div>
        <Podium top={ranking} />
      </div>}

      <div className="md-layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 20 }}>
        {/* Desempenho mensal */}
        <div style={cardStyle}>
          <div style={cardHead}><span style={cardTitle}>{isConsultor ? 'Meu desempenho mês a mês' : 'Desempenho mensal'}</span></div>
          <MiniBarChart data={data?.monthly || []} />
        </div>

        {!isConsultor && <div style={cardStyle}>
          <div style={cardHead}><span style={cardTitle}>Desempenho da equipe</span></div>
          {ranking.length === 0 ? (
            <div style={{ padding: 20, color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>Sem vendas no período.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ border: 'none' }}>
                <thead>
                  <tr><th>#</th><th>Vendedor</th><th>Equipe</th><th style={{ textAlign: 'right' }}>Vendas</th><th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'right' }}>% Com.</th><th style={{ textAlign: 'right' }}>Comissão</th></tr>
                </thead>
                <tbody>
                  {ranking.map((r) => (
                    <tr key={r.seller_id}>
                      <td style={{ fontWeight: 700, color: '#751518' }}>{r.position}º</td>
                      <td style={{ fontWeight: 600 }}>{r.seller_name}</td>
                      <td style={{ color: '#64748b' }}>{r.team_name || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{r.sales_count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatBRL(r.total_amount)}</td>
                      <td style={{ textAlign: 'right', color: '#64748b' }}>{Number(r.commission_percentage || 0)}%</td>
                      <td style={{ textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{formatBRL(r.total_commission)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>}
      </div>
    </div>
  );
}

const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 18 };
const cardHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 };
const cardTitle = { fontSize: 15, fontWeight: 700, color: '#1e293b' };
const quoteCardStyle = { display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(115deg, #fff 0%, #fff7f7 100%)', border: '1px solid #ead5d6', borderLeft: '4px solid #8b2529', borderRadius: 12, padding: '15px 18px', boxShadow: '0 8px 24px rgba(117, 21, 24, 0.05)' };
const quoteIconStyle = { width: 42, height: 42, flexShrink: 0, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 8, background: '#751518', color: '#fff', fontFamily: 'Georgia, serif', fontSize: 35, lineHeight: 1 };

function Kpi({ label, value, cls, change, changeLabel }) {
  return (
    <div className={`kpi-card ${cls}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
      {changeLabel && (
        <div className={`kpi-change ${change >= 0 ? 'positive' : 'negative'}`}>{changeLabel}</div>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando gestão...</p>
    </div>
  );
}
