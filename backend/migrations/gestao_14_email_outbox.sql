-- E-mails transacionais: outbox persistente, trilha de eventos, webhooks e suppressions.
-- Nenhum secret fica no banco. O conteudo completo do e-mail e montado apenas no worker.

CREATE TABLE IF NOT EXISTS email_outbox (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
  process_id          UUID REFERENCES fines(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type          VARCHAR(100) NOT NULL,
  recipient           VARCHAR(320) NOT NULL,
  recipient_name      VARCHAR(255),
  subject             TEXT NOT NULL,
  template_key        VARCHAR(100) NOT NULL,
  template_data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  attachments         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              VARCHAR(32) NOT NULL DEFAULT 'queued'
                      CHECK (status IN (
                        'queued','processing','sent','delivered','delivery_delayed',
                        'bounced','complained','suppressed','failed','cancelled'
                      )),
  provider            VARCHAR(32) NOT NULL DEFAULT 'resend',
  provider_email_id   VARCHAR(255),
  idempotency_key     VARCHAR(64) NOT NULL,
  attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error          TEXT,
  scheduled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_at       TIMESTAMPTZ,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_email_outbox_queue
  ON email_outbox(status, scheduled_at, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_email_outbox_tenant_created
  ON email_outbox(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_process
  ON email_outbox(tenant_id, process_id, created_at DESC)
  WHERE process_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_email_outbox_provider_id
  ON email_outbox(provider, provider_email_id)
  WHERE provider_email_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_outbox_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id           UUID NOT NULL REFERENCES email_outbox(id) ON DELETE CASCADE,
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  process_id          UUID REFERENCES fines(id) ON DELETE SET NULL,
  status              VARCHAR(32) NOT NULL,
  message             TEXT NOT NULL,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_created_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_events_outbox_created
  ON email_outbox_events(outbox_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_process_created
  ON email_outbox_events(tenant_id, process_id, created_at DESC)
  WHERE process_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS email_webhook_events (
  svix_id             VARCHAR(255) PRIMARY KEY,
  event_type          VARCHAR(100) NOT NULL,
  provider_email_id   VARCHAR(255),
  payload_sha256      VARCHAR(64) NOT NULL,
  processed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_suppressions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_normalized  VARCHAR(320) NOT NULL,
  reason                VARCHAR(32) NOT NULL
                        CHECK (reason IN ('bounced','complained','suppressed')),
  provider_email_id     VARCHAR(255),
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, recipient_normalized)
);

CREATE INDEX IF NOT EXISTS idx_email_suppressions_active
  ON email_suppressions(tenant_id, recipient_normalized)
  WHERE active = true;
