// ============================================================================
// config/accessControl.js
// FONTE ÚNICA DE VERDADE da matriz de permissões por MÓDULO.
// Usada pelo backend (middlewares/authorize.js) E exposta ao frontend
// (GET /api/me/access) para que menu e telas sigam EXATAMENTE a mesma regra.
//
// Níveis de acesso por módulo:
//   'full' → todos os dados do tenant
//   'team' → apenas a equipe do usuário (supervisor)
//   'own'  → apenas o que o usuário criou (consultor)
//   'none' → sem acesso  (menu escondido + API responde 403)
//
// Perfis operacionais do TENANT: master, admin, supervisor, seller (=consultor).
// super_admin = administração global da instalação — NÃO é o Master do tenant.
// ============================================================================

const MODULES = [
  'gestao',      // módulo Gestão (comercial/gerencial)
  'financeiro',  // visões financeiras
  'dashboard',   // dashboard administrativo tradicional
  'clients',     // Clientes
  'companies',   // Empresas
  'leads',       // Leads
  'tarefas',     // Tarefas (multas-leads)
  'deferidos',   // Deferidos (EXCEÇÃO: leitura global)
  'prazos',      // Prazos (contracts/deadlines)
  'agenda',      // Agenda (calendar-events) (EXCEÇÃO: leitura global)
  'history',     // Histórico (activity logs)
  'approvals',   // Aprovações
  'settings',    // Configurações
];

// full em todos os módulos
const ALL_FULL = MODULES.reduce((acc, m) => { acc[m] = 'full'; return acc; }, {});

const ACCESS = {
  // MASTER — acesso integral ao tenant
  master: { ...ALL_FULL },

  // super_admin (SaaS) — mantém acesso integral caso caia numa rota de tenant
  super_admin: { ...ALL_FULL },

  // ADM — atua somente na operação de processos. Não acessa Gestão,
  // financeiro, histórico, configurações ou aprovações.
  admin: {
    gestao: 'none', financeiro: 'none', dashboard: 'full',
    clients: 'full', companies: 'full', leads: 'none', tarefas: 'none',
    deferidos: 'full', prazos: 'full', agenda: 'full',
    history: 'none', approvals: 'none', settings: 'none',
  },

  // SUPERVISOR — escopo de equipe. SEM Dashboard tradicional, Prazos, Histórico.
  // No lugar do Dashboard: "Financeiro da Equipe" (dentro de Gestão).
  supervisor: {
    gestao: 'team', financeiro: 'team', dashboard: 'none',
    // A supervisão atende a carteira inteira de clientes da empresa.
    clients: 'full', companies: 'team', leads: 'team', tarefas: 'team',
    deferidos: 'full', prazos: 'none', agenda: 'full',
    // Aprova somente as solicitações abertas por colaboradores da própria equipe.
    history: 'none', approvals: 'team', settings: 'own',
  },

  // SELLER = CONSULTOR — só o que criou. EXCEÇÕES globais: Deferidos e Agenda.
  seller: {
    gestao: 'own', financeiro: 'none', dashboard: 'none',
    clients: 'own', companies: 'own', leads: 'own', tarefas: 'own',
    deferidos: 'full', prazos: 'none', agenda: 'full',
    history: 'none', approvals: 'none', settings: 'own',
  },
};

// Perfis legados — tratados de forma conservadora (não quebram, mas restritos).
const LEGACY_FALLBACK = {
  manager:  ACCESS.admin,     // gerente ~ admin restrito
  operator: ACCESS.seller,    // operador ~ consultor
  viewer:   ACCESS.seller,    // visualizador ~ consultor
};

function normalizeRole(role) {
  return String(role || 'seller').toLowerCase();
}

function accessMapFor(role) {
  const r = normalizeRole(role);
  return ACCESS[r] || LEGACY_FALLBACK[r] || ACCESS.seller;
}

// Nível de acesso ('full'|'team'|'own'|'none') de um role para um módulo.
function accessLevel(role, moduleName) {
  const map = accessMapFor(role);
  return map[moduleName] || 'none';
}

function canAccess(role, moduleName) {
  return accessLevel(role, moduleName) !== 'none';
}

module.exports = {
  MODULES,
  ACCESS,
  normalizeRole,
  accessMapFor,
  accessLevel,
  canAccess,
};
