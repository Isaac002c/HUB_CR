-- ============================================================================
-- Migration: Backfill de VENDAS a partir dos processos existentes (fines)
-- ----------------------------------------------------------------------------
-- Objetivo (decisão do cliente): "puxar tudo que já existe da CR Recursos"
-- para o módulo Gestão nascer com histórico real.
--
-- REGRA DE MAPEAMENTO (documentada — ajuste aqui se a semântica for outra):
--   • 1 processo (fines) com valor > 0  →  1 venda (sales)
--   • amount    = COALESCE(paid_value, value)   (honorário pago; senão valor)
--   • seller_id = fines.seller_id (users.id)     (consultor responsável)
--   • team_id   = equipe atual do vendedor       (users.team_id)
--   • closed_at = data de criação do processo    (data real da "venda")
--   • commission_percentage = % ATUAL do vendedor (SNAPSHOT) — 0 se não definido
--   • commission_amount     = amount * % / 100
--   • fine_id vincula a venda ao processo → idempotente (não duplica)
--
-- SEGURO: só INSERE onde ainda não há venda para aquele processo
--         (uq_sales_fine + NOT EXISTS). Reexecutável. Não altera fines.
--
-- Para desfazer apenas o backfill (rollback):
--   DELETE FROM sales WHERE source = 'backfill_fine';
-- ============================================================================

INSERT INTO sales (
  tenant_id, seller_id, team_id, client_id, company_id, fine_id,
  description, amount, commission_percentage, commission_amount,
  status, closed_at, source, created_by, created_at
)
SELECT
  f.tenant_id,
  f.seller_id,
  u.team_id,
  f.client_id,
  f.company_id,
  f.id,
  CONCAT('Processo ', COALESCE(f.fine_number, ''),
         CASE WHEN f.organ IS NOT NULL THEN CONCAT(' · ', f.organ) ELSE '' END) AS description,
  ROUND(COALESCE(f.paid_value, f.value, 0)::numeric, 2)                          AS amount,
  COALESCE(u.commission_percentage, 0)                                          AS commission_percentage,
  ROUND(COALESCE(f.paid_value, f.value, 0)::numeric
        * COALESCE(u.commission_percentage, 0) / 100.0, 2)                       AS commission_amount,
  'confirmed'                                                                    AS status,
  COALESCE(f.created_at::date, CURRENT_DATE)                                     AS closed_at,
  'backfill_fine'                                                                AS source,
  f.seller_id                                                                    AS created_by,
  COALESCE(f.created_at, NOW())                                                  AS created_at
FROM fines f
LEFT JOIN users u
       ON u.id = f.seller_id
      AND u.tenant_id = f.tenant_id
WHERE COALESCE(f.paid_value, f.value, 0) > 0            -- só processos com valor (venda de fato)
  AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.fine_id = f.id);

-- Conferência:
-- SELECT COUNT(*) AS vendas_backfill, SUM(amount) AS total FROM sales WHERE source='backfill_fine';
