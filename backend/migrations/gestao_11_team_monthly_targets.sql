-- Meta comercial mensal da equipe, independente da meta individual do consultor.
-- Um registro por equipe/mês. Idempotente e sem alteração de vendas existentes.

CREATE TABLE IF NOT EXISTS team_monthly_targets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month_start DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_team_monthly_targets UNIQUE (tenant_id, team_id, month_start),
  CONSTRAINT ck_team_monthly_targets_first_day
    CHECK (month_start = date_trunc('month', month_start)::date)
);

CREATE INDEX IF NOT EXISTS idx_team_monthly_targets_period
  ON team_monthly_targets (tenant_id, month_start, team_id);
