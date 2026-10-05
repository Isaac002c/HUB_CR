-- Despesas operacionais do escritório e sincronização inicial de leads em
-- negociação com a carteira de clientes. Migração aditiva e idempotente.

CREATE TABLE IF NOT EXISTS office_expenses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expense_type  VARCHAR(20) NOT NULL CHECK (expense_type IN ('fixed', 'variable')),
  category      VARCHAR(40) NOT NULL,
  description   VARCHAR(180) NOT NULL,
  competence    DATE NOT NULL,
  due_date      DATE NOT NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  status        VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_office_expenses_tenant_competence
  ON office_expenses (tenant_id, competence, expense_type);

CREATE INDEX IF NOT EXISTS idx_office_expenses_tenant_due_date
  ON office_expenses (tenant_id, due_date, status);

-- Leads atualmente em negociação/fechados passam a aparecer em Clientes.
-- O CPF é normalizado para impedir duplicação de uma pessoa já cadastrada.
INSERT INTO clients
  (tenant_id, name, cpf, cnh, first_cnh, birth_date, phone, notes, status, lead_id, created_by)
SELECT ml.tenant_id,
       ml.name,
       NULLIF(regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g'), ''),
       NULLIF(TRIM(ml.cnh), ''),
       ml.first_license_date,
       ml.birth_date,
       NULLIF(TRIM(ml.phone), ''),
       NULLIF(CONCAT_WS(E'\n',
         CASE WHEN NULLIF(TRIM(ml.source), '') IS NOT NULL THEN 'Origem: ' || TRIM(ml.source) END,
         CASE WHEN NULLIF(TRIM(ml.created_by_name), '') IS NOT NULL THEN 'Consultor: ' || TRIM(ml.created_by_name) END,
         NULLIF(TRIM(ml.notes), '')
       ), ''),
       CASE WHEN ml.status = 'fechado' THEN 'fechado' ELSE 'negociacao' END,
       ml.id,
       owner.id
  FROM multas_leads ml
  LEFT JOIN users owner
    ON owner.id = ml.created_by
   AND owner.tenant_id = ml.tenant_id
 WHERE ml.status IN ('negociacao', 'fechado')
   AND NOT EXISTS (
     SELECT 1 FROM clients linked
      WHERE linked.tenant_id = ml.tenant_id AND linked.lead_id = ml.id
   )
   AND (
     NULLIF(regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g'), '') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM clients same_person
        WHERE same_person.tenant_id = ml.tenant_id
          AND regexp_replace(COALESCE(same_person.cpf, ''), '\D', '', 'g') = regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g')
     )
   );
