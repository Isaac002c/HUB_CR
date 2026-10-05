-- Ficha detalhada do colaborador: custos recorrentes e faixas de comissão.
-- Aditiva e idempotente.

ALTER TABLE collaborator_costs ADD COLUMN IF NOT EXISTS recurring BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE collaborator_costs ADD COLUMN IF NOT EXISTS end_date DATE;

CREATE TABLE IF NOT EXISTS collaborator_commission_tiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(80),
  min_sales       NUMERIC(14,2) NOT NULL CHECK (min_sales >= 0),
  percentage      NUMERIC(5,2) NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, collaborator_id, min_sales)
);

CREATE INDEX IF NOT EXISTS idx_commission_tiers_collaborator
  ON collaborator_commission_tiers (tenant_id, collaborator_id, min_sales);

