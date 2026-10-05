-- Migration: adicionar nao_encontrado ao CHECK CONSTRAINT de multas_leads
-- e coluna archived_at para soft delete

-- 1. Atualizar CHECK CONSTRAINT para incluir nao_encontrado
ALTER TABLE multas_leads DROP CONSTRAINT IF EXISTS multas_leads_status_check;
ALTER TABLE multas_leads ADD CONSTRAINT multas_leads_status_check
  CHECK (status IN (
    'entrada', 'possui_defensor', 'nao_quer_defender',
    'negociacao', 'fechado', 'perdido', 'nao_encontrado'
  ));

-- 2. Coluna para soft delete / arquivamento
ALTER TABLE multas_leads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_multas_leads_archived ON multas_leads(archived_at)
  WHERE archived_at IS NULL;
