-- ================================================
-- Migration: vínculo lead -> cliente (multas_leads -> clients)
-- Run once in production database.
--
-- Objetivo: permitir que o cliente criado a partir de um lead "fechado"
-- guarde a referência do lead de origem, garantindo idempotência
-- (não duplicar cliente ao salvar "fechado" novamente).
--
-- Seguro para produção:
--  - Aditivo (ADD COLUMN IF NOT EXISTS), coluna NULLABLE, sem DEFAULT,
--    sem FK e sem reescrita de tabela.
--  - Não altera, sobrescreve nem apaga nenhum dado existente.
--  - Idempotente: pode rodar novamente sem efeito.
-- ================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS lead_id UUID;

-- Índice parcial só para linhas vinculadas (lookup de dedupe rápido, não afeta writes gerais)
CREATE INDEX IF NOT EXISTS idx_clients_lead_id
  ON clients (lead_id)
  WHERE lead_id IS NOT NULL;

COMMENT ON COLUMN clients.lead_id IS
  'multas_leads.id de origem quando o cliente foi criado a partir de um lead fechado (evita duplicidade). NULL para clientes cadastrados manualmente.';
