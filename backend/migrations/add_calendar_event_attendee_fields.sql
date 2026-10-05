-- Migration: campos da pessoa agendada + serviço em calendar_events.
--
-- 100% ADITIVA e idempotente (ADD COLUMN IF NOT EXISTS). Todas nullable.
-- NÃO remove/renomeia colunas. "Nome" reutiliza title; "Consultor" reutiliza
-- responsible_user_id (nenhuma coluna nova para esses dois). Bloqueio parcial
-- reutiliza start_time/end_time (sem coluna nova). Eventos existentes ficam intactos.
--
-- Rollback (reversível, sem perda de dados):
--   ALTER TABLE calendar_events DROP COLUMN IF EXISTS service_type_id;
--   ALTER TABLE calendar_events DROP COLUMN IF EXISTS attendee_cpf;
--   ALTER TABLE calendar_events DROP COLUMN IF EXISTS attendee_cnh;
--   ALTER TABLE calendar_events DROP COLUMN IF EXISTS attendee_first_cnh;
--   ALTER TABLE calendar_events DROP COLUMN IF EXISTS attendee_birth_date;

ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS service_type_id     INTEGER REFERENCES service_types(id);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS attendee_cpf        VARCHAR(11);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS attendee_cnh        VARCHAR(20);
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS attendee_first_cnh  DATE;
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS attendee_birth_date DATE;
