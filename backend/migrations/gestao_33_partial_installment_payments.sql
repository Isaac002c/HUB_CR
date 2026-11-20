-- Separa a previsão da parcela dos recebimentos reais. Valores recebidos
-- entram em sales; a agenda só fica quitada quando não há saldo pendente.
ALTER TABLE sales_installment_schedule
  ADD COLUMN IF NOT EXISTS received_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS installment_schedule_id UUID
    REFERENCES sales_installment_schedule(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_installment_schedule_receipt
  ON sales (tenant_id, installment_schedule_id)
  WHERE installment_schedule_id IS NOT NULL;

UPDATE sales sale
   SET installment_schedule_id = item.id
  FROM sales_installment_schedule item
 WHERE item.tenant_id = sale.tenant_id
   AND item.paid_sale_id = sale.id
   AND sale.installment_schedule_id IS NULL;

UPDATE sales_installment_schedule item
   SET received_amount = sale.amount
  FROM sales sale
 WHERE item.paid_sale_id = sale.id
   AND item.tenant_id = sale.tenant_id
   AND item.status = 'paid';

-- Reabre cobranças que antes foram marcadas como pagas com valor abaixo da
-- previsão, preservando a venda pelo valor realmente recebido.
UPDATE sales sale
   SET installment_number = NULL,
       installment_total = NULL,
       installment_plan_id = NULL,
       installment_frequency = NULL,
       next_installment_due_date = NULL,
       next_installment_amount = NULL,
       is_settlement = false
  FROM sales_installment_schedule item
 WHERE item.tenant_id = sale.tenant_id
   AND item.paid_sale_id = sale.id
   AND item.status = 'paid'
   AND item.received_amount < item.expected_amount;

UPDATE sales_installment_schedule
   SET status = 'scheduled', paid_sale_id = NULL, updated_at = NOW()
 WHERE status = 'paid'
   AND received_amount < expected_amount;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sales_installment_schedule_received_valid'
  ) THEN
    ALTER TABLE sales_installment_schedule
      ADD CONSTRAINT sales_installment_schedule_received_valid
      CHECK (received_amount >= 0);
  END IF;
END $$;
