-- ============================================================
-- Migration: vínculo opcional de multas/processos a Empresa/Veículo
-- Aditiva, idempotente e RETROCOMPATÍVEL:
--   - company_id / vehicle_id NULLABLE (multas antigas continuam válidas)
--   - client_id passa a NULLABLE (permite processo só-empresa)
--   - plate permanece intocada (continua sendo a fonte de exibição)
-- ============================================================

ALTER TABLE fines ADD COLUMN IF NOT EXISTS company_id UUID NULL REFERENCES companies(id)        ON DELETE SET NULL;
ALTER TABLE fines ADD COLUMN IF NOT EXISTS vehicle_id UUID NULL REFERENCES company_vehicles(id) ON DELETE SET NULL;

-- Permite multa vinculada apenas a empresa (sem cliente PF).
ALTER TABLE fines ALTER COLUMN client_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fines_company ON fines(tenant_id, company_id);
CREATE INDEX IF NOT EXISTS idx_fines_vehicle ON fines(tenant_id, vehicle_id);

-- ----------------------------------------------------------------
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_fines_vehicle;
--   DROP INDEX IF EXISTS idx_fines_company;
--   -- Reativar NOT NULL só é seguro se NÃO houver fines com client_id nulo:
--   -- ALTER TABLE fines ALTER COLUMN client_id SET NOT NULL;
--   ALTER TABLE fines DROP COLUMN IF EXISTS vehicle_id;
--   ALTER TABLE fines DROP COLUMN IF EXISTS company_id;
-- ----------------------------------------------------------------
