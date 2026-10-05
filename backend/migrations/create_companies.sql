-- ============================================================
-- Migration: companies (Empresas / pessoas jurídicas)
-- Aditiva e idempotente. Multi-tenant (tenant_id UUID).
-- ============================================================

CREATE TABLE IF NOT EXISTS companies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  razao_social  TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj          VARCHAR(14) NOT NULL,            -- somente dígitos (normalizado)
  responsavel   TEXT,
  phone         TEXT,
  email         TEXT,
  address       TEXT,
  notes         TEXT,
  status        VARCHAR(20) NOT NULL DEFAULT 'ativo',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_companies_tenant ON companies(tenant_id);
-- CNPJ único por tenant (normalizado). Tenants diferentes podem ter o mesmo CNPJ.
CREATE UNIQUE INDEX IF NOT EXISTS uq_companies_tenant_cnpj ON companies(tenant_id, cnpj);

-- ----------------------------------------------------------------
-- ROLLBACK:
--   DROP INDEX IF EXISTS uq_companies_tenant_cnpj;
--   DROP INDEX IF EXISTS idx_companies_tenant;
--   DROP TABLE IF EXISTS companies;
-- ----------------------------------------------------------------
