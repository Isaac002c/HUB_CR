-- ============================================================================
-- Migration: OWNERSHIP do Consultor — created_by nas entidades operacionais
-- ----------------------------------------------------------------------------
-- Regra: "CONSULTOR só vê o que ele mesmo criou".
-- Para aplicar isso NO BACKEND precisamos de um dono por registro.
--   • fines já possui seller_id (users.id) → é o dono do processo.
--   • clients / companies / multas_leads ganham created_by (users.id).
--
-- SEGURO / ADITIVO / IDEMPOTENTE. Backfill best-effort (só preenche nulos).
--   Backfill de clients/companies: usa o vendedor do processo mais antigo
--   daquele cliente/empresa (quem trabalha os processos "é dono" da relação).
--
-- Exceções globais (NÃO filtram por created_by na leitura): Deferidos e Agenda.
-- ============================================================================

-- 1) Colunas de dono (nullable; FK solta para não travar deleção de usuário)
ALTER TABLE clients      ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE companies    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE multas_leads ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE leads        ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_created_by      ON clients(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_companies_created_by    ON companies(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_multas_leads_created_by ON multas_leads(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_leads_created_by        ON leads(tenant_id, created_by);

-- leads.created_by ← usuário cujo users.seller_id aponta para leads.seller_id
-- (liga o funil de leads, que usa a tabela sellers, ao usuário-consultor real).
UPDATE leads l
   SET created_by = u.id
  FROM users u
 WHERE u.tenant_id = l.tenant_id
   AND u.seller_id IS NOT NULL
   AND u.seller_id = l.seller_id
   AND l.created_by IS NULL;

-- 2) Backfill clients.created_by ← vendedor do processo mais antigo do cliente
UPDATE clients c
   SET created_by = sub.seller_id
  FROM (
    SELECT DISTINCT ON (f.client_id)
           f.client_id, f.seller_id
      FROM fines f
     WHERE f.client_id IS NOT NULL AND f.seller_id IS NOT NULL
     ORDER BY f.client_id, f.created_at ASC
  ) sub
 WHERE c.id = sub.client_id
   AND c.created_by IS NULL;

-- 3) Backfill companies.created_by ← vendedor do processo mais antigo da empresa
UPDATE companies co
   SET created_by = sub.seller_id
  FROM (
    SELECT DISTINCT ON (f.company_id)
           f.company_id, f.seller_id
      FROM fines f
     WHERE f.company_id IS NOT NULL AND f.seller_id IS NOT NULL
     ORDER BY f.company_id, f.created_at ASC
  ) sub
 WHERE co.id = sub.company_id
   AND co.created_by IS NULL;

-- multas_leads: se já houver coluna de vendedor/seller no schema, pode-se
-- copiá-la para created_by manualmente. Deixamos como no-op seguro aqui.

-- ============================================================================
-- Adicione ao final do runner (run_all_pending.sql) já referenciado como M6.
-- ============================================================================
