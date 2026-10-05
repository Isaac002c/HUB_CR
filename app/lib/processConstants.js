// Constantes e helpers compartilhados do fluxo Empresa > Veículo > Processo.
// Centraliza o que antes vivia duplicado na página da empresa, para que a tela da
// empresa e a tela do veículo usem exatamente a mesma fonte de verdade.
// NÃO altera o fluxo de Clientes/Multas (que mantém suas próprias listas por tipo).

// ── Andamentos (stage) — texto livre no banco; lista de UI ───────────────────
// Inclui o novo andamento "Troca de Real Infrator" (value canônico TROCA REAL INFRATOR).
export const APR_STATUS_OPTIONS = [
  { value: 'APRS DEFESA PREVIA',      label: 'APRs — Defesa Prévia' },
  { value: 'APRS 1 INSTANCIA',        label: 'APRs — 1ª Instância' },
  { value: 'APRS 2 INSTANCIA',        label: 'APRs — 2ª Instância' },
];

export const STATUS_OPTIONS = [
  APR_STATUS_OPTIONS[0],
  { value: 'DEFESA PREVIA - ANALISE', label: 'Defesa Prévia — Análise' },
  APR_STATUS_OPTIONS[1],
  { value: '1 INSTANCIA - ANALISE',   label: '1ª Instância — Análise' },
  APR_STATUS_OPTIONS[2],
  { value: '2 INSTANCIA - ANALISE',   label: '2ª Instância — Análise' },
  { value: 'TROCA REAL INFRATOR',     label: 'Troca de Real Infrator' },
  { value: 'DEFERIDO',                label: 'Deferido' },
  { value: 'INDEFERIDO',              label: 'Indeferido' },
  { value: 'FINALIZADO',              label: 'Finalizado' },
  { value: 'CANCELADO',               label: 'Cancelado' },
];

const FULL_WORKFLOW_ROLES = new Set(['master', 'admin', 'supervisor', 'super_admin']);
const APR_STATUS_VALUES = new Set(APR_STATUS_OPTIONS.map((option) => option.value));

export const hasFullWorkflowAccess = (role) => FULL_WORKFLOW_ROLES.has(String(role || '').toLowerCase());
export const filterStatusOptionsForRole = (options, role) => (
  hasFullWorkflowAccess(role)
    ? options
    : (options || []).filter((option) => APR_STATUS_VALUES.has(option.value))
);

const STATUS_COLORS = {
  'APRS DEFESA PREVIA':      { bg: '#dbeafe', text: '#2563eb' },
  'DEFESA PREVIA - ANALISE': { bg: '#1e3a8a', text: '#ffffff' },
  'APRS 1 INSTANCIA':        { bg: '#6d28d9', text: '#ffffff' },
  '1 INSTANCIA - ANALISE':   { bg: '#f3e8ff', text: '#9333ea' },
  'APRS 2 INSTANCIA':        { bg: '#fef2f2', text: '#ef4444' },
  '2 INSTANCIA - ANALISE':   { bg: '#fee2e2', text: '#b91c1c' },
  'DEFERIDO':            { bg: '#dcfce7', text: '#15803d' },
  'INDEFERIDO':          { bg: '#fee2e2', text: '#991b1b' },
  'PROTOCOLADO':         { bg: '#f0fdf4', text: '#16a34a' },
  'CANCELADO':           { bg: '#f1f5f9', text: '#94a3b8' },
  'FINALIZADO':          { bg: '#f1f5f9', text: '#475569' },
  'TROCA REAL INFRATOR': { bg: '#cffafe', text: '#0e7490' },
};
export const getStatusStyle = (s) => {
  const c = STATUS_COLORS[s];
  return c ? { background: c.bg, color: c.text } : { background: '#ede9fe', color: '#6366f1' };
};
export const getStatusLabel = (s) => STATUS_OPTIONS.find(o => o.value === s)?.label || s || '—';

// ── Órgãos autuadores ────────────────────────────────────────────────────────
export const ORGANS = ['DETRAN', 'DER', 'DNIT', 'SMTR', 'PRF', 'ANTT', 'PREFEITURA UF', 'OUTROS'];
export const getOrganOptions = (current) =>
  current && !ORGANS.includes(current) ? [current, ...ORGANS] : ORGANS;

// ── Tipos de serviço permitidos no fluxo Empresa/Veículo ─────────────────────
// Allowlist por CODE (nunca por id fixo). MULTA = "Auto de Infração"; TRI = "Troca de Real Infrator".
// Os demais tipos seguem disponíveis nos outros módulos — aqui apenas filtramos a exibição.
export const VEHICLE_SERVICE_CODES = ['MULTA', 'TRI'];
export const filterVehicleServiceTypes = (types = []) =>
  (types || []).filter(t => VEHICLE_SERVICE_CODES.includes(String(t.code || '').toUpperCase()));

// ── Dinheiro (pt-BR / BRL — R$ 1.234,56) ─────────────────────────────────────
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (v) => BRL.format(Number(v) || 0);
// Compacto para gráficos/cards estreitos (R$ 12,5 mil / R$ 1,2 mi)
export const formatBRLShort = (v) => {
  const n = Number(v) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 1_000)     return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return formatBRL(n);
};

// ── Datas (timezone-safe, igual ao restante do sistema) ──────────────────────
export const formatDate = (v) => {
  if (!v) return '—';
  const [y, m, d] = String(v).substring(0, 10).split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : '—';
};
export const toInputDate = (v) => (!v ? '' : String(v).substring(0, 10));
export const isBusinessDay = (v) => {
  const match = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
  const weekDay = date.getUTCDay();
  return weekDay !== 0 && weekDay !== 6;
};
// Jogo de cores ÚNICO de prazo (fonte de verdade — usado por Clientes E Empresas):
//   vencido → vermelho | ≤ 7 dias → âmbar | saudável → verde | sem data → cinza
// (mesmo critério que já existia em Clientes; antes Empresas usava cinza-escuro no
//  estado saudável, o que dava a impressão de "só vermelho".)
export const getPrazoStyle = (due) => {
  if (!due) return { color: '#94a3b8' };
  const [y, m, d] = String(due).substring(0, 10).split('-');
  const prazo = new Date(+y, +m - 1, +d, 12, 0, 0);
  const diff = Math.ceil((prazo - new Date()) / 86400000);
  if (diff < 0)  return { color: '#ef4444', fontWeight: 600 }; // vencido (urgente)
  if (diff <= 7) return { color: '#f59e0b', fontWeight: 600 }; // atenção
  return { color: '#16a34a' };                                 // regular / saudável
};

// ── Máscaras e validações de documentos (validam só quando preenchidos) ──────
export const onlyDigits = (v) => (v || '').replace(/\D/g, '');

export const maskCpf = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
};

export const maskCnpj = (v) => {
  const d = onlyDigits(v).slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
};

// CPF (11) ou CNPJ (14): aplica a máscara conforme a quantidade de dígitos.
export const maskCpfCnpj = (v) => (onlyDigits(v).length > 11 ? maskCnpj(v) : maskCpf(v));

export const validateCPF = (v) => {
  const c = onlyDigits(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(c[i], 10) * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== parseInt(c[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(c[i], 10) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === parseInt(c[10], 10);
};

export const validateCNPJ = (v) => {
  const c = onlyDigits(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len) => {
    let s = 0, pos = len - 7;
    for (let i = len; i >= 1; i--) { s += parseInt(c[len - i], 10) * pos--; if (pos < 2) pos = 9; }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === parseInt(c[12], 10) && calc(13) === parseInt(c[13], 10);
};

// CPF (11) ou CNPJ (14) coerente com o tamanho.
export const validateCpfCnpj = (v) => {
  const d = onlyDigits(v);
  if (d.length === 11) return validateCPF(d);
  if (d.length === 14) return validateCNPJ(d);
  return false;
};

// CNH: 11 dígitos (padrão Denatran).
export const validateCNH = (v) => onlyDigits(v).length === 11;
