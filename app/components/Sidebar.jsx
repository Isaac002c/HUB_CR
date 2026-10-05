'use client';

import { useState } from 'react';
import Image from 'next/image';
import { levelOf } from '../lib/access';

const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  Clients: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  Building: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18"/><path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/>
      <path d="M19 21V9l-4-2"/>
      <line x1="9" y1="7" x2="11" y2="7"/><line x1="9" y1="11" x2="11" y2="11"/><line x1="9" y1="15" x2="11" y2="15"/>
    </svg>
  ),
  Shield: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  Clock: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  Calendar: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  CalEvent: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <circle cx="12" cy="15" r="1.6" fill="currentColor"/>
    </svg>
  ),
  Settings: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 0-14.14 0M4.93 19.07a10 10 0 0 0 14.14 0M2 12h2M20 12h2M12 2v2M12 20v2"/>
    </svg>
  ),
  ChevronLeft: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  ChevronRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  Target: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  Tasks: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
      <polyline points="9 16 11 18 15 14"/>
    </svg>
  ),
  Approvals: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  TrendingUp: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  BarChart: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
    </svg>
  ),
  Award: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="7"/>
      <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>
    </svg>
  ),
  Download: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  File: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  Layers: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2"/>
      <polyline points="2 17 12 22 22 17"/>
      <polyline points="2 12 12 17 22 12"/>
    </svg>
  ),
  Mail: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22 6 12 13 2 6"/>
    </svg>
  ),
};

// Itens com `module` são filtrados pela MATRIZ DE ACESSO (mesma regra do backend).
// `levels` (opcional) restringe a quais níveis (full/team/own) o item aparece.
// Ocultar é só UX — o backend bloqueia de verdade.
const sidebarConfig = {
  gestao: {
    label: 'Gestão',
    items: [
      { key: 'finequipe',    label: 'Financeiro da Equipe', Icon: Icons.BarChart,   tab: 'finequipe',   module: 'gestao', levels: ['team'], roles: ['supervisor'] },
      { key: 'visaogeral',   label: 'Visão Geral',          Icon: Icons.Dashboard,  tab: 'visaogeral',  module: 'gestao', levels: ['full', 'own'] },
      { key: 'colaboradores',label: 'Colaboradores',        Icon: Icons.Clients,    tab: 'colaboradores', module: 'gestao', levels: ['full', 'team'] },
      { key: 'equipes',      label: 'Equipes',              Icon: Icons.Layers,     tab: 'equipes',     module: 'gestao', levels: ['full'], roles: ['master', 'admin'] },
      { key: 'vendas',       label: 'Vendas',               Icon: Icons.TrendingUp, tab: 'vendas',      module: 'gestao' },
      { key: 'comissoes',    label: 'Financeiro',            Icon: Icons.Award,      tab: 'comissoes',   module: 'gestao', roles: ['master'] },
    ],
  },
  multas: {
    label: 'CR Recursos',
    items: [
      { key: 'inicio',     label: 'Início',     Icon: Icons.Dashboard,  tab: 'inicio',     module: 'clients', levels: ['own'], roles: ['seller', 'operator', 'viewer'] },
      { key: 'dashboard',  label: 'Dashboard',  Icon: Icons.Dashboard,  tab: 'dashboard',  module: 'dashboard' },
      { key: 'clients',    label: 'Clientes',   Icon: Icons.Clients,    tab: 'clients',    module: 'clients' },
      { key: 'companies',  label: 'Empresas',   Icon: Icons.Building,   tab: 'companies',  module: 'companies' },
      { key: 'deferidos',  label: 'Deferidos',  Icon: Icons.Award,      tab: 'deferidos',  module: 'deferidos' },
      { key: 'leads',      label: 'Leads',      Icon: Icons.Target,     tab: 'leads',      module: 'leads' },
      { key: 'tarefas',    label: 'Tarefas',    Icon: Icons.Tasks,      tab: 'tarefas',    module: 'tarefas' },
      { key: 'calendario', label: 'Prazos',     Icon: Icons.Calendar,   tab: 'calendario', module: 'prazos' },
      { key: 'eventos',    label: 'Agenda',     Icon: Icons.CalEvent,   tab: 'eventos',    module: 'agenda' },
      { key: 'history',    label: 'Histórico',  Icon: Icons.Clock,      tab: 'history',    module: 'history' },
      { key: 'approvals',  label: 'Aprovações', Icon: Icons.Approvals,  tab: 'approvals',  module: 'approvals' },
    ],
  },
  leads: {
    label: 'Gestão de Leads',
    items: [
      { key: 'overview',    label: 'Overview',    Icon: Icons.Dashboard,  tab: 'overview' },
      { key: 'acquisition', label: 'Aquisição',   Icon: Icons.Target,     tab: 'acquisition' },
      { key: 'pipeline',    label: 'Pipeline',    Icon: Icons.TrendingUp, tab: 'pipeline' },
      { key: 'leaderboard', label: 'Ranking',     Icon: Icons.Award,      tab: 'leaderboard' },
      { key: 'performance', label: 'Performance', Icon: Icons.BarChart,   tab: 'performance' },
      { key: 'export',      label: 'Exportar',    Icon: Icons.Download,   tab: 'export' },
      { key: 'reports',     label: 'Relatórios',  Icon: Icons.File,       tab: 'reports' },
    ],
  },
  settings: {
    label: 'Configurações',
    items: [
      { key: 'general',      label: 'Geral',       Icon: Icons.Settings, tab: 'general' },
      { key: 'emails',       label: 'E-mails',     Icon: Icons.Mail,     tab: 'emails', module: 'settings', roles: ['master', 'admin'] },
      { key: 'team',         label: 'Equipe',      Icon: Icons.Clients,  tab: 'team' },
      { key: 'integrations', label: 'Integrações', Icon: Icons.Layers,   tab: 'integrations' },
    ],
  },
};

const modules = [
  { key: 'multas', label: 'Processos', module: null },
  { key: 'gestao', label: 'Gestão',    module: 'gestao' },
];

// Mapa de fallback para sessões antigas (sem slug/logo_url no localStorage)
const TENANT_DEFAULTS = {
  'carioca-multas': { brand_color: '#4B2882', logo_url: '/logos/carioca-multas.svg', tagline: 'Assessoria de Trânsito' },
  'cr-recursos':    { brand_color: '#751518', logo_url: '/logos/cr-recursos.png',    tagline: 'Assessoria de Trânsito' },
};

function deriveSlug(name) {
  return (name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-');
}

function TenantLogo({ collapsed, tenant }) {
  const name    = tenant?.name || 'Sistema';
  const slug    = tenant?.slug || deriveSlug(name);
  const defaults = TENANT_DEFAULTS[slug] || {};
  const logoUrl = tenant?.logo_url || defaults.logo_url || null;
  const tagline = tenant?.tagline  || defaults.tagline  || 'Sistema de Gestão';
  const brandColor = tenant?.brand_color || defaults.brand_color || '#751518';
  const initial = name.charAt(0).toUpperCase();

  // CR Recursos: a logo é um lockup completo (símbolo + nome "CR RECURSOS /
  // ASSESSORIA DE TRÂNSITO" em branco, vazado). Por isso exibimos SOMENTE a logo,
  // centralizada, sem o texto HTML ao lado (evita duplicar a marca) e sem
  // card/box/fundo. Afeta somente este tenant.
  const isCrRecursos = slug === 'cr-recursos';
  if (isCrRecursos && logoUrl) {
    return (
      <div className={`sidebar-logo sidebar-logo--cr${collapsed ? ' is-collapsed' : ''}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={name}
          className="cr-recursos-logo-img"
          onError={e => {
            e.currentTarget.style.display = 'none';
            e.currentTarget.nextElementSibling.style.display = 'flex';
          }}
        />
        <div className="cr-recursos-logo-fallback">{initial}</div>
      </div>
    );
  }

  return (
    <div className="sidebar-logo">
      <div className="cr-logo-icon" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={logoUrl}
            alt={name}
            style={{ height: collapsed ? 28 : 34, width: 'auto', objectFit: 'contain', borderRadius: '6px' }}
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling.style.display = 'flex';
            }}
          />
        ) : null}
        {/* Fallback: initial letter */}
        <div style={{
          display: logoUrl ? 'none' : 'flex',
          width: collapsed ? 28 : 34,
          height: collapsed ? 28 : 34,
          borderRadius: '8px',
          background: brandColor,
          color: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: collapsed ? 14 : 16,
          fontWeight: 800,
          flexShrink: 0,
        }}>
          {initial}
        </div>
      </div>
      {!collapsed && (
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">{name}</span>
          <span className="sidebar-brand-sub">{tagline}</span>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ currentModule, currentTab, onNavigate, collapsed, onToggleCollapse, mobileOpen, user, tenant, access }) {
  const config   = sidebarConfig[currentModule] || sidebarConfig.multas;
  const tenantSlug = tenant?.slug || deriveSlug(tenant?.name) || 'default';
  const userRole = String(user?.role || '').toLowerCase();

  // Filtra itens pela MATRIZ DE ACESSO (backend é a fonte de verdade; isto é UX).
  const visibleItems = config.items.filter(item => {
    if (!item.module) return true;
    const lvl = levelOf(access, item.module);
    if (lvl === 'none') return false;
    if (item.levels && !item.levels.includes(lvl)) return false;
    if (item.roles && !item.roles.includes(userRole)) return false;
    return true;
  });

  // Módulos visíveis no seletor (Processos sempre; Gestão conforme acesso)
  const visibleModules = modules.filter(m => !m.module || levelOf(access, m.module) !== 'none');

  const classes = [
    'sidebar',
    collapsed ? 'sidebar-collapsed' : '',
    mobileOpen ? 'sidebar-mobile-open' : '',
    `tenant-${tenantSlug}`,
  ].filter(Boolean).join(' ');

  return (
    <aside className={classes}>
      <TenantLogo collapsed={collapsed} tenant={tenant} />

      {collapsed && <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />}

      {!collapsed && visibleModules.length > 1 && (
        <div className="sidebar-modules">
          {visibleModules.map(m => {
            const items = (sidebarConfig[m.key]?.items || []).filter(it => {
              if (!it.module) return true;
              const lvl = levelOf(access, it.module);
              if (lvl === 'none') return false;
              if (it.levels && !it.levels.includes(lvl)) return false;
              if (it.roles && !it.roles.includes(userRole)) return false;
              return true;
            });
            const firstTab = items[0]?.tab || 'dashboard';
            return (
              <button
                key={m.key}
                className={`sidebar-module-btn${currentModule === m.key ? ' active' : ''}`}
                onClick={() => onNavigate(m.key, firstTab)}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="sidebar-divider" />

      <nav className="sidebar-nav">
        {!collapsed && <span className="sidebar-section-label">NAVEGAÇÃO</span>}
        {visibleItems.map(item => {
          const isActive = currentTab === item.tab;
          return (
            <button
              key={item.key}
              className={`sidebar-item${isActive ? ' active' : ''}`}
              onClick={() => onNavigate(currentModule, item.tab)}
              title={collapsed ? item.label : undefined}
            >
              <span className="sidebar-item-icon"><item.Icon /></span>
              {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {currentModule !== 'settings' && levelOf(access, 'settings') !== 'none' && (
        <>
          <div className="sidebar-divider" />
          <button
            className="sidebar-item sidebar-item-settings"
            onClick={() => onNavigate('settings', 'general')}
            title={collapsed ? 'Configurações' : undefined}
          >
            <span className="sidebar-item-icon"><Icons.Settings /></span>
            {!collapsed && <span className="sidebar-item-label">Configurações</span>}
          </button>
        </>
      )}

      <div className="sidebar-footer">
        {!collapsed && <div className="sidebar-footer-support"><span className="sidebar-footer-label"><Icons.Mail /> CR Recursos</span></div>}
        <button
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <Icons.ChevronRight /> : <Icons.ChevronLeft />}
        </button>
      </div>
    </aside>
  );
}
