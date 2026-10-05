-- ============================================================
-- Migration: calendar_events (módulo Calendário — eventos/agendamentos)
-- Separado da Agenda de Prazos. Aditiva, idempotente, multi-tenant.
-- ============================================================

CREATE TABLE IF NOT EXISTS calendar_events (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title                TEXT NOT NULL,
  description          TEXT,
  event_date           DATE NOT NULL,
  start_time           TIME,
  end_time             TIME,
  type                 VARCHAR(30) NOT NULL DEFAULT 'outro',   -- reuniao | audiencia | ligacao | prazo | outro
  client_id            UUID REFERENCES clients(id) ON DELETE SET NULL,
  fine_id              UUID REFERENCES fines(id)   ON DELETE SET NULL,
  responsible_user_id  UUID REFERENCES users(id)   ON DELETE SET NULL,
  status               VARCHAR(20) NOT NULL DEFAULT 'agendado', -- agendado | concluido | cancelado
  created_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_date ON calendar_events(tenant_id, event_date);

-- ----------------------------------------------------------------
-- ROLLBACK:
--   DROP INDEX IF EXISTS idx_calendar_events_tenant_date;
--   DROP TABLE IF EXISTS calendar_events;
-- ----------------------------------------------------------------
