-- Supervisão comercial e metas históricas por competência.
-- Aditiva/idempotente: preserva snapshots financeiros existentes e não altera
-- comissões de vendas já gravadas.

CREATE TABLE IF NOT EXISTS company_monthly_targets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  month_start DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_company_monthly_targets UNIQUE (tenant_id, month_start),
  CONSTRAINT ck_company_monthly_targets_first_day
    CHECK (month_start = date_trunc('month', month_start)::date)
);

CREATE TABLE IF NOT EXISTS user_monthly_targets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month_start DATE NOT NULL,
  amount      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_monthly_targets UNIQUE (tenant_id, user_id, month_start),
  CONSTRAINT ck_user_monthly_targets_first_day
    CHECK (month_start = date_trunc('month', month_start)::date)
);

CREATE INDEX IF NOT EXISTS idx_company_monthly_targets_period
  ON company_monthly_targets (tenant_id, month_start);
CREATE INDEX IF NOT EXISTS idx_user_monthly_targets_period
  ON user_monthly_targets (tenant_id, month_start, user_id);

-- Migra as metas gerais legadas sem apagar a tabela anterior. Instalações
-- novas podem não possuir `company_targets`, portanto a leitura é dinâmica.
DO $$
BEGIN
  IF to_regclass('public.company_targets') IS NOT NULL THEN
    EXECUTE $legacy$
      INSERT INTO company_monthly_targets (tenant_id, month_start, amount, created_at, updated_at)
      SELECT DISTINCT ON (ct.tenant_id, ct.year, ct.month)
             ct.tenant_id,
             make_date(ct.year, ct.month, 1),
             GREATEST(COALESCE(ct.target_value, 0), 0),
             COALESCE(ct.created_at, NOW()),
             COALESCE(ct.created_at, NOW())
        FROM company_targets ct
       WHERE ct.year BETWEEN 2000 AND 2200
         AND ct.month BETWEEN 1 AND 12
       ORDER BY ct.tenant_id, ct.year, ct.month,
                ct.created_at DESC NULLS LAST, ct.id DESC
      ON CONFLICT (tenant_id, month_start) DO NOTHING
    $legacy$;
  END IF;
END $$;

-- Preserva a meta individual que estava vigente no mês da migração. Meses
-- seguintes deixam de herdar automaticamente R$ 10 mil.
INSERT INTO user_monthly_targets (tenant_id, user_id, month_start, amount)
SELECT u.tenant_id, u.id, date_trunc('month', CURRENT_DATE)::date,
       GREATEST(COALESCE(u.monthly_sales_target, 0), 0)
  FROM users u
 WHERE COALESCE(u.monthly_sales_target, 0) > 0
ON CONFLICT (tenant_id, user_id, month_start) DO NOTHING;

ALTER TABLE users ALTER COLUMN monthly_sales_target SET DEFAULT 0;

-- Snapshots organizacionais da venda: o vínculo válido no fechamento deixa de
-- depender da equipe ou função atual do usuário.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_role_snapshot VARCHAR(30);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE sales s
   SET seller_role_snapshot = LOWER(u.role),
       team_id = COALESCE(s.team_id, u.team_id)
  FROM users u
 WHERE s.seller_id = u.id
   AND s.tenant_id = u.tenant_id
   AND (s.seller_role_snapshot IS NULL OR s.team_id IS NULL);

UPDATE sales s
   SET supervisor_id = t.supervisor_id
  FROM teams t
 WHERE s.team_id = t.id
   AND s.tenant_id = t.tenant_id
   AND s.supervisor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_supervision_period
  ON sales (tenant_id, supervisor_id, team_id, closed_at, status);
CREATE INDEX IF NOT EXISTS idx_sales_role_period
  ON sales (tenant_id, seller_role_snapshot, closed_at, status);

-- Inventário de configurações/snapshots antigos com 20%. Não altera vendas
-- históricas nem pagamentos: apenas registra o que precisa de decisão humana.
CREATE TABLE IF NOT EXISTS supervision_commission_legacy_audit (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id              UUID REFERENCES users(id) ON DELETE SET NULL,
  sale_id              UUID REFERENCES sales(id) ON DELETE SET NULL,
  occurrence_type      VARCHAR(40) NOT NULL,
  previous_percentage NUMERIC(5,2) NOT NULL,
  previous_amount     NUMERIC(14,2),
  status               VARCHAR(20) NOT NULL DEFAULT 'review_required',
  detected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_supervision_legacy_user
  ON supervision_commission_legacy_audit (tenant_id, user_id, occurrence_type)
  WHERE user_id IS NOT NULL AND sale_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_supervision_legacy_sale
  ON supervision_commission_legacy_audit (tenant_id, sale_id, occurrence_type)
  WHERE sale_id IS NOT NULL;

INSERT INTO supervision_commission_legacy_audit
  (tenant_id, user_id, occurrence_type, previous_percentage)
SELECT tenant_id, id, 'supervisor_user_configuration', commission_percentage
  FROM users
 WHERE LOWER(role) = 'supervisor' AND commission_percentage = 20
ON CONFLICT DO NOTHING;

INSERT INTO supervision_commission_legacy_audit
  (tenant_id, user_id, sale_id, occurrence_type, previous_percentage, previous_amount)
SELECT s.tenant_id, s.seller_id, s.id, 'supervisor_sale_snapshot',
       s.commission_percentage, s.commission_amount
  FROM sales s
 WHERE LOWER(COALESCE(s.seller_role_snapshot, '')) = 'supervisor'
   AND s.commission_percentage = 20
ON CONFLICT DO NOTHING;

-- Configuração usada apenas para novas vendas. Snapshots antigos permanecem.
UPDATE users
   SET commission_percentage = CASE
         WHEN LOWER(role) IN ('seller', 'supervisor') THEN 10 ELSE 0 END,
       commission_threshold = CASE
         WHEN LOWER(role) = 'seller' THEN 7500 ELSE 0 END,
       updated_at = NOW()
 WHERE commission_percentage IS DISTINCT FROM CASE
         WHEN LOWER(role) IN ('seller', 'supervisor') THEN 10 ELSE 0 END
    OR commission_threshold IS DISTINCT FROM CASE
         WHEN LOWER(role) = 'seller' THEN 7500 ELSE 0 END;
