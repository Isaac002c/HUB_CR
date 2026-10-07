// Regras definitivas da CR Recursos. Os valores aplicados continuam gravados na
// venda como snapshot; nenhuma alteração futura recalcula vendas históricas.
const CONSULTANT_COMMISSION_PERCENTAGE = 10;
const CONSULTANT_COMMISSION_THRESHOLD = 7500;
const SUPERVISOR_PERSONAL_PERCENTAGE = 10;
const SUPERVISOR_TEAM_PERCENTAGE = 5;

// Aliases mantidos para as telas/relatórios de consultores existentes.
const FIXED_COMMISSION_PERCENTAGE = CONSULTANT_COMMISSION_PERCENTAGE;
const FIXED_COMMISSION_THRESHOLD = CONSULTANT_COMMISSION_THRESHOLD;

function commissionPolicyForRole(role, configuredPolicy = null) {
  const normalized = String(role || '').toLowerCase();
  if (normalized === 'supervisor') {
    return { percentage: SUPERVISOR_PERSONAL_PERCENTAGE, threshold: 0, mode: 'full_amount' };
  }
  if (normalized === 'seller') {
    const configuredPercentage = Number(configuredPolicy?.commission_percentage);
    const configuredThreshold = Number(configuredPolicy?.commission_threshold);
    if (
      configuredPolicy?.commission_percentage !== undefined
      && configuredPolicy?.commission_threshold !== undefined
      && Number.isFinite(configuredPercentage)
      && Number.isFinite(configuredThreshold)
      && configuredPercentage >= 0
      && configuredThreshold >= 0
      && (configuredPercentage !== CONSULTANT_COMMISSION_PERCENTAGE
        || configuredThreshold !== CONSULTANT_COMMISSION_THRESHOLD)
    ) {
      return {
        percentage: configuredPercentage,
        threshold: configuredThreshold,
        mode: configuredThreshold === 0 ? 'full_amount' : 'threshold_excess',
      };
    }
    return { percentage: CONSULTANT_COMMISSION_PERCENTAGE, threshold: CONSULTANT_COMMISSION_THRESHOLD, mode: 'threshold_excess' };
  }
  return { percentage: 0, threshold: 0, mode: 'none' };
}

module.exports = {
  FIXED_COMMISSION_PERCENTAGE,
  FIXED_COMMISSION_THRESHOLD,
  CONSULTANT_COMMISSION_PERCENTAGE,
  CONSULTANT_COMMISSION_THRESHOLD,
  SUPERVISOR_PERSONAL_PERCENTAGE,
  SUPERVISOR_TEAM_PERCENTAGE,
  commissionPolicyForRole,
};
