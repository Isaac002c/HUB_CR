-- Migration: TRI service type + protocol_file_url + normalize leads status
-- Executar uma vez no banco de produção (Neon PostgreSQL)
-- Seguro: usa IF NOT EXISTS, ON CONFLICT e condições para não quebrar dados existentes

-- ─── 1. Adicionar tipo de serviço TRI ───────────────────────────────────────
INSERT INTO service_types (code, label)
SELECT 'TRI', 'Troca de Real Infrator'
WHERE NOT EXISTS (SELECT 1 FROM service_types WHERE UPPER(code) = 'TRI');

-- ─── 2. Adicionar coluna protocol_file_url na tabela fines ──────────────────
ALTER TABLE fines ADD COLUMN IF NOT EXISTS protocol_file_url TEXT;

-- ─── 3. Normalizar status inválidos em multas_leads ─────────────────────────
-- Corrige leads com status antigos ou com letras maiúsculas/acentos
-- Só afeta rows que têm status FORA dos valores válidos atuais

UPDATE multas_leads
SET status = CASE
  WHEN LOWER(TRIM(status)) = 'entrada'                                  THEN 'entrada'
  WHEN LOWER(TRIM(status)) LIKE '%possui%defensor%'
    OR LOWER(TRIM(status)) = 'ja_possui_defensor'
    OR LOWER(TRIM(status)) = 'já possui defensor'                       THEN 'possui_defensor'
  WHEN LOWER(TRIM(status)) LIKE '%quer%defender%'
    OR LOWER(TRIM(status)) = 'nao_quer_se_defender'
    OR LOWER(TRIM(status)) LIKE '%quer se defender%'
    OR LOWER(TRIM(status)) = 'nao_quer_defender'                        THEN 'nao_quer_defender'
  WHEN LOWER(TRIM(status)) LIKE '%negociac%'
    OR LOWER(TRIM(status)) = 'em_negociacao'
    OR LOWER(TRIM(status)) LIKE 'em negoci%'                            THEN 'negociacao'
  WHEN LOWER(TRIM(status)) = 'fechado'                                  THEN 'fechado'
  WHEN LOWER(TRIM(status)) = 'perdido'                                  THEN 'perdido'
  ELSE 'entrada'
END
WHERE status NOT IN ('entrada', 'possui_defensor', 'nao_quer_defender', 'negociacao', 'fechado', 'perdido');
