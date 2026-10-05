-- Detalhamento do serviço TRI (Troca de Real Infrator).
-- Aditiva, idempotente e sem alteração dos registros existentes.

ALTER TABLE fines
  ADD COLUMN IF NOT EXISTS real_infractor_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_fines_tri_deadline
  ON fines (tenant_id, service_type_id, due_date)
  WHERE due_date IS NOT NULL;
