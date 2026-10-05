-- Migration: campos de proprietário/condutor em company_vehicles + vínculos de
-- documento por empresa e por veículo.
--
-- 100% ADITIVA e idempotente (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- NÃO remove nem altera colunas existentes (year, brand, model, notes permanecem).
-- NÃO move nem apaga dados. Documentos antigos continuam ligados via client_id/contract_id.
--
-- Rollback (reversível, sem perda de processos/documentos):
--   ALTER TABLE company_vehicles DROP COLUMN IF EXISTS owner_document;
--   ALTER TABLE company_vehicles DROP COLUMN IF EXISTS driver_name;
--   ALTER TABLE company_vehicles DROP COLUMN IF EXISTS driver_cpf;
--   ALTER TABLE company_vehicles DROP COLUMN IF EXISTS driver_cnh;
--   ALTER TABLE documents DROP COLUMN IF EXISTS company_id;
--   ALTER TABLE documents DROP COLUMN IF EXISTS vehicle_id;

-- ── Veículo: proprietário/responsável + condutor ─────────────────────────────
-- owner_document = CPF (11) OU CNPJ (14) do proprietário/responsável, só dígitos.
ALTER TABLE company_vehicles ADD COLUMN IF NOT EXISTS owner_document VARCHAR(14);
ALTER TABLE company_vehicles ADD COLUMN IF NOT EXISTS driver_name    VARCHAR(255);
ALTER TABLE company_vehicles ADD COLUMN IF NOT EXISTS driver_cpf     VARCHAR(11);
ALTER TABLE company_vehicles ADD COLUMN IF NOT EXISTS driver_cnh     VARCHAR(20);

-- ── Documentos: vínculo opcional com empresa e/ou veículo ────────────────────
-- Nullable. Documentos de cliente (client_id) e de processo (contract_id) seguem iguais.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id)        ON DELETE CASCADE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES company_vehicles(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(tenant_id, company_id);
CREATE INDEX IF NOT EXISTS idx_documents_vehicle ON documents(tenant_id, vehicle_id);
