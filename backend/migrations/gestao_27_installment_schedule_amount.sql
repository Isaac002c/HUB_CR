-- Valor previsto da próxima cobrança, separado do valor já recebido.
-- Assim, ajustar uma pendência não altera faturamento, comissão ou histórico.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS next_installment_amount NUMERIC(14,2);

UPDATE sales
   SET next_installment_amount = amount
 WHERE installment_total IS NOT NULL
   AND installment_number < installment_total
   AND NOT is_settlement
   AND next_installment_amount IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sales_next_installment_amount_positive'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_next_installment_amount_positive
      CHECK (next_installment_amount IS NULL OR next_installment_amount > 0);
  END IF;
END $$;
