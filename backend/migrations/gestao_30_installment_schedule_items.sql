-- Agenda individual de cobranças futuras. Valores previstos não são vendas:
-- somente a confirmação do recebimento cria uma linha em sales.
CREATE TABLE IF NOT EXISTS sales_installment_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  installment_plan_id UUID NOT NULL,
  installment_number INTEGER NOT NULL CHECK (installment_number > 1),
  installment_total INTEGER NOT NULL CHECK (installment_total >= installment_number),
  due_date DATE NOT NULL,
  expected_amount NUMERIC(14,2) NOT NULL CHECK (expected_amount > 0),
  status VARCHAR(16) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'paid', 'cancelled')),
  paid_sale_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sales_installment_schedule_payment_link CHECK (
    (status = 'paid' AND paid_sale_id IS NOT NULL)
    OR (status <> 'paid' AND paid_sale_id IS NULL)
  ),
  CONSTRAINT sales_installment_schedule_number_unique
    UNIQUE (tenant_id, installment_plan_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_sales_installment_schedule_due
  ON sales_installment_schedule (tenant_id, due_date, status);
CREATE INDEX IF NOT EXISTS idx_sales_installment_schedule_plan
  ON sales_installment_schedule (tenant_id, installment_plan_id, installment_number);

-- Compatibilidade com parcelamentos já existentes: conserva exatamente a
-- agenda que o sistema antigo projetava; nenhum faturamento ou venda é criado.
WITH latest AS (
  SELECT DISTINCT ON (tenant_id, installment_plan_id)
         tenant_id, installment_plan_id, installment_number, installment_total,
         installment_frequency, next_installment_due_date,
         COALESCE(next_installment_amount, amount) AS expected_amount,
         created_by, is_settlement, status
    FROM sales
   WHERE installment_plan_id IS NOT NULL
     AND installment_total IS NOT NULL
   ORDER BY tenant_id, installment_plan_id,
            installment_number DESC, closed_at DESC, created_at DESC
), open_plans AS (
  SELECT * FROM latest
   WHERE NOT is_settlement
     AND installment_number < installment_total
     AND LOWER(COALESCE(status, 'confirmed')) NOT IN ('canceled','cancelled','refunded','reversed','invalid')
), projected AS (
  SELECT open_plans.*,
         open_plans.installment_number + series.position AS target_number,
         CASE COALESCE(open_plans.installment_frequency, 'monthly')
           WHEN 'weekly' THEN open_plans.next_installment_due_date + ((series.position - 1) * 7)
           WHEN 'monthly' THEN (open_plans.next_installment_due_date + make_interval(months => series.position - 1))::date
           ELSE open_plans.next_installment_due_date
         END AS target_due_date
    FROM open_plans
    CROSS JOIN LATERAL generate_series(
      1,
      CASE WHEN COALESCE(open_plans.installment_frequency, 'monthly') = 'manual'
        THEN 1
        ELSE open_plans.installment_total - open_plans.installment_number
      END
    ) AS series(position)
   WHERE open_plans.next_installment_due_date IS NOT NULL
)
INSERT INTO sales_installment_schedule (
  tenant_id, installment_plan_id, installment_number, installment_total,
  due_date, expected_amount, created_by
)
SELECT tenant_id, installment_plan_id, target_number, installment_total,
       target_due_date, expected_amount, created_by
  FROM projected
ON CONFLICT (tenant_id, installment_plan_id, installment_number) DO NOTHING;
