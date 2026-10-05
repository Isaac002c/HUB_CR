-- Corrige as identidades funcionais da CR Recursos em todo o sistema.
-- A conta MASTER representa a empresa/proprietária; a conta de supervisão
-- representa a função Supervisão. Também corrige vendas que, na versão
-- anterior, foram rotuladas como CR Recursos mas vinculadas à supervisora.

UPDATE users AS owner
   SET name = 'CR Recursos',
       updated_at = NOW()
  FROM tenants AS tenant
 WHERE owner.tenant_id = tenant.id
   AND tenant.slug = 'cr-recursos'
   AND LOWER(owner.role) = 'master'
   AND COALESCE(owner.is_active, true)
   AND owner.name IS DISTINCT FROM 'CR Recursos';

UPDATE users AS supervision
   SET name = 'Supervisão',
       updated_at = NOW()
  FROM tenants AS tenant
 WHERE supervision.tenant_id = tenant.id
   AND tenant.slug = 'cr-recursos'
   AND LOWER(supervision.email) = 'supervisao@crrecursos.com.br'
   AND supervision.name IS DISTINCT FROM 'Supervisão';

WITH identities AS (
  SELECT tenant.id AS tenant_id,
         owner.id AS owner_id,
         supervision.id AS supervision_id
    FROM tenants AS tenant
    JOIN users AS owner
      ON owner.tenant_id = tenant.id
     AND LOWER(owner.role) = 'master'
     AND COALESCE(owner.is_active, true)
    JOIN users AS supervision
      ON supervision.tenant_id = tenant.id
     AND LOWER(supervision.email) = 'supervisao@crrecursos.com.br'
   WHERE tenant.slug = 'cr-recursos'
)
UPDATE sales AS sale
   SET seller_id = identities.owner_id,
       team_id = NULL,
       seller_role_snapshot = 'master',
       seller_display_name_snapshot = 'CR Recursos',
       supervisor_id = NULL,
       commission_percentage = 0,
       commissionable_amount = 0,
       commission_trigger_amount = 0,
       commission_amount = 0,
       updated_at = NOW()
  FROM identities
 WHERE sale.tenant_id = identities.tenant_id
   AND sale.seller_id = identities.supervision_id
   AND sale.seller_display_name_snapshot = 'CR Recursos';

UPDATE sales AS sale
   SET seller_display_name_snapshot = 'CR Recursos',
       updated_at = NOW()
  FROM users AS owner, tenants AS tenant
 WHERE sale.seller_id = owner.id
   AND sale.tenant_id = owner.tenant_id
   AND owner.tenant_id = tenant.id
   AND tenant.slug = 'cr-recursos'
   AND LOWER(owner.role) = 'master'
   AND sale.seller_display_name_snapshot IS DISTINCT FROM 'CR Recursos';

UPDATE sales AS sale
   SET seller_display_name_snapshot = 'Supervisão',
       updated_at = NOW()
  FROM users AS supervision, tenants AS tenant
 WHERE sale.seller_id = supervision.id
   AND sale.tenant_id = supervision.tenant_id
   AND supervision.tenant_id = tenant.id
   AND tenant.slug = 'cr-recursos'
   AND LOWER(supervision.email) = 'supervisao@crrecursos.com.br'
   AND sale.seller_display_name_snapshot IS DISTINCT FROM 'Supervisão';

UPDATE multas_leads AS lead
   SET created_by_name = creator.name,
       updated_at = NOW()
  FROM users AS creator, tenants AS tenant
 WHERE lead.created_by = creator.id
   AND lead.tenant_id = creator.tenant_id
   AND creator.tenant_id = tenant.id
   AND tenant.slug = 'cr-recursos'
   AND LOWER(creator.role) IN ('master', 'supervisor')
   AND lead.created_by_name IS DISTINCT FROM creator.name;
