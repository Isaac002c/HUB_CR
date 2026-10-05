-- Periodicidade contratual dos parcelamentos.
-- Cobranças futuras continuam virtuais: somente parcelas efetivamente recebidas
-- são gravadas em sales e entram no faturamento.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS installment_frequency VARCHAR(16);

UPDATE sales
   SET installment_frequency = 'monthly'
 WHERE installment_total IS NOT NULL
   AND installment_frequency IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sales_installment_frequency_valid'
  ) THEN
    ALTER TABLE sales ADD CONSTRAINT sales_installment_frequency_valid CHECK (
      (installment_total IS NULL AND installment_frequency IS NULL)
      OR installment_frequency IN ('weekly', 'monthly', 'manual')
    );
  END IF;
END $$;

-- Uma parcela de um mesmo plano pode virar receita uma única vez. Além de
-- proteger contra duplo clique, este índice fecha a possibilidade de soma em
-- dobro por chamadas concorrentes da API.
CREATE UNIQUE INDEX IF NOT EXISTS sales_installment_plan_number_unique
  ON sales (tenant_id, installment_plan_id, installment_number)
  WHERE installment_plan_id IS NOT NULL AND installment_number IS NOT NULL;

