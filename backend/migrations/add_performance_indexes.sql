-- Migration: Índices de performance
-- Seguro: CREATE INDEX IF NOT EXISTS nunca falha se o índice já existir.
-- Não altera tipos de colunas, não dropa nada, não é destrutivo.
-- Para rodar em produção sem downtime, substitua CREATE INDEX por CREATE INDEX CONCURRENTLY
-- (não pode ser executado dentro de uma transação).

-- ─── clients ──────────────────────────────────────────────────────────────────

-- Filtro base de todo tenant — cobre WHERE tenant_id = $1
CREATE INDEX IF NOT EXISTS idx_clients_tenant_id
  ON clients(tenant_id);

-- Filtro por status na listagem — cobre WHERE tenant_id = $1 AND status = $2
CREATE INDEX IF NOT EXISTS idx_clients_tenant_status
  ON clients(tenant_id, status);

-- Busca por CPF individual (getClientByCPF)
CREATE INDEX IF NOT EXISTS idx_clients_cpf
  ON clients(tenant_id, cpf);

-- ─── fines (contratos) ────────────────────────────────────────────────────────

-- Carregamento de contratos por cliente (N+1 no detalhe do cliente)
CREATE INDEX IF NOT EXISTS idx_fines_client_id
  ON fines(client_id);

-- Queries de prazo / dashboard / filtros de vencimento
CREATE INDEX IF NOT EXISTS idx_fines_tenant_due_date
  ON fines(tenant_id, due_date);

-- Filtro de stage (status do contrato) — usado em relatórios e dashboard
CREATE INDEX IF NOT EXISTS idx_fines_tenant_stage
  ON fines(tenant_id, stage);
