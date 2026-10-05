-- Gestão de colaboradores, folha e custos.
-- Migration aditiva e idempotente: preserva todos os registros existentes.

ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS salary NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS benefits_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS other_monthly_costs NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employer_charges_percentage NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS thirteenth_salary_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS employment_type VARCHAR(30) NOT NULL DEFAULT 'CLT';
ALTER TABLE users ADD COLUMN IF NOT EXISTS termination_date DATE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_teams_tenant_name_ci
  ON teams (tenant_id, LOWER(name));

CREATE TABLE IF NOT EXISTS collaborator_costs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  collaborator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category        VARCHAR(30) NOT NULL DEFAULT 'other',
  description     VARCHAR(180) NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  competence      DATE NOT NULL,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collaborator_costs_tenant_competence
  ON collaborator_costs (tenant_id, competence);
CREATE INDEX IF NOT EXISTS idx_collaborator_costs_collaborator_competence
  ON collaborator_costs (collaborator_id, competence);

