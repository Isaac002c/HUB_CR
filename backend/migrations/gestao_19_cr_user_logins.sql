-- Credenciais iniciais solicitadas para a equipe CR Recursos.
-- Somente os hashes bcrypt ficam no repositório; as senhas temporárias devem
-- ser entregues diretamente aos usuários e alteradas após o primeiro acesso.

WITH desired(name, email, password_hash, role) AS (
  VALUES
    ('Supervisão', 'supervisao@crrecursos.com.br', '$2a$12$51gdtmDVsA8wu8eE5M5m1.2JOpnxyEkGYPs9HlvXnlsYbzgv5oUte', 'supervisor'),
    ('Marta Cristina', 'marta@crrecursos.com.br', '$2a$12$Sg.VwC04K.t0uYAJIm7gYuXUuPPIwK5SKxyAukAh6Na0kWi0jRMqK', 'seller'),
    ('Laine Tavares', 'laine@crrecursos.com.br', '$2a$12$bcmNFH1SpTTMXbNmEtxK.uWouvwtr87hwyncEj1YhAbNRFXy6HGGe', 'seller'),
    ('Larissa Nascimento', 'larissa@crrecursos.com.br', '$2a$12$kUGUNrvCUNnyzqv2d4o28exvUOWGlKpIiEJMHuhFsHXVE75ZGgpdm', 'seller'),
    ('Kamila Ferreira', 'kamila@crrecursos.com.br', '$2a$12$R48C9CfHdKZrY/wb2ZdKK.ucTaqCdfmyaT03dokmVQMLgaJ4ivgee', 'seller')
)
UPDATE users u
   SET name = d.name,
       password_hash = d.password_hash,
       role = d.role,
       is_active = true,
       updated_at = NOW()
  FROM tenants t, desired d
 WHERE u.tenant_id = t.id
   AND t.slug = 'cr-recursos'
   AND LOWER(u.email) = d.email;

WITH desired(name, email, password_hash, role) AS (
  VALUES
    ('Supervisão', 'supervisao@crrecursos.com.br', '$2a$12$51gdtmDVsA8wu8eE5M5m1.2JOpnxyEkGYPs9HlvXnlsYbzgv5oUte', 'supervisor'),
    ('Marta Cristina', 'marta@crrecursos.com.br', '$2a$12$Sg.VwC04K.t0uYAJIm7gYuXUuPPIwK5SKxyAukAh6Na0kWi0jRMqK', 'seller'),
    ('Laine Tavares', 'laine@crrecursos.com.br', '$2a$12$bcmNFH1SpTTMXbNmEtxK.uWouvwtr87hwyncEj1YhAbNRFXy6HGGe', 'seller'),
    ('Larissa Nascimento', 'larissa@crrecursos.com.br', '$2a$12$kUGUNrvCUNnyzqv2d4o28exvUOWGlKpIiEJMHuhFsHXVE75ZGgpdm', 'seller'),
    ('Kamila Ferreira', 'kamila@crrecursos.com.br', '$2a$12$R48C9CfHdKZrY/wb2ZdKK.ucTaqCdfmyaT03dokmVQMLgaJ4ivgee', 'seller')
)
INSERT INTO users (tenant_id, name, email, password_hash, role, is_active)
SELECT t.id, d.name, d.email, d.password_hash, d.role, true
  FROM tenants t
 CROSS JOIN desired d
 WHERE t.slug = 'cr-recursos'
   AND NOT EXISTS (
     SELECT 1
       FROM users u
      WHERE u.tenant_id = t.id
        AND LOWER(u.email) = d.email
   );

-- Algumas telas comerciais ainda consomem o cadastro legado de sellers.
-- Mantém os quatro logins de consultoria visíveis nesses seletores e vincula
-- cada usuário ao respectivo registro comercial.
WITH consultants(name, email, avatar) AS (
  VALUES
    ('Marta Cristina', 'marta@crrecursos.com.br', 'MC'),
    ('Laine Tavares', 'laine@crrecursos.com.br', 'LT'),
    ('Larissa Nascimento', 'larissa@crrecursos.com.br', 'LN'),
    ('Kamila Ferreira', 'kamila@crrecursos.com.br', 'KF')
)
INSERT INTO sellers (tenant_id, name, email, avatar, monthly_target, active)
SELECT t.id, c.name, c.email, c.avatar, 0, true
  FROM tenants t
 CROSS JOIN consultants c
 WHERE t.slug = 'cr-recursos'
   AND NOT EXISTS (
     SELECT 1
       FROM sellers s
      WHERE s.tenant_id = t.id
        AND LOWER(s.email) = c.email
   );

UPDATE users u
   SET seller_id = s.id,
       updated_at = NOW()
  FROM sellers s, tenants t
 WHERE u.tenant_id = t.id
   AND s.tenant_id = t.id
   AND t.slug = 'cr-recursos'
   AND u.role = 'seller'
   AND LOWER(u.email) = LOWER(s.email)
   AND u.seller_id IS DISTINCT FROM s.id;
