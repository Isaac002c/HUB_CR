-- Quadro mensal de vendas inspirado no controle operacional da CR Recursos.
-- Migration aditiva, idempotente e sem remoção de dados.

-- Metas e gatilho são individuais e configuráveis por colaborador.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS monthly_sales_target NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS commission_threshold NUMERIC(14,2) NOT NULL DEFAULT 7500;

-- Dados comerciais que precisam permanecer como snapshot na própria venda.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS service_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS installment_number SMALLINT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS installment_total SMALLINT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(40);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS closing_method VARCHAR(20);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commissionable_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_trigger_amount NUMERIC(14,2) NOT NULL DEFAULT 7500;

-- Preserva o significado das vendas históricas: se já havia comissão gravada,
-- deriva a base comissionável usada naquele snapshot, sem recalcular valores.
UPDATE sales
   SET commissionable_amount = CASE
         WHEN commission_percentage > 0
           THEN ROUND(commission_amount * 100 / commission_percentage, 2)
         ELSE 0
       END,
       commission_trigger_amount = 0
 WHERE commissionable_amount = 0
   AND commission_amount <> 0;

UPDATE sales SET service_name = description
 WHERE service_name IS NULL AND description IS NOT NULL;

UPDATE sales s SET customer_name = c.name
  FROM clients c
 WHERE s.customer_name IS NULL AND s.client_id = c.id;

UPDATE sales s SET customer_name = COALESCE(co.razao_social, co.nome_fantasia)
  FROM companies co
 WHERE s.customer_name IS NULL AND s.company_id = co.id;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_monthly_sales_target_nonnegative') THEN
    ALTER TABLE users ADD CONSTRAINT users_monthly_sales_target_nonnegative
      CHECK (monthly_sales_target >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_commission_threshold_nonnegative') THEN
    ALTER TABLE users ADD CONSTRAINT users_commission_threshold_nonnegative
      CHECK (commission_threshold >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_installment_pair_valid') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_installment_pair_valid CHECK (
      (installment_number IS NULL AND installment_total IS NULL)
      OR (installment_number >= 1 AND installment_total >= 1 AND installment_number <= installment_total)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_closing_method_valid') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_closing_method_valid CHECK (
      closing_method IS NULL OR closing_method IN ('presencial', 'remoto', 'outro')
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_tenant_seller_month
  ON sales (tenant_id, seller_id, closed_at, status);
