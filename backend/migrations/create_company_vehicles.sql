-- ============================================================
-- Migration: company_vehicles (Veículos / frota da empresa)
-- Aditiva e idempotente. Multi-tenant (tenant_id UUID).
-- ============================================================

CREATE TABLE IF NOT EXISTS company_vehicles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plate       TEXT,
  brand       TEXT,
  model       TEXT,
  year        INTEGER,
  renavam     TEXT,
  notes       TEXT,
  status      VARCHAR(20) NOT NULL DEFAULT 'ativo',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_vehicles_tenant  ON company_vehicles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_company_vehicles_company ON company_vehicles(company_id);

-- ----------------------------------------------------------------
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_company_vehicles_company;
--   DROP INDEX IF EXISTS idx_company_vehicles_tenant;
--   DROP TABLE IF EXISTS company_vehicles;
-- ----------------------------------------------------------------
