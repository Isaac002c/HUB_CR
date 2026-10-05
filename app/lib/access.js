// Espelho FRONTEND da matriz de acesso (mesma regra do backend).
// A fonte de verdade é o backend (GET /api/me/access); isto é fallback/UX.
// Ocultar item de menu é só UX — o bloqueio real acontece no backend.

export const MODULES = [
  'gestao', 'financeiro', 'dashboard', 'clients', 'companies', 'leads',
  'tarefas', 'deferidos', 'prazos', 'agenda', 'history', 'approvals', 'settings',
];

const ALL_FULL = MODULES.reduce((a, m) => { a[m] = 'full'; return a; }, {});

const ACCESS = {
  master:      { ...ALL_FULL },
  super_admin: { ...ALL_FULL },
  admin: {
    gestao: 'none', financeiro: 'none', dashboard: 'full',
    clients: 'full', companies: 'full', leads: 'none', tarefas: 'none',
    deferidos: 'full', prazos: 'full', agenda: 'full',
    history: 'none', approvals: 'none', settings: 'none',
  },
  supervisor: {
    gestao: 'team', financeiro: 'team', dashboard: 'none',
    clients: 'full', companies: 'team', leads: 'team', tarefas: 'team',
    deferidos: 'full', prazos: 'none', agenda: 'full',
    history: 'none', approvals: 'team', settings: 'own',
  },
  seller: {
    gestao: 'own', financeiro: 'none', dashboard: 'none',
    clients: 'own', companies: 'own', leads: 'own', tarefas: 'own',
    deferidos: 'full', prazos: 'none', agenda: 'full',
    history: 'none', approvals: 'none', settings: 'own',
  },
};

const LEGACY = { manager: ACCESS.admin, operator: ACCESS.seller, viewer: ACCESS.seller };

export function accessMapFor(role) {
  const r = String(role || 'seller').toLowerCase();
  return ACCESS[r] || LEGACY[r] || ACCESS.seller;
}

export function levelOf(accessMap, moduleName) {
  return (accessMap && accessMap[moduleName]) || 'none';
}

export function canAccess(accessMap, moduleName) {
  return levelOf(accessMap, moduleName) !== 'none';
}

// Aba inicial conforme o perfil (consultor começa pela recepção de Processos).
export function defaultLandingFor(role) {
  const r = String(role || 'seller').toLowerCase();
  if (r === 'supervisor') return { module: 'gestao', tab: 'finequipe' };
  if (r === 'seller' || r === 'operator' || r === 'viewer') return { module: 'multas', tab: 'inicio' };
  return { module: 'multas', tab: 'dashboard' };
}

// Papel legível para badges
export const ROLE_LABEL = {
  master: 'MASTER', admin: 'ADM', supervisor: 'SUPERVISOR',
  seller: 'CONSULTOR', super_admin: 'SUPER ADMIN',
  manager: 'GERENTE', operator: 'OPERADOR', viewer: 'VISUALIZADOR',
};
