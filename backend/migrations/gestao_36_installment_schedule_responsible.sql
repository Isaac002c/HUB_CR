-- Responsável operacional individual de cada cobrança futura. NULL mantém
-- a regra automática atual (responsável atual do cliente / venda original).
ALTER TABLE sales_installment_schedule
  ADD COLUMN IF NOT EXISTS responsible_seller_id UUID REFERENCES users(id) ON DELETE SET NULL;
