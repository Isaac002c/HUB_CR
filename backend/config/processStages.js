const APR_STAGES = Object.freeze([
  'APRS DEFESA PREVIA',
  'APRS 1 INSTANCIA',
  'APRS 2 INSTANCIA',
]);

const RETIRED_PROCESS_STAGES = Object.freeze([
  'MANDATORIA',
  'EXCESSO DE PONTOS',
  'PROTOCOLADO',
]);

const CRCI_STAGES = Object.freeze([
  'EM ANDAMENTO',
  'FINALIZADO',
]);

const FULL_WORKFLOW_ROLES = new Set(['master', 'admin', 'supervisor', 'super_admin']);

function normalizeStage(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function validateProcessStage(role, stage, serviceCode = null) {
  const normalized = normalizeStage(stage);
  const normalizedService = normalizeStage(serviceCode);
  if (!normalized) {
    return { ok: false, status: 400, error: 'Selecione o andamento do processo.' };
  }
  // CRCI não utiliza etapas APR. Seu fluxo curto é válido para todos os
  // perfis que já possuem permissão para criar/editar o processo.
  if (normalizedService === 'CRCI') {
    if (!CRCI_STAGES.includes(normalized)) {
      return { ok: false, status: 400, error: 'Selecione um andamento válido para CRCI.' };
    }
    return { ok: true, stage: normalized };
  }
  if (RETIRED_PROCESS_STAGES.includes(normalized)) {
    return { ok: false, status: 400, error: 'Esse andamento pertence a outro fluxo e não está disponível aqui.' };
  }
  if (!FULL_WORKFLOW_ROLES.has(String(role || '').toLowerCase()) && !APR_STAGES.includes(normalized)) {
    return { ok: false, status: 403, error: 'Consultores podem cadastrar somente os andamentos APRs.' };
  }
  return { ok: true, stage: normalized };
}

module.exports = {
  APR_STAGES,
  CRCI_STAGES,
  RETIRED_PROCESS_STAGES,
  FULL_WORKFLOW_ROLES,
  normalizeStage,
  validateProcessStage,
};
