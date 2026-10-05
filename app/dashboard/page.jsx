'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';

// Leads
import LeadsOverview     from '../leads/Overview';
import LeadsAcquisition  from '../leads/Acquisition';
import LeadsPipeline     from '../leads/Pipeline';
import LeadsLeaderboard  from '../leads/Leaderboard';
import LeadsExport       from '../leads/Export';
import LeadsPerformance  from '../leads/Performance';
import LeadsReports      from '../leads/Reports';

// Multas
import MultasDashboard from '../multas/Dashboard';
import MultasClients   from '../multas/Clients';
import MultasCompanies from '../multas/Companies';
import MultasDeferidos from '../multas/Deferidos';
import CalendarioEventos from '../multas/CalendarioEventos';
import MultasHistory   from '../multas/History';
import MultasLeads     from '../multas/Leads';
import MultasLeadsList from '../multas/LeadsList';
import MultasTarefas   from '../multas/Tarefas';
import MultasApprovals from '../multas/Approvals';
import MultasAgenda    from '../multas/Calendario';
import MultasUserHome  from '../multas/UserHome';

// Gestão
import GestaoVisaoGeral   from '../gestao/VisaoGeral';
import GestaoColaboradores from '../gestao/Colaboradores';
import GestaoEquipes       from '../gestao/Equipes';
import GestaoVendas        from '../gestao/Vendas';
import GestaoComissoes     from '../gestao/Comissoes';
import GestaoFinEquipe     from '../gestao/FinanceiroEquipe';

// Settings
import SettingsPage from '../settings/page';
import EmailSettings from '../settings/Emails';

// Matriz de acesso (mesma regra do backend)
import { getMyAccess } from '../lib/managementAPI';
import { accessMapFor, levelOf, defaultLandingFor } from '../lib/access';

const ComingSoon = ({ moduleName }) => (
  <div className="coming-soon">
    <div style={{ marginBottom: 20 }}>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </div>
    <h2>{moduleName}</h2>
    <p>Esta seção está em desenvolvimento</p>
  </div>
);

// Mapa de qual MÓDULO da matriz protege cada aba (para guarda no frontend).
const TAB_MODULE = {
  inicio: 'clients',
  dashboard: 'dashboard', clients: 'clients', companies: 'companies', leads: 'leads',
  tarefas: 'tarefas', approvals: 'approvals', history: 'history', calendario: 'prazos',
  eventos: 'agenda', deferidos: 'deferidos',
  visaogeral: 'gestao', colaboradores: 'gestao', equipes: 'gestao', vendas: 'gestao',
  comissoes: 'gestao', finequipe: 'gestao',
  emails: 'settings',
};

const TAB_ROLES = {
  inicio: ['seller', 'operator', 'viewer'],
  finequipe: ['supervisor'],
  equipes: ['master', 'admin'],
  comissoes: ['master'],
  emails: ['master', 'admin'],
};

const modulePages = {
  gestao: {
    pages: {
      finequipe:     GestaoFinEquipe,
      visaogeral:    GestaoVisaoGeral,
      colaboradores: GestaoColaboradores,
      equipes:       GestaoEquipes,
      vendas:        GestaoVendas,
      comissoes:     GestaoComissoes,
    },
  },
  leads: {
    pages: {
      overview:    LeadsOverview,
      acquisition: LeadsAcquisition,
      pipeline:    LeadsPipeline,
      leaderboard: LeadsLeaderboard,
      export:      LeadsExport,
      performance: LeadsPerformance,
      reports:     LeadsReports,
    },
  },
  multas: {
    pages: {
      inicio:     MultasUserHome,
      dashboard:  MultasDashboard,
      clients:    MultasClients,
      companies:  MultasCompanies,
      leads:      MultasLeadsList,
      tarefas:    MultasTarefas,
      approvals:  MultasApprovals,
      history:    MultasHistory,
      calendario: MultasAgenda,
      eventos:    CalendarioEventos,
      deferidos:  MultasDeferidos,
      // legacy / coming-soon
      defesa:     () => <ComingSoon moduleName="Defesa Prévia" />,
      instancia1: () => <ComingSoon moduleName="1ª Instância" />,
      instancia2: () => <ComingSoon moduleName="2ª Instância" />,
      documents:  () => <ComingSoon moduleName="Documentos" />,
    },
  },
  settings: {
    pages: {
      general:      SettingsPage,
      emails:       EmailSettings,
      team:         () => <ComingSoon moduleName="Equipe" />,
      integrations: () => <ComingSoon moduleName="Integrações" />,
    },
  },
};

const getDefaultTab = (module) => {
  const defaults = { leads: 'overview', multas: 'dashboard', settings: 'general', gestao: 'visaogeral' };
  return defaults[module] || 'overview';
};

function CachedTabs({ moduleKey, activeTab, user }) {
  const moduleData = modulePages[moduleKey] || modulePages.leads;
  const mountedRef = useRef({});

  return (
    <>
      {Object.entries(moduleData.pages).map(([key, Page]) => {
        const isActive = key === activeTab;
        if (!isActive && !mountedRef.current[key]) return null;
        mountedRef.current[key] = true;
        return (
          <div key={key} style={{ display: isActive ? 'block' : 'none' }}>
            <Page user={user} />
          </div>
        );
      })}
    </>
  );
}

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser]       = useState(null);
  const [tenant, setTenant]   = useState(null);
  const [access, setAccess]   = useState(null); // matriz de acesso (módulo -> nível)
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const currentModule = searchParams.get('module') || 'multas';
  const activeTab     = searchParams.get('tab')    || getDefaultTab(currentModule);

  useEffect(() => {
    // Aceita token de localStorage (primário) ou cookie (fallback)
    const lsToken    = localStorage.getItem('auth-token') || localStorage.getItem('token');
    const cookieTok  = document.cookie.includes('auth-token');
    const hasToken   = !!(lsToken || cookieTok);
    const userData   = localStorage.getItem('user');
    const tenantData = localStorage.getItem('tenant');
    if (!hasToken || !userData) { router.push('/login'); return; }
    const parsedUser = JSON.parse(userData);
    // O super_admin não usa o dashboard de tenant — vai para o painel global.
    if (parsedUser?.role === 'super_admin') { router.replace('/master'); return; }
    setUser(parsedUser);
    setTenant(JSON.parse(tenantData || '{}'));
    // Fallback imediato pela role; o backend confirma logo em seguida (autoritativo).
    setAccess(accessMapFor(parsedUser?.role));
    setLoading(false);
    getMyAccess()
      .then((a) => { if (a?.access) { setAccess(a.access); if (a.role && a.role !== parsedUser.role) { const u = { ...parsedUser, role: a.role, teamId: a.teamId }; setUser(u); localStorage.setItem('user', JSON.stringify(u)); } } })
      .catch(() => {});
  }, [router]);

  // Guarda de aba: se o perfil não tem acesso à aba atual, manda para a landing padrão.
  // (O menu já esconde; isto cobre acesso por URL direta — o backend também bloqueia.)
  useEffect(() => {
    if (!user || !access) return;
    const mod = TAB_MODULE[activeTab];
    const roleAllowed = !TAB_ROLES[activeTab] || TAB_ROLES[activeTab].includes(String(user.role || '').toLowerCase());
    if ((mod && levelOf(access, mod) === 'none') || !roleAllowed) {
      const land = defaultLandingFor(user.role);
      router.replace(`/dashboard?module=${land.module}&tab=${land.tab}`);
    }
  }, [user, access, activeTab, router]);

  const handleLogout = async () => {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
    finally {
      ['user', 'tenant', 'token', 'auth-token', 'tenantId', 'tenant-id'].forEach(k => localStorage.removeItem(k));
      ['token', 'auth-token', 'tenantId'].forEach(k => {
        document.cookie = `${k}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC`;
      });
      router.push('/login');
    }
  };

  const handleNavigate = (moduleKey, tabKey) => {
    setMobileSidebarOpen(false);
    router.push(`/dashboard?module=${moduleKey}&tab=${tabKey}`);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Carregando CR Recursos...</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div
          className="sidebar-mobile-overlay"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        currentModule={currentModule}
        currentTab={activeTab}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(v => !v)}
        mobileOpen={mobileSidebarOpen}
        user={user}
        tenant={tenant}
        access={access}
      />

      <div className={`shell-main${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
        <PageHeader
          currentTab={activeTab}
          user={user}
          tenant={tenant}
          onLogout={handleLogout}
          onMobileMenuToggle={() => setMobileSidebarOpen(v => !v)}
        />
        <div className="shell-content">
          <CachedTabs moduleKey={currentModule} activeTab={activeTab} user={user} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Carregando...</p>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
