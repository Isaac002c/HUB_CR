UPDATE users AS supervision
   SET name = 'Camila Rodrigues Pereira',
       updated_at = NOW()
  FROM tenants AS tenant
 WHERE supervision.tenant_id = tenant.id
   AND tenant.slug = 'cr-recursos'
   AND LOWER(supervision.email) = 'supervisao@crrecursos.com.br'
   AND supervision.name IS DISTINCT FROM 'Camila Rodrigues Pereira';
