-- Ocultação individual de cobranças programadas; não altera vendas nem o status compartilhado.
CREATE TABLE IF NOT EXISTS sales_installment_schedule_dismissals (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES sales_installment_schedule(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, schedule_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_installment_schedule_dismissals_user
  ON sales_installment_schedule_dismissals (tenant_id, user_id, schedule_id);
