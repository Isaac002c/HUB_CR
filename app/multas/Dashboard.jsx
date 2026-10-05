'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getContractDashboard, getStageClients, getDeferred, getRealInfractorAlerts } from '../lib/contractsAPI';
import { getClients } from '../lib/clientsAPI';
import { getUpcomingEvents, getEventsRange } from '../lib/calendarAPI';
import { getKanbanLeads } from '../lib/multasLeadsAPI';
import UserHome from './UserHome';

// ─── Constantes ───────────────────────────────────────────────────────────────

const STAGE_GROUPS = {
  defesa: {
    label:    'Defesa Prévia',
    color:    '#6366f1',
    bg:       'rgba(99,102,241,0.08)',
    subGroups: [
      { key: 'defesa_aprs',    label: 'APRs — Defesa Prévia' },
      { key: 'defesa_analise', label: 'Defesa Prévia — Análise' },
    ],
  },
  inst1: {
    label:    '1ª Instância',
    color:    '#f59e0b',
    bg:       'rgba(245,158,11,0.08)',
    subGroups: [
      { key: 'inst1_aprs',    label: 'APRs — 1ª Instância' },
      { key: 'inst1_analise', label: '1ª Instância — Análise' },
    ],
  },
  inst2: {
    label:    '2ª Instância',
    color:    '#ef4444',
    bg:       'rgba(239,68,68,0.08)',
    subGroups: [
      { key: 'inst2_aprs',    label: 'APRs — 2ª Instância' },
      { key: 'inst2_analise', label: '2ª Instância — Análise' },
    ],
  },
};

// Etapa "Deferidos" — contagem/lista próprias (fines com stage DEFERIDO), inclui cliente OU empresa.
const DEFERIDO_INFO = { label: 'Deferidos', color: '#15803d', bg: 'rgba(21,128,61,0.08)' };
const REAL_INFRATOR_INFO = { label: 'Real infrator', color: '#b45309', bg: 'rgba(245,158,11,0.12)' };

// Parsing date-only seguro: evita o shift de 1 dia ao interpretar "YYYY-MM-DD" como UTC.
const formatDate = (v) => {
  if (!v) return '—';
  const s = String(v).substring(0, 10);
  const [y, m, d] = s.split('-');
  if (y && m && d) return `${d}/${m}/${y}`;
  return new Date(v).toLocaleDateString('pt-BR');
};

// Data local em YYYY-MM-DD (timezone-safe) — usada no range do card de Agendamentos.
const isoLocal = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function SectionCard({ title, children, noPad }) {
  return (
    <div className="md-section-card">
      <div className="md-section-header">
        <h3 className="md-section-title">{title}</h3>
      </div>
      <div className={noPad ? '' : 'md-section-body'}>{children}</div>
    </div>
  );
}

// Card resumo (linha 1)
function SummaryCard({ title, value, subtitle, color, icon, onClick, dimmed }) {
  return (
    <div
      className={`md-metric-card${onClick ? ' md-metric-card--clickable' : ''}${dimmed ? ' md-metric-card--dimmed' : ''}`}
      style={{ '--accent': color }}
      onClick={onClick}
    >
      <div className="md-metric-inner">
        <div className="md-metric-body">
          <span className="md-metric-title">{title}</span>
          <span className="md-metric-value">{value ?? '—'}</span>
          {subtitle && <span className="md-metric-subtitle">{subtitle}</span>}
        </div>
        <div className="md-metric-icon" style={{ background: `${color}18`, color }}>
          {icon}
        </div>
      </div>
      {onClick && (
        <div className="md-metric-click-hint">Ver detalhes →</div>
      )}
    </div>
  );
}

// Card clicável de etapa (linha 2)
function StageCard({ groupKey, info, count, active, onClick }) {
  return (
    <div
      className={`md-stage-card${active ? ' md-stage-card--active' : ''}`}
      style={{ '--scolor': info.color, '--sbg': info.bg }}
      onClick={onClick}
      role="button"
      tabIndex={0}
    >
      <div className="md-stage-card-icon" style={{ background: info.bg, color: info.color }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {groupKey === 'defesa' && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>}
          {groupKey === 'inst1'  && <><line x1="12" y1="3" x2="12" y2="21"/><path d="M3 9l9-7 9 7M5 9l7 13L19 9"/></>}
          {groupKey === 'inst2'  && <><circle cx="12" cy="12" r="3"/><path d="M3 9l9-7 9 7M5 9l7 13L19 9"/></>}
          {groupKey === 'deferido' && <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
          {groupKey === 'real-infractor' && <><circle cx="12" cy="12" r="9"/><path d="M12 7v5"/><circle cx="12" cy="16.5" r=".7" fill="currentColor"/></>}
        </svg>
      </div>
      <div className="md-stage-card-body">
        <span className="md-stage-card-label">{info.label}</span>
        <span className="md-stage-card-count" style={{ color: info.color }}>{count}</span>
        <span className="md-stage-card-sub">processo{count !== 1 ? 's' : ''}</span>
      </div>
      <div className="md-stage-card-arrow" style={{ color: active ? info.color : '#cbd5e1' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {active ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
        </svg>
      </div>
    </div>
  );
}

// Painel expandido da etapa
function StagePanel({ groupKey, info, stageData, onClose }) {
  const router = useRouter();

  return (
    <div className="md-stage-panel">
      <div className="md-stage-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="md-stage-panel-dot" style={{ background: info.color }} />
          <h3 className="md-stage-panel-title" style={{ color: info.color }}>{info.label}</h3>
        </div>
        <button className="md-stage-panel-close" onClick={onClose}>✕ Fechar</button>
      </div>

      <div className="md-stage-panel-groups">
        {info.subGroups.map(({ key, label }) => {
          const clients = stageData[key] || [];
          return (
            <div key={key} className="md-stage-subgroup">
              <div className="md-stage-subgroup-header">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={info.color} strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <span className="md-stage-subgroup-label">{label}</span>
                <span className="md-stage-subgroup-count" style={{ background: `${info.color}18`, color: info.color }}>
                  {clients.length}
                </span>
              </div>

              {clients.length === 0 ? (
                <p className="md-stage-empty">Nenhum processo nesta etapa</p>
              ) : (
                <div className="md-stage-client-list">
                  {clients.map((c) => (
                    <div
                      key={`${c.fine_id}`}
                      className="md-stage-client-card"
                      onClick={() => router.push(`/multas/clients/${c.client_id}`)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="md-stage-client-avatar" style={{ background: `${info.color}18`, color: info.color }}>
                        {c.client_name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="md-stage-client-info">
                        <span className="md-stage-client-name">{c.client_name}</span>
                        <span className="md-stage-client-meta">
                          {c.organ || '—'}
                          {c.fine_number ? ` · ${c.fine_number}` : ''}
                          {c.due_date ? ` · Vence ${formatDate(c.due_date)}` : ''}
                        </span>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6"/>
                      </svg>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Painel de Deferidos (lista plana — cliente OU empresa)
function DeferidosPanel({ items, onClose }) {
  const router = useRouter();
  const color = '#15803d';
  const open = (it) => {
    if (it.client_id)       router.push(`/multas/clients/${it.client_id}`);
    else if (it.company_id) router.push(`/multas/companies/${it.company_id}`);
  };
  return (
    <div className="md-stage-panel">
      <div className="md-stage-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="md-stage-panel-dot" style={{ background: color }} />
          <h3 className="md-stage-panel-title" style={{ color }}>Deferidos — vitórias</h3>
        </div>
        <button className="md-stage-panel-close" onClick={onClose}>✕ Fechar</button>
      </div>
      <div className="md-stage-panel-groups">
        <div className="md-stage-subgroup">
          {items.length === 0 ? (
            <p className="md-stage-empty">Nenhum processo deferido ainda.</p>
          ) : (
            <div className="md-stage-client-list">
              {items.map((c) => (
                <div
                  key={c.id}
                  className="md-stage-client-card"
                  onClick={() => open(c)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="md-stage-client-avatar" style={{ background: `${color}18`, color }}>
                    {c.client_name?.charAt(0).toUpperCase() || '—'}
                  </div>
                  <div className="md-stage-client-info">
                    <span className="md-stage-client-name">
                      {c.client_name || 'Sem nome'}{c.company_id ? '  ·  Empresa' : ''}
                    </span>
                    <span className="md-stage-client-meta">
                      {c.organ || '—'}
                      {c.numero_multa ? ` · ${c.numero_multa}` : ''}
                      {c.vehicle_plate ? ` · ${c.vehicle_plate}` : ''}
                      {c.due_date ? ` · ${formatDate(c.due_date)}` : ''}
                    </span>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RealInfractorPanel({ items, onClose }) {
  const router = useRouter();
  const color = REAL_INFRATOR_INFO.color;
  const open = (it) => {
    if (it.client_id) router.push(`/multas/clients/${it.client_id}`);
    else if (it.company_id && it.vehicle_id) router.push(`/multas/companies/${it.company_id}/vehicles/${it.vehicle_id}`);
    else if (it.company_id) router.push(`/multas/companies/${it.company_id}`);
  };
  return (
    <div className="md-stage-panel">
      <div className="md-stage-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="md-stage-panel-dot" style={{ background: color }} />
          <h3 className="md-stage-panel-title" style={{ color }}>Processos de Real Infrator</h3>
        </div>
        <button className="md-stage-panel-close" onClick={onClose}>✕ Fechar</button>
      </div>
      <div className="md-stage-panel-groups">
        <div className="md-stage-subgroup">
          {items.length === 0 ? <p className="md-stage-empty">Nenhum processo de real infrator cadastrado.</p> : (
            <div className="md-stage-client-list">
              {items.map((it) => (
                <div key={it.id} className="md-stage-client-card" onClick={() => open(it)} role="button" tabIndex={0}>
                  <div className="md-stage-client-avatar" style={{ background: `${color}18`, color }}>!</div>
                  <div className="md-stage-client-info">
                    <span className="md-stage-client-name">{it.client_name || 'Sem nome'}{it.company_id ? '  ·  Empresa' : ''}</span>
                    <span style={{ color: it.real_infractor_name ? '#15803d' : color, fontSize: 12, fontWeight: 700 }}>
                      {it.real_infractor_name ? `Real infrator: ${it.real_infractor_name}` : 'Nome do real infrator pendente'}
                    </span>
                    <span className="md-stage-client-meta">{[it.numero_multa, it.vehicle_plate, it.infraction_type && `Art. ${it.infraction_type}`, it.organ].filter(Boolean).join(' · ') || 'Processo TRI'}</span>
                  </div>
                  <span style={{ color: it.real_infractor_name ? '#15803d' : color, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {it.real_infractor_name ? 'Cadastrado' : 'Informar nome'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function MultasDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [clients,    setClients]    = useState([]);
  const [contracts,  setContracts]  = useState(null);
  const [alerts,     setAlerts]     = useState([]);
  const [stageData,  setStageData]  = useState({});
  const [deferidosList, setDeferidosList] = useState([]);
  const [realInfractorAlerts, setRealInfractorAlerts] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [weekEvents, setWeekEvents] = useState([]);   // eventos de hoje a +6 dias (card Agendamentos)
  const [kanbanActive, setKanbanActive] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [expandedStage, setExpandedStage] = useState(null); // 'defesa' | 'inst1' | 'inst2' | 'deferido' | 'real-infractor'

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setCurrentUser(JSON.parse(userData));
    load();
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const today = new Date();
      const plus6 = new Date(); plus6.setDate(today.getDate() + 6);
      const [clientsData, contractsData, stageGroupsData, deferredData, realInfractorData, eventsData, weekData, kanbanData] = await Promise.all([
        getClients().catch(() => []),
        getContractDashboard().catch(() => ({})),
        getStageClients().catch(() => ({})),
        getDeferred().catch(() => []),
        getRealInfractorAlerts().catch(() => []),
        getUpcomingEvents(5).catch(() => []),
        getEventsRange(isoLocal(today), isoLocal(plus6)).catch(() => []),
        getKanbanLeads().catch(() => []),
      ]);
      setClients(clientsData || []);
      setContracts(contractsData?.dashboard || contractsData || {});
      setAlerts(contractsData?.alerts || []);
      setStageData(stageGroupsData || {});
      setDeferidosList(deferredData || []);
      setRealInfractorAlerts(realInfractorData || []);
      setUpcomingEvents(eventsData || []);
      setWeekEvents(weekData || []);
      setKanbanActive((kanbanData || []).length);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Dashboard administrativo: apenas master/admin. Demais veem as boas-vindas.
  // (O supervisor tem sua própria tela "Financeiro da Equipe" na Gestão.)
  if (currentUser && !['master', 'admin', 'super_admin'].includes(currentUser.role)) {
    return <UserHome user={currentUser} />;
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando...</p>
    </div>
  );

  // Contagens de clientes por status
  const fechados    = clients.filter(c => c.status === 'fechado').length;
  const negociando  = clients.filter(c => c.status === 'negociacao').length;
  const totalContracts = parseInt(contracts?.total_contracts) || 0;
  const deferidos      = parseInt(contracts?.deferred_count ?? contracts?.completed_contracts) || 0;
  const venceEm7       = alerts.find(a => a.type === 'warning')?.count || 0;
  // Agendamentos válidos dos próximos 7 dias (exclui cancelados e bloqueios de agenda)
  const agendamentos7  = weekEvents.filter(e => e.status !== 'cancelado' && e.type !== 'bloqueio').length;

  // Contagens por etapa
  const countStage = (keys) => keys.reduce((acc, k) => acc + (stageData[k]?.length || 0), 0);
  const defesaTotal = countStage(['defesa_aprs', 'defesa_analise']);
  const inst1Total  = countStage(['inst1_aprs',  'inst1_analise']);
  const inst2Total  = countStage(['inst2_aprs',  'inst2_analise']);
  const realInfratorTotal = realInfractorAlerts.length;

  const handleStageClick = (key) => {
    setExpandedStage(prev => prev === key ? null : key);
  };

  return (
    <div className="md-layout">

      {/* ── Coluna principal ────────────────────── */}
      <div className="md-main">

        {/* Row 1 — Cards de resumo */}
        <div className="md-summary-grid">
          <SummaryCard
            title="CLIENTES FECHADOS"
            value={fechados}
            subtitle={`de ${clients.length} no total`}
            color="#751518"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
            onClick={() => router.push('/dashboard?module=multas&tab=clients')}
          />
          <SummaryCard
            title="EM NEGOCIAÇÃO"
            value={negociando}
            subtitle="clientes em aberto"
            color="#3b82f6"
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
            onClick={() => router.push('/dashboard?module=multas&tab=clients')}
          />
          <SummaryCard
            title="PRAZOS"
            value={venceEm7}
            subtitle="próximos 7 dias"
            color="#f59e0b"
            onClick={() => router.push('/dashboard?module=multas&tab=calendario')}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
          />
          <SummaryCard
            title="AGENDAMENTOS"
            value={agendamentos7}
            subtitle="próximos 7 dias"
            color="#0891b2"
            onClick={() => router.push('/dashboard?module=multas&tab=eventos')}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
          />
        </div>

        {/* Row 2 — Cards de etapas (clicáveis) */}
        <div className="md-stages-row">
          {Object.entries(STAGE_GROUPS).map(([key, info]) => {
            const count = key === 'defesa' ? defesaTotal : key === 'inst1' ? inst1Total : inst2Total;
            return (
              <StageCard
                key={key}
                groupKey={key}
                info={info}
                count={count}
                active={expandedStage === key}
                onClick={() => handleStageClick(key)}
              />
            );
          })}
          <StageCard
            groupKey="deferido"
            info={DEFERIDO_INFO}
            count={deferidos}
            active={expandedStage === 'deferido'}
            onClick={() => handleStageClick('deferido')}
          />
          <StageCard
            groupKey="real-infractor"
            info={REAL_INFRATOR_INFO}
            count={realInfratorTotal}
            active={expandedStage === 'real-infractor'}
            onClick={() => handleStageClick('real-infractor')}
          />
        </div>

        {/* Painel expandido da etapa */}
        {expandedStage && !['deferido', 'real-infractor'].includes(expandedStage) && (
          <StagePanel
            key={expandedStage}
            groupKey={expandedStage}
            info={STAGE_GROUPS[expandedStage]}
            stageData={stageData}
            onClose={() => setExpandedStage(null)}
          />
        )}
        {expandedStage === 'deferido' && (
          <DeferidosPanel items={deferidosList} onClose={() => setExpandedStage(null)} />
        )}
        {expandedStage === 'real-infractor' && (
          <RealInfractorPanel items={realInfractorAlerts} onClose={() => setExpandedStage(null)} />
        )}

      </div>

      {/* ── Coluna direita ───────────────────────── */}
      <div className="md-sidebar">

        <SectionCard title="Ações Rápidas">
          <div className="md-quick-actions">
            <button className="md-action-btn md-action-primary" onClick={() => router.push('/dashboard?module=multas&tab=clients')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Novo Cliente
            </button>
            <button className="md-action-btn md-action-secondary" onClick={() => router.push('/dashboard?module=multas&tab=leads')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              Ver Leads
            </button>
            <button className="md-action-btn md-action-secondary" onClick={() => router.push('/dashboard?module=multas&tab=calendario')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Prazos
            </button>
            <button className="md-action-btn md-action-secondary" onClick={() => router.push('/dashboard?module=multas&tab=history')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Histórico
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Resumo Geral">
          <div className="md-stages">
            {[
              { label: 'Total de Contratos', value: totalContracts, color: '#475569' },
              { label: 'Clientes',           value: clients.length, color: '#475569' },
              { label: 'Defesa Prévia',      value: defesaTotal,    color: '#6366f1' },
              { label: '1ª Instância',       value: inst1Total,     color: '#f59e0b' },
              { label: '2ª Instância',       value: inst2Total,     color: '#ef4444' },
              { label: 'Real infrator', value: realInfratorTotal, color: '#b45309' },
              { label: 'Tarefas ativas',     value: kanbanActive,   color: '#3b82f6' },
            ].map(({ label, value, color }) => (
              <div key={label} className="md-stage-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="md-stage-dot" style={{ background: color }} />
                  <span className="md-stage-name">{label}</span>
                </div>
                <span className="md-stage-count" style={{ background: `${color}15`, color }}>
                  {value}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Próximos eventos">
          {upcomingEvents.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>Nenhum evento próximo.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcomingEvents.map(ev => (
                <div
                  key={ev.id}
                  style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
                  onClick={() => router.push('/dashboard?module=multas&tab=eventos')}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#751518', marginTop: 6, flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {formatDate(ev.event_date)}{ev.start_time ? ` · ${String(ev.start_time).substring(0,5)}` : ''}{ev.client_name ? ` · ${ev.client_name}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
