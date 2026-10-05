-- ============================================================
-- Migration: calendar_events — valor, forma de pagamento e telefone
-- Suporte ao fluxo Lead → Agendamento (CR Recursos).
-- Aditiva, idempotente, sem default e sem rewrite de tabela.
-- ============================================================

ALTER TABLE calendar_events
  ADD COLUMN IF NOT EXISTS value          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(60),
  ADD COLUMN IF NOT EXISTS attendee_phone VARCHAR(20);

-- ----------------------------------------------------------------
-- ROLLBACK:
--   ALTER TABLE calendar_events
--     DROP COLUMN IF EXISTS value,
--     DROP COLUMN IF EXISTS payment_method,
--     DROP COLUMN IF EXISTS attendee_phone;
-- ----------------------------------------------------------------
