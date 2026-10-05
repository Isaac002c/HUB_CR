-- Política global de comissão da CR Recursos.
-- Preserva os snapshots das vendas existentes e normaliza apenas a configuração
-- usada em novas vendas.

ALTER TABLE users
  ALTER COLUMN commission_percentage SET DEFAULT 10;

ALTER TABLE users
  ALTER COLUMN commission_threshold SET DEFAULT 7500;

UPDATE users
   SET commission_percentage = 10,
       commission_threshold = 7500,
       updated_at = NOW()
 WHERE commission_percentage IS DISTINCT FROM 10
    OR commission_threshold IS DISTINCT FROM 7500;
