-- Substitui o identificador provisório da supervisão da CR Recursos pelo login
-- definitivo, preservando a senha e todos os vínculos já existentes.

UPDATE users u
   SET name = 'Supervisão',
       role = 'supervisor',
       is_active = true,
       updated_at = NOW()
  FROM tenants t
 WHERE u.tenant_id = t.id
   AND t.slug = 'cr-recursos'
   AND LOWER(u.email) = 'supervisao@crrecursos.com.br';

UPDATE users u
   SET name = 'Supervisão',
       email = 'supervisao@crrecursos.com.br',
       role = 'supervisor',
       is_active = true,
       updated_at = NOW()
  FROM tenants t
 WHERE u.tenant_id = t.id
   AND t.slug = 'cr-recursos'
   AND LOWER(u.email) IN (
     'supervisao.provisorio@cr-recursos.app',
     'supervisor.provisorio@cr-recursos.app'
   )
   AND NOT EXISTS (
     SELECT 1
       FROM users official
      WHERE official.tenant_id = u.tenant_id
        AND official.id <> u.id
        AND LOWER(official.email) = 'supervisao@crrecursos.com.br'
   );
