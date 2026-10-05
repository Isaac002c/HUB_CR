-- Passagem é um valor mensal substitutivo por colaborador, não um acumulador.
-- Normaliza a competência para o primeiro dia do mês e mantém somente o
-- lançamento mais recente quando a interface antiga criou duplicatas.

UPDATE collaborator_costs
   SET competence = date_trunc('month', competence)::date,
       updated_at = NOW()
 WHERE category = 'transport'
   AND NOT recurring
   AND competence IS DISTINCT FROM date_trunc('month', competence)::date;

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, collaborator_id, competence
           ORDER BY created_at DESC, id DESC
         ) AS row_number
    FROM collaborator_costs
   WHERE category = 'transport'
     AND NOT recurring
)
DELETE FROM collaborator_costs AS cost
 USING ranked
 WHERE cost.id = ranked.id
   AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_collaborator_monthly_transport
  ON collaborator_costs (tenant_id, collaborator_id, competence)
  WHERE category = 'transport' AND NOT recurring;
