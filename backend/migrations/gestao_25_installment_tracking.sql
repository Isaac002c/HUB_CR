-- Controle de parcelamentos e boletos. Cada recebimento continua sendo uma
-- venda/entrada financeira, mas passa a pertencer a um plano e informar a
-- próxima parcela até a quitação.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS installment_plan_id UUID;
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS next_installment_due_date DATE;
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS is_settlement BOOLEAN NOT NULL DEFAULT false;

WITH grouped AS (
  SELECT id,
         FIRST_VALUE(id) OVER (
           PARTITION BY tenant_id,
                        seller_id,
                        LOWER(COALESCE(customer_name, id::text)),
                        LOWER(COALESCE(service_name, description, id::text)),
                        installment_total
           ORDER BY installment_number, closed_at, created_at, id
         ) AS plan_id
    FROM sales
   WHERE installment_total IS NOT NULL
)
UPDATE sales AS sale
   SET installment_plan_id = grouped.plan_id
  FROM grouped
 WHERE sale.id = grouped.id
   AND sale.installment_plan_id IS NULL;

UPDATE sales
   SET is_settlement = true,
       next_installment_due_date = NULL
 WHERE installment_total IS NOT NULL
   AND installment_number >= installment_total;

UPDATE sales AS sale
   SET next_installment_due_date = (sale.closed_at + INTERVAL '1 month')::date
 WHERE sale.installment_plan_id IS NOT NULL
   AND sale.installment_total IS NOT NULL
   AND sale.installment_number < sale.installment_total
   AND sale.next_installment_due_date IS NULL
   AND NOT sale.is_settlement;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_installment_tracking_valid') THEN
    ALTER TABLE sales ADD CONSTRAINT sales_installment_tracking_valid CHECK (
      installment_total IS NULL
      OR is_settlement
      OR installment_number >= installment_total
      OR next_installment_due_date IS NOT NULL
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_installment_follow_up
  ON sales (tenant_id, installment_plan_id, installment_number DESC, next_installment_due_date)
  WHERE installment_total IS NOT NULL;
