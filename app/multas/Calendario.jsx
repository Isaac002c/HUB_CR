'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getDeadlines } from '../lib/contractsAPI';

// ─── Datas (date-only, sem shift de fuso) ───────────────────────────────────────

const parseDateOnly = (v) => {
  if (!v) return null;
  const [y, m, d] = String(v).substring(0, 10).split('-');
  if (!y || !m || !d) return null;
  return new Date(+y, +m - 1, +d, 12, 0, 0);
};

const fmtDate = (v) => {
  const dt = parseDateOnly(v);
  return dt ? dt.toLocaleDateString('pt-BR') : '—';
};

const diffDays = (v) => {
  const dt = parseDateOnly(v);
  if (!dt) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((dt - today) / 86400000);
};

const prazoLabel = (v) => {
  const d = diffDays(v);
  if (d == null) return '';
  if (d === 0) return 'vence hoje';
  if (d < 0)   return `venceu há ${Math.abs(d)} dia${Math.abs(d) !== 1 ? 's' : ''}`;
  return `vence em ${d} dia${d !== 1 ? 's' : ''}`;
};

// Cor por urgência (mantém vermelho p/ vencido, amarelo/laranja p/ próximos)
const urgencyOf = (v, overdue) => {
  const d = diffDays(v);
  if (overdue && d === 0)               return { color: '#ea580c', soft: '#ffedd5' }; // vence hoje
  if (overdue || (d != null && d < 0))  return { color: '#dc2626', soft: '#fee2e2' }; // vencido
  if (d != null && d <= 7)              return { color: '#d97706', soft: '#fef3c7' }; // até 7 dias
  return { color: '#475569', soft: '#f1f5f9' };                                       // mais distante
};

// Abas por urgência (Vencido / Hoje / Até 7 dias / Mais distante)
const TABS = [
  { key: 'vencidos', label: 'Vencidos',      color: '#dc2626', soft: '#fee2e2' },
  { key: 'hoje',     label: 'Vence hoje',    color: '#ea580c', soft: '#ffedd5' },
  { key: 'ate7',     label: 'Até 7 dias',    color: '#d97706', soft: '#fef3c7' },
  { key: 'distante', label: 'Mais distante', color: '#475569', soft: '#f1f5f9' },
];

// ─── Item da agenda ─────────────────────────────────────────────────────────────

function DeadlineItem({ item, overdue, onOpen }) {
  const u = urgencyOf(item.due_date, overdue);
  const meta = [item.numero_multa, item.vehicle_plate, item.organ].filter(Boolean).join(' · ');
  const type = item.real_infractor_type || null;
  const isRealInfractor = Boolean(type);
  const typeBadge = type === 'client'
    ? { label: 'REAL INFRATOR · CLIENTE', color: '#751518', bg: '#fdf2f3' }
    : type === 'company' ? { label: 'REAL INFRATOR · EMPRESA', color: '#751518', bg: '#fdf2f3' } : null;
  const displayName = isRealInfractor && item.real_infractor_name
    ? item.real_infractor_name
    : (item.client_name || 'Cliente');
  return (
    <div className={`ag-item${isRealInfractor ? ' ag-item--real-infractor' : ''}`} onClick={onOpen} role="button" tabIndex={0}>
      <div className="ag-ava" style={{ background: u.soft, color: u.color }}>
        {(displayName || '?').charAt(0).toUpperCase()}
      </div>
      <div className="ag-itembody">
        <div className="ag-name">
          {displayName}
          {typeBadge && (
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: typeBadge.color, background: typeBadge.bg, borderRadius: 6, padding: '1px 6px' }}>
              {typeBadge.label}
            </span>
          )}
        </div>
        {isRealInfractor && item.real_infractor_name && (
          <div className="ag-ri-owner">Cadastro vinculado a: {item.client_name || '—'}</div>
        )}
        <div className="ag-meta">{meta || '—'}</div>
      </div>
      <div className="ag-right">
        <span className="ag-date">{fmtDate(item.due_date)}</span>
        <span className="ag-pill" style={{ background: u.soft, color: u.color }}>{prazoLabel(item.due_date)}</span>
      </div>
    </div>
  );
}

// ─── Seção (lista) ──────────────────────────────────────────────────────────────

function Section({ title, color, soft, items, overdue, emptyText, onOpen }) {
  return (
    <div className="ag-card">
      <div className="ag-card-head" style={{ '--accent': color, '--accent-soft': soft }}>
        <span className="ag-card-dot" />
        <span className="ag-card-title">{title}</span>
        <span className="ag-card-count">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="ag-empty">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          {emptyText}
        </div>
      ) : (
        <div className="ag-list">
          {items.map((it) => (
            <DeadlineItem key={it.id} item={it} overdue={overdue} onOpen={() => onOpen(it)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Linha do resumo (coluna direita) ───────────────────────────────────────────

function ResumoRow({ label, value, color }) {
  return (
    <div className="ag-aside-row">
      <span className="ag-aside-lbl">
        <span className="ag-aside-dot" style={{ background: color }} />
        {label}
      </span>
      <span className="ag-aside-val" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────────

export default function MultasAgenda() {
  const router = useRouter();
  const [overdue, setOverdue]   = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tab, setTab]           = useState('vencidos');
  const [realInfra, setRealInfra] = useState('none'); // none | all
  const [search, setSearch]     = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDeadlines(30);
      setOverdue(data?.overdue || []);
      setUpcoming(data?.upcoming || []);
    } catch (err) {
      setError('Não foi possível carregar os prazos.');
    } finally {
      setLoading(false);
    }
  };

  // Redireciona ao registro/serviço correto — Cliente OU Empresa/Veículo.
  // Usa IDs reais (nunca URL hardcoded). Cliente → detalhe do cliente;
  // Empresa com veículo → detalhe do veículo (onde vivem os processos);
  // Empresa sem veículo → detalhe da empresa.
  const openItem = (it) => {
    if (it?.client_id) { router.push(`/multas/clients/${it.client_id}`); return; }
    if (it?.company_id && it?.vehicle_id) { router.push(`/multas/companies/${it.company_id}/vehicles/${it.vehicle_id}`); return; }
    if (it?.company_id) { router.push(`/multas/companies/${it.company_id}`); return; }
  };

  const allRaw = [...overdue, ...upcoming];

  // Tipo do Real Infrator vem do backend somente quando o serviço do processo é TRI.
  // Um processo comum de cliente/empresa não pode receber esse destaque por inferência.
  const riType = (it) => it.real_infractor_type || null;

  // Busca e destaque do Real Infrator, sem criar filtros separados por cliente/empresa.
  const q = search.trim().toLowerCase();
  const searched = allRaw.filter((it) => {
    if (q) {
      const hay = `${it.real_infractor_name || ''} ${it.client_name || ''} ${it.numero_multa || ''} ${it.vehicle_plate || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = searched.length;
  const realInfractorItems = searched.filter((it) => Boolean(riType(it)));
  const buckets = { vencidos: [], hoje: [], ate7: [], distante: [] };
  for (const it of searched) {
    const d = diffDays(it.due_date);
    if (d == null) continue;
    if (d < 0)        buckets.vencidos.push(it);
    else if (d === 0) buckets.hoje.push(it);
    else if (d <= 7)  buckets.ate7.push(it);
    else              buckets.distante.push(it);
  }
  const activeTabInfo = realInfra === 'all'
    ? { label: 'Real Infrator', color: '#751518', soft: '#fdf2f3' }
    : (TABS.find(t => t.key === tab) || TABS[0]);
  const displayedItems = realInfra === 'all' ? realInfractorItems : buckets[tab];

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 14 }}>
      <div className="loading-spinner" style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#751518' }} />
      <p style={{ color: '#94a3b8', fontSize: 14 }}>Carregando prazos...</p>
    </div>
  );

  return (
    <div className="ag-page">
      <div className="ag-head">
        <div>
          <h2 className="ag-head-title">Prazos</h2>
          <p className="ag-head-sub">Prazos dos processos por urgência (próximos 30 dias).</p>
        </div>
        <button className="ag-refresh" onClick={load} disabled={loading}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Atualizar
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Urgência + destaque único do Real Infrator */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        {TABS.map((t) => {
          const n = buckets[t.key].length;
          const activeTab = realInfra === 'none' && tab === t.key;
          return (
            <button key={t.key} onClick={() => { setTab(t.key); setRealInfra('none'); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: '1px solid ' + (activeTab ? t.color : '#e2e8f0'),
                background: activeTab ? t.soft : '#fff',
                color: activeTab ? t.color : '#64748b',
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
              {t.label}
              <span style={{ fontSize: 11, fontWeight: 700, background: activeTab ? '#fff' : '#f1f5f9', color: t.color, padding: '1px 8px', borderRadius: 999 }}>{n}</span>
            </button>
          );
        })}
        <button onClick={() => setRealInfra(realInfra === 'all' ? 'none' : 'all')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 15px', borderRadius: 999, fontSize: 13, fontWeight: 750, cursor: 'pointer', border: '1px solid #751518', background: realInfra === 'all' ? 'linear-gradient(135deg,#751518,#a72231)' : '#fdf2f3', color: realInfra === 'all' ? '#fff' : '#751518', boxShadow: '0 5px 14px rgba(117,21,24,.12)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: realInfra === 'all' ? '#fff' : '#751518' }} />
          Real Infrator
          <span style={{ fontSize: 11, fontWeight: 800, background: realInfra === 'all' ? 'rgba(255,255,255,.18)' : '#fff', padding: '1px 8px', borderRadius: 999 }}>{realInfractorItems.length}</span>
        </button>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 240, flex: '1 1 300px', marginLeft: 'auto' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, nº do processo ou placa…"
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
        </div>
      </div>

      <div className="md-layout">
        <div className="md-main">
          <div className="ag-card">
            <div className="ag-card-head" style={{ '--accent': activeTabInfo.color, '--accent-soft': activeTabInfo.soft }}>
              <span className="ag-card-dot" />
              <span className="ag-card-title">{activeTabInfo.label}</span>
              <span className="ag-card-count">{displayedItems.length}</span>
            </div>
            {displayedItems.length === 0 ? (
              <div className="ag-empty">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Nenhum prazo nesta categoria.
              </div>
            ) : (
              <div className="ag-list">
                {displayedItems.map(it => (
                  <DeadlineItem key={it.id} item={it} overdue={(diffDays(it.due_date) ?? 1) <= 0} onOpen={() => openItem(it)} />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="md-sidebar">
          <div className="ag-aside-card">
            <div className="ag-aside-title">Resumo</div>
            <ResumoRow label="Vencidos"      value={buckets.vencidos.length} color="#dc2626" />
            <ResumoRow label="Vence hoje"    value={buckets.hoje.length}     color="#ea580c" />
            <ResumoRow label="Até 7 dias"    value={buckets.ate7.length}     color="#d97706" />
            <ResumoRow label="Mais distante" value={buckets.distante.length} color="#475569" />
            <ResumoRow label="Total"         value={total}                   color="#0f172a" />
          </div>
          <div className="ag-aside-card">
            <div className="ag-aside-title">Legenda</div>
            <p className="ag-legend">
              <strong style={{ color: '#dc2626' }}>Vermelho</strong> — vencido<br />
              <strong style={{ color: '#ea580c' }}>Laranja</strong> — vence hoje<br />
              <strong style={{ color: '#d97706' }}>Amarelo</strong> — vence em até 7 dias<br />
              <strong style={{ color: '#475569' }}>Cinza</strong> — mais distante
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
