'use client';

import { useCallback, useEffect, useState } from 'react';
import { getActivityFilterOptions, getActivityLogs } from '../lib/saasAPI';

const EMPTY_FILTERS = {
  user_id: '', module: '', action: '', status: '', days: '30', from: '', to: '', search: '',
};

const ACTION_LABELS = {
  create: 'Criação', update: 'Alteração', delete: 'Exclusão', approve: 'Aprovação', reject: 'Rejeição',
  send_email: 'Envio de e-mail', archive: 'Arquivamento', complete: 'Conclusão', reset: 'Redefinição',
  password_change: 'Alteração de senha', update_password: 'Alteração de senha', status_change: 'Mudança de status',
  stage_change: 'Mudança de etapa', protocol_update: 'Atualização de protocolo', link: 'Vinculação',
  login: 'Entrada no sistema', login_failed: 'Tentativa de login', logout: 'Saída do sistema', register: 'Cadastro',
  rename: 'Renomeação', read: 'Consulta', activity: 'Atividade',
};

const MODULE_LABELS = {
  autenticacao: 'Autenticação', gestao: 'Gestão', clientes: 'Clientes', empresas: 'Empresas', leads: 'Leads',
  tarefas: 'Tarefas', agenda: 'Agenda', aprovacoes: 'Aprovações', processos: 'Processos', documentos: 'Documentos',
  usuarios: 'Usuários', metas: 'Metas', configuracoes: 'Configurações', sistema: 'Sistema',
};

const ENTITY_LABELS = {
  approval: 'Aprovação', calendar_event: 'Evento', client: 'Cliente', collaborator: 'Colaborador',
  collaborator_cost: 'Custo', collaborator_org: 'Organização', collaborator_commission: 'Comissão',
  commission_tier: 'Faixa de comissão', company: 'Empresa', contract: 'Contrato', document: 'Documento',
  fine: 'Processo', forecast: 'Previsão', lead: 'Lead', protocol: 'Protocolo', sale: 'Venda', seller: 'Vendedor',
  service: 'Serviço', session: 'Sessão', target: 'Meta', task: 'Tarefa', team: 'Equipe', upload: 'Arquivo',
  user: 'Usuário', vehicle: 'Veículo',
};

const ROLE_LABELS = { master: 'Master', admin: 'Administrador', supervisor: 'Supervisor', seller: 'Consultor', super_admin: 'Super Admin' };

export default function MultasHistory() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [options, setOptions] = useState({ users: [], modules: [], actions: [], entities: [] });
  const [result, setResult] = useState({ logs: [], total: 0, page: 1, totalPages: 1, stats: {} });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getActivityLogs({ ...filters, page, limit: 30 });
      setResult(data || { logs: [], total: 0, page: 1, totalPages: 1, stats: {} });
    } catch (err) {
      setError(err.message || 'Não foi possível carregar o histórico.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    getActivityFilterOptions().then(setOptions).catch((err) => setError(err.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  const setFilter = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const changePeriod = (value) => {
    setPage(1);
    if (value === 'custom') setFilters((current) => ({ ...current, days: 'custom' }));
    else setFilters((current) => ({ ...current, days: value, from: '', to: '' }));
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setSearchDraft('');
    setPage(1);
  };
  const submitSearch = (event) => {
    event.preventDefault();
    setFilter('search', searchDraft.trim());
  };

  const stats = result.stats || {};
  return (
    <div style={pageStyle}>
      <section style={summaryGrid}>
        <SummaryCard label="Eventos encontrados" value={stats.total ?? result.total ?? 0} tone="#751518" />
        <SummaryCard label="Operações concluídas" value={stats.successful ?? 0} tone="#15803d" />
        <SummaryCard label="Tentativas com falha" value={stats.failed ?? 0} tone="#b91c1c" />
        <SummaryCard label="Usuários no período" value={stats.active_users ?? 0} tone="#1d4ed8" />
      </section>

      <section style={filterCard}>
        <form onSubmit={submitSearch} style={searchRow}>
          <input
            aria-label="Buscar no histórico"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar pessoa, descrição, entidade ou informação alterada..."
            style={searchInput}
          />
          <button className="btn-primary" type="submit">Buscar</button>
          <button className="btn-secondary" type="button" onClick={load}>Atualizar</button>
        </form>

        <div style={filterGrid}>
          <Filter label="Usuário">
            <select value={filters.user_id} onChange={(event) => setFilter('user_id', event.target.value)}>
              <option value="">Todos os usuários</option>
              {options.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {ROLE_LABELS[user.role] || user.role}</option>)}
            </select>
          </Filter>
          <Filter label="Módulo">
            <select value={filters.module} onChange={(event) => setFilter('module', event.target.value)}>
              <option value="">Todos os módulos</option>
              {options.modules.map((module) => <option key={module} value={module}>{MODULE_LABELS[module] || title(module)}</option>)}
            </select>
          </Filter>
          <Filter label="Ação">
            <select value={filters.action} onChange={(event) => setFilter('action', event.target.value)}>
              <option value="">Todas as ações</option>
              {options.actions.map((action) => <option key={action} value={action}>{ACTION_LABELS[action] || title(action)}</option>)}
            </select>
          </Filter>
          <Filter label="Resultado">
            <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
              <option value="">Todos os resultados</option>
              <option value="success">Concluídas</option>
              <option value="failed">Com falha</option>
            </select>
          </Filter>
          <Filter label="Período">
            <select value={filters.days} onChange={(event) => changePeriod(event.target.value)}>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="365">Último ano</option>
              <option value="">Todo o histórico</option>
              <option value="custom">Personalizado</option>
            </select>
          </Filter>
          {filters.days === 'custom' && <>
            <Filter label="Data inicial"><input type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} /></Filter>
            <Filter label="Data final"><input type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} /></Filter>
          </>}
          <button className="btn-secondary" type="button" onClick={clearFilters} style={{ alignSelf: 'end', minHeight: 42 }}>Limpar filtros</button>
        </div>
      </section>

      {error && <div className="error-message">{error}</div>}

      <div style={listHeader}>
        <div><strong style={{ color: '#172033' }}>{result.total || 0}</strong> <span style={muted}>evento(s)</span></div>
        <span style={muted}>Clique em um registro para ver todos os detalhes</span>
      </div>

      {loading ? <Loading /> : result.logs.length === 0 ? <Empty /> : (
        <div className="activity-list">
          {result.logs.map((event) => <AuditRow key={event.id} event={event} onOpen={() => setSelected(event)} />)}
        </div>
      )}

      {result.totalPages > 1 && <div className="pagination">
        <button className="btn-pagination" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Anterior</button>
        <span className="page-info">Página {page} de {result.totalPages}</span>
        <button className="btn-pagination" disabled={page >= result.totalPages || loading} onClick={() => setPage((current) => current + 1)}>Próxima →</button>
      </div>}

      {selected && <DetailModal event={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function AuditRow({ event, onOpen }) {
  const action = ACTION_LABELS[event.action] || title(event.action);
  const moduleLabel = MODULE_LABELS[event.module] || title(event.module);
  const user = event.user_name || event.entity_name || 'Sistema';
  const colors = event.success ? actionColor(event.action) : { fg: '#b91c1c', bg: '#fef2f2' };
  return (
    <button type="button" className="activity-card" onClick={onOpen} style={{ width: '100%', textAlign: 'left', font: 'inherit' }}>
      <div className="activity-icon" style={{ background: colors.bg, color: colors.fg, fontWeight: 800 }}>{action.substring(0, 1)}</div>
      <div className="activity-content">
        <div className="activity-header" style={{ flexWrap: 'wrap' }}>
          <span className="activity-action" style={{ color: colors.fg }}>{action}</span>
          <span className="activity-entity">{moduleLabel}</span>
          <span style={event.success ? successBadge : failureBadge}>{event.success ? 'Concluída' : `Falhou · ${event.status_code || ''}`}</span>
        </div>
        <div className="activity-description">{event.description}</div>
        <div className="activity-meta" style={{ flexWrap: 'wrap' }}>
          <span style={{ color: '#475569', fontWeight: 650 }}>{user}</span>
          {event.user_email && <span>{event.user_email}</span>}
          <span>{formatDateTime(event.created_at)}</span>
          {event.entity && <span>{ENTITY_LABELS[event.entity] || title(event.entity)}{event.entity_name ? ` · ${event.entity_name}` : ''}</span>}
        </div>
      </div>
      <span className="activity-arrow">›</span>
    </button>
  );
}

function DetailModal({ event, onClose }) {
  const metadata = normalizeMetadata(event.metadata);
  const request = metadata.request && typeof metadata.request === 'object' ? metadata.request : null;
  const query = metadata.query && Object.keys(metadata.query).length ? metadata.query : null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 780, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div><h2 style={{ fontSize: 19, margin: 0 }}>Detalhes da atividade</h2><p style={{ ...muted, margin: '4px 0 0' }}>{formatDateTime(event.created_at)}</p></div>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={detailHero}>
            <div><span style={event.success ? successBadge : failureBadge}>{event.success ? 'Operação concluída' : 'Operação com falha'}</span><h3 style={{ margin: '10px 0 4px', color: '#172033' }}>{event.description}</h3><span style={muted}>{ACTION_LABELS[event.action] || title(event.action)} em {MODULE_LABELS[event.module] || title(event.module)}</span></div>
          </div>

          <DetailSection title="Responsável">
            <DetailGrid items={[
              ['Nome', event.user_name || 'Sistema / não identificado'],
              ['E-mail', event.user_email || '—'],
              ['Perfil', ROLE_LABELS[event.user_role] || event.user_role || '—'],
              ['Usuário ID', event.user_id || '—'],
            ]} />
          </DetailSection>

          <DetailSection title="Objeto da operação">
            <DetailGrid items={[
              ['Módulo', MODULE_LABELS[event.module] || title(event.module)],
              ['Tipo', ENTITY_LABELS[event.entity] || title(event.entity) || '—'],
              ['Identificação', event.entity_name || '—'],
              ['Registro ID', event.entity_id || '—'],
            ]} />
          </DetailSection>

          {request && Object.keys(request).length > 0 && <DetailSection title="Dados da operação"><MetadataView value={request} /></DetailSection>}
          {query && <DetailSection title="Parâmetros"><MetadataView value={query} /></DetailSection>}
          {metadata.response && <DetailSection title="Resposta"><MetadataView value={metadata.response} /></DetailSection>}

          <DetailSection title="Informações técnicas">
            <DetailGrid items={[
              ['Método', event.method || '—'], ['Rota', event.path || '—'],
              ['Status HTTP', event.status_code || '—'], ['Tempo', metadata.duration_ms !== undefined ? `${metadata.duration_ms} ms` : '—'],
              ['Endereço IP', event.ip_address || '—'], ['Origem', event.source === 'legacy' ? 'Registro anterior' : 'Auditoria automática'],
            ]} />
            {event.user_agent && <div style={{ marginTop: 12 }}><span style={detailLabel}>Dispositivo / navegador</span><div style={technicalValue}>{event.user_agent}</div></div>}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

function MetadataView({ value }) {
  return <div style={metadataGrid}>{Object.entries(value).map(([key, item]) => <div key={key} style={metadataItem}><span style={detailLabel}>{fieldLabel(key)}</span><div style={technicalValue}>{displayValue(item)}</div></div>)}</div>;
}

function DetailGrid({ items }) {
  return <div style={detailGrid}>{items.map(([label, value]) => <div key={label}><span style={detailLabel}>{label}</span><div style={technicalValue}>{String(value)}</div></div>)}</div>;
}

function DetailSection({ title: sectionTitle, children }) {
  return <section style={detailSection}><h4 style={{ margin: '0 0 12px', color: '#334155', fontSize: 14 }}>{sectionTitle}</h4>{children}</section>;
}

function Filter({ label, children }) { return <label style={filterField}><span>{label}</span>{children}</label>; }
function SummaryCard({ label, value, tone }) { return <div style={{ ...summaryCard, borderTop: `3px solid ${tone}` }}><strong style={{ fontSize: 25, color: tone }}>{value}</strong><span style={muted}>{label}</span></div>; }
function Loading() { return <div className="loading-container"><div className="loading-spinner" /><p>Carregando auditoria...</p></div>; }
function Empty() { return <div style={emptyStyle}><strong>Nenhuma atividade encontrada</strong><span>Altere ou limpe os filtros para consultar outros registros.</span></div>; }

function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return { detalhes: value }; }
}
function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
function fieldLabel(key) {
  const labels = { amount: 'Valor', status: 'Status', name: 'Nome', title: 'Título', description: 'Descrição', email: 'E-mail', role: 'Perfil', team_id: 'Equipe', seller_id: 'Vendedor', collaborator_id: 'Colaborador', commission_percentage: 'Comissão (%)', commission_threshold: 'Gatilho da comissão', monthly_sales_target: 'Meta mensal', customer_name: 'Cliente', service_name: 'Serviço', payment_method: 'Forma de pagamento', closing_method: 'Forma de fechamento', category: 'Categoria', competence: 'Competência', recurring: 'Recorrente', is_active: 'Ativo' };
  return labels[key] || title(key);
}
function formatDateTime(value) { return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) : '—'; }
function title(value = '') { return String(value).replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function actionColor(action) {
  if (['delete', 'reject'].includes(action)) return { fg: '#b91c1c', bg: '#fef2f2' };
  if (['create', 'approve', 'complete', 'login'].includes(action)) return { fg: '#15803d', bg: '#f0fdf4' };
  if (['status_change', 'stage_change', 'update', 'protocol_update'].includes(action)) return { fg: '#1d4ed8', bg: '#eff6ff' };
  return { fg: '#7c3aed', bg: '#f5f3ff' };
}

const pageStyle = { display: 'flex', flexDirection: 'column', gap: 18 };
const summaryGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 };
const summaryCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 4 };
const filterCard = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 16 };
const searchRow = { display: 'flex', flexWrap: 'wrap', gap: 10 };
const searchInput = { minWidth: 220, flex: '1 1 340px', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 13px', fontSize: 14 };
const filterGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))', gap: 12, alignItems: 'end' };
const filterField = { display: 'flex', flexDirection: 'column', gap: 6, color: '#64748b', fontSize: 11, fontWeight: 750, textTransform: 'uppercase' };
const listHeader = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '0 2px' };
const muted = { color: '#64748b', fontSize: 13 };
const successBadge = { background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 750 };
const failureBadge = { background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: 999, fontSize: 11, fontWeight: 750 };
const detailHero = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 };
const detailSection = { borderTop: '1px solid #e2e8f0', paddingTop: 16 };
const detailGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 };
const metadataGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 };
const metadataItem = { background: '#f8fafc', borderRadius: 8, padding: 10, minWidth: 0 };
const detailLabel = { display: 'block', color: '#94a3b8', fontSize: 10, textTransform: 'uppercase', fontWeight: 750, marginBottom: 4 };
const technicalValue = { color: '#334155', fontSize: 13, fontFamily: 'inherit', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' };
const emptyStyle = { padding: 54, background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, color: '#64748b', textAlign: 'center' };
