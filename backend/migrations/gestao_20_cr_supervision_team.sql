-- Vincula as quatro consultoras solicitadas à equipe da conta de Supervisão
-- da CR Recursos. O vínculo organizacional é necessário para que os nomes
-- apareçam no painel com escopo de equipe e para o snapshot de comissão.

WITH supervision_team AS (
  SELECT DISTINCT ON (t.tenant_id)
         t.tenant_id,
         t.id AS team_id,
         supervisor.id AS supervisor_id
    FROM teams t
    JOIN users supervisor
      ON supervisor.id = t.supervisor_id
     AND supervisor.tenant_id = t.tenant_id
    JOIN tenants tenant ON tenant.id = t.tenant_id
   WHERE tenant.slug = 'cr-recursos'
     AND LOWER(supervisor.email) = 'supervisao@crrecursos.com.br'
     AND COALESCE(t.active, true) = true
   ORDER BY t.tenant_id, t.created_at ASC, t.id
)
UPDATE users consultant
   SET team_id = supervision.team_id,
       supervisor_id = supervision.supervisor_id,
       updated_at = NOW()
  FROM supervision_team supervision
 WHERE consultant.tenant_id = supervision.tenant_id
   AND consultant.role = 'seller'
   AND LOWER(consultant.email) IN (
     'marta@crrecursos.com.br',
     'laine@crrecursos.com.br',
     'larissa@crrecursos.com.br',
     'kamila@crrecursos.com.br'
   )
   AND (
     consultant.team_id IS DISTINCT FROM supervision.team_id
     OR consultant.supervisor_id IS DISTINCT FROM supervision.supervisor_id
   );
