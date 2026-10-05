-- ============================================================================
-- Migration: Módulo GESTÃO — estrutura (DDL)
-- ----------------------------------------------------------------------------
-- SEGURO / ADITIVO / IDEMPOTENTE:
--   • Só cria tabelas/colunas/índices com IF NOT EXISTS.
--   • NÃO dropa nada, NÃO altera tipos existentes, NÃO remove dados.
--   • Pode ser reexecutada quantas vezes for necessário.
-- Preserva o isolamento multi-tenant: toda entidade nova carrega tenant_id.
-- Data changes (roles, backfill) ficam em arquivos separados e conscientes:
--   gestao_02_roles.sql  e  gestao_03_backfill_sales.sql
-- ============================================================================

-- Extensão para gen_random_uuid() (já usada por leads_table.sql; no-op se existir)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. EQUIPES (teams) ──────────────────────────────────────────────────────
-- Preparado para MÚLTIPLAS equipes desde já (sem hardcode de equipe única).
CREATE TABLE IF NOT EXISTS teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(120) NOT NULL,
  supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teams_tenant      ON teams(tenant_id);
CREATE INDEX IF NOT EXISTS idx_teams_supervisor  ON teams(supervisor_id);

-- ─── 2. COLABORADOR = USUÁRIO (extensão de users, sem duplicar dados) ────────
-- O colaborador É o usuário. Em vez de uma tabela paralela que duplicaria
-- nome/e-mail, estendemos users com os campos comerciais/organizacionais.
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_id               UUID REFERENCES teams(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS supervisor_id         UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 10;  -- regra fixa vigente
ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_date             DATE;                                -- data de entrada
ALTER TABLE users ADD COLUMN IF NOT EXISTS position              VARCHAR(80);                         -- cargo/perfil livre
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar                VARCHAR(255);                        -- iniciais ou URL
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active             BOOLEAN NOT NULL DEFAULT true;       -- ativo/inativo

CREATE INDEX IF NOT EXISTS idx_users_tenant      ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_team        ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_users_supervisor  ON users(supervisor_id);

-- ─── 3. VENDAS (sales) — FONTE ÚNICA DE VERDADE da venda concluída ────────────
-- Uma venda referencia OPCIONALMENTE o processo/cliente/empresa/lead de origem.
-- O vínculo fine_id (processo) é UNIQUE → impede contar a mesma venda 2x
-- (ex.: Lead Fechado que também virou Cliente Fechado).
-- Dinheiro em NUMERIC (nunca float). commission_percentage é SNAPSHOT no fechamento.
CREATE TABLE IF NOT EXISTS sales (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id)   ON DELETE CASCADE,
  seller_id             UUID REFERENCES users(id)              ON DELETE SET NULL,  -- vendedor/consultor (users.id)
  team_id               UUID REFERENCES teams(id)              ON DELETE SET NULL,  -- equipe no momento do fechamento
  client_id             UUID REFERENCES clients(id)            ON DELETE SET NULL,  -- opcional
  company_id            UUID REFERENCES companies(id)          ON DELETE SET NULL,  -- opcional
  lead_id               UUID REFERENCES leads(id)              ON DELETE SET NULL,  -- opcional
  fine_id               UUID REFERENCES fines(id)              ON DELETE SET NULL,  -- processo/serviço de origem (opcional)
  description           TEXT,
  amount                NUMERIC(14,2) NOT NULL DEFAULT 0,       -- valor da venda (R$)
  commission_percentage NUMERIC(5,2)  NOT NULL DEFAULT 0,       -- SNAPSHOT do % no fechamento
  commission_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,       -- amount * commission_percentage / 100
  status                VARCHAR(20)   NOT NULL DEFAULT 'confirmed', -- confirmed | pending | canceled
  closed_at             DATE          NOT NULL DEFAULT CURRENT_DATE, -- data real da venda (fechamento mensal usa esta)
  source                VARCHAR(20)   NOT NULL DEFAULT 'manual',    -- manual | backfill_fine | lead
  created_by            UUID REFERENCES users(id)              ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Uma venda por processo (evita contagem dupla e torna o backfill idempotente)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_fine
  ON sales(fine_id) WHERE fine_id IS NOT NULL;

-- Índices compostos p/ consultas mensais/ranking (evita full scan e N+1 agregado)
CREATE INDEX IF NOT EXISTS idx_sales_tenant_closed        ON sales(tenant_id, closed_at);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_seller_closed ON sales(tenant_id, seller_id, closed_at);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_team_closed   ON sales(tenant_id, team_id, closed_at);
CREATE INDEX IF NOT EXISTS idx_sales_tenant_status        ON sales(tenant_id, status);

-- ─── 4. Índice p/ ownership do Consultor em fines (seller_id -> users.id) ─────
-- Consulta "só o que eu criei" filtra por seller_id do processo.
CREATE INDEX IF NOT EXISTS idx_fines_tenant_seller ON fines(tenant_id, seller_id);

-- ============================================================================
-- FIM — estrutura do módulo Gestão criada de forma segura e reexecutável.
-- ============================================================================
