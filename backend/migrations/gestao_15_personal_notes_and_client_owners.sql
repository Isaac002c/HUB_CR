-- Anotações particulares do consultor e recuperação segura de proprietários
-- de cadastros legados. A migração é aditiva e só preenche campos nulos.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS personal_notes TEXT;

-- Registros antigos de tarefas trazem o nome do responsável, mas alguns foram
-- importados antes da coluna created_by. Reata a autoria apenas quando há uma
-- correspondência exata de nome dentro da mesma empresa.
UPDATE multas_leads ml
   SET created_by = u.id,
       updated_at = NOW()
  FROM users u
 WHERE ml.tenant_id = u.tenant_id
   AND ml.created_by IS NULL
   AND NULLIF(TRIM(ml.created_by_name), '') IS NOT NULL
   AND LOWER(TRIM(ml.created_by_name)) = LOWER(TRIM(u.name));

-- O cliente fechado originado dessas tarefas passa a pertencer ao mesmo
-- consultor. CPF é normalizado, só campos sem dono são alterados e o agrupamento
-- evita qualquer atribuição ambígua.
WITH candidate_owners AS (
  SELECT ml.tenant_id,
         regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g') AS cpf_digits,
         MIN(ml.created_by::text)::uuid AS user_id
    FROM multas_leads ml
   WHERE ml.created_by IS NOT NULL
     AND regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g') <> ''
   GROUP BY ml.tenant_id, regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g')
  HAVING COUNT(DISTINCT ml.created_by) = 1
)
UPDATE clients c
   SET created_by = owner.user_id,
       updated_at = NOW()
  FROM candidate_owners owner
 WHERE c.tenant_id = owner.tenant_id
   AND c.created_by IS NULL
   AND regexp_replace(COALESCE(c.cpf, ''), '\D', '', 'g') = owner.cpf_digits;
