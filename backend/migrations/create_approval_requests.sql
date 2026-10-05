-- Migration: tabela approval_requests (solicitações de exclusão pelo consultor)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS approval_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by  UUID REFERENCES users(id),
  target_type   VARCHAR(50) NOT NULL,
  target_id     UUID NOT NULL,
  target_label  VARCHAR(255),
  reason        TEXT,
  status        VARCHAR(20) DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected')),
  reviewed_by   UUID REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant ON approval_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
