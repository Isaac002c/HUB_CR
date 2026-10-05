-- Migration: criar tabela documents para upload de documentos de clientes
-- Idempotente: usa CREATE TABLE IF NOT EXISTS e CREATE EXTENSION IF NOT EXISTS
-- Não afeta dados existentes. Não altera tabelas client_documents nem fine_documents.
-- Executar uma vez no banco Neon de produção.

-- Garantir extensão para gen_random_uuid() (geralmente já instalada)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id  UUID,
  client_id    UUID REFERENCES clients(id) ON DELETE CASCADE,
  file_url     TEXT NOT NULL,
  file_name    VARCHAR(500),
  file_type    VARCHAR(100),
  file_size    BIGINT,
  category     VARCHAR(100) DEFAULT 'outros',
  description  TEXT,
  uploaded_by  UUID REFERENCES users(id),
  uploaded_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_tenant ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
