-- Trilha de auditoria completa e pesquisável do tenant.
-- Normaliza instalações novas criadas pelo schema-base antigo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'entity_type'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activity_logs' AND column_name = 'entity'
  ) THEN
    ALTER TABLE activity_logs RENAME COLUMN entity_type TO entity;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  module VARCHAR(80) NOT NULL DEFAULT 'sistema',
  entity VARCHAR(100),
  entity_id TEXT,
  entity_name VARCHAR(255),
  description TEXT NOT NULL,
  method VARCHAR(10),
  path TEXT,
  status_code INTEGER,
  success BOOLEAN NOT NULL DEFAULT true,
  ip_address VARCHAR(80),
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source VARCHAR(30) NOT NULL DEFAULT 'automatic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created
  ON audit_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_user_created
  ON audit_events(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_module
  ON audit_events(tenant_id, module, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_action
  ON audit_events(tenant_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_success
  ON audit_events(tenant_id, success, created_at DESC);

-- Preserva os registros históricos existentes. O UUID original evita duplicação
-- caso a migração seja reaplicada manualmente.
INSERT INTO audit_events (
  id, tenant_id, user_id, action, module, entity, entity_id, entity_name,
  description, metadata, source, created_at
)
SELECT
  al.id,
  al.tenant_id,
  al.user_id,
  COALESCE(NULLIF(al.action, ''), 'activity'),
  CASE
    WHEN al.entity IN ('sale', 'team', 'collaborator', 'collaborator_cost', 'collaborator_org', 'collaborator_commission', 'commission_tier') THEN 'gestao'
    WHEN al.entity IN ('client') THEN 'clientes'
    WHEN al.entity IN ('company', 'vehicle') THEN 'empresas'
    WHEN al.entity IN ('lead') THEN 'leads'
    WHEN al.entity IN ('fine', 'contract', 'document', 'protocol') THEN 'processos'
    WHEN al.entity IN ('calendar_event') THEN 'agenda'
    WHEN al.entity IN ('user') THEN 'usuarios'
    ELSE 'sistema'
  END,
  al.entity,
  al.entity_id::text,
  al.entity_name,
  COALESCE(al.details->>'message', INITCAP(COALESCE(al.action, 'atividade')) || ' em ' || COALESCE(al.entity, 'sistema')),
  COALESCE(al.details, '{}'::jsonb),
  'legacy',
  al.created_at
FROM activity_logs al
ON CONFLICT (id) DO NOTHING;
