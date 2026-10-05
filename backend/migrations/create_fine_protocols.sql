-- Migration: tabela fine_protocols (múltiplos protocolos por serviço)
-- Idempotente. Não altera fines.protocol_* (dados legados preservados).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS fine_protocols (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fine_id          UUID NOT NULL REFERENCES fines(id) ON DELETE CASCADE,
  protocol_number  VARCHAR(100),
  protocol_date    DATE,
  protocol_status  VARCHAR(50) DEFAULT 'protocolado',
  protocol_notes   TEXT,
  protocol_file_url TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fine_protocols_fine   ON fine_protocols(fine_id);
CREATE INDEX IF NOT EXISTS idx_fine_protocols_tenant ON fine_protocols(tenant_id);
