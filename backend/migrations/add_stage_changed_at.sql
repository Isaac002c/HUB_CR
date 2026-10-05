-- ============================================================
-- Migration: multas_leads.stage_changed_at
-- Aditiva e idempotente. Controla há quanto tempo o lead está na etapa atual
-- (base da regra de ocultação automática do kanban: 7d geral / 30d negociação).
-- NÃO apaga nem arquiva nada.
-- ============================================================

ALTER TABLE multas_leads ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ;

-- Backfill: itens existentes recebem a melhor aproximação disponível.
UPDATE multas_leads
   SET stage_changed_at = COALESCE(updated_at, created_at)
 WHERE stage_changed_at IS NULL;

-- Novos registros assumem NOW() por padrão.
ALTER TABLE multas_leads ALTER COLUMN stage_changed_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_multas_leads_stage
  ON multas_leads(tenant_id, status, stage_changed_at);

-- ----------------------------------------------------------------
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_multas_leads_stage;
--   ALTER TABLE multas_leads DROP COLUMN IF EXISTS stage_changed_at;
-- ----------------------------------------------------------------
