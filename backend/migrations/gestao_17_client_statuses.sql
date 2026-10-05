-- Permite que fichas originadas de leads mantenham o status comercial real.
-- O vínculo clients.lead_id continua sendo a fonte para sincronizar as duas telas.

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check CHECK (status IN (
  'entrada', 'possui_defensor', 'nao_quer_defender', 'negociacao',
  'fechado', 'perdido', 'nao_encontrado'
));

COMMENT ON COLUMN clients.status IS
  'Status comercial sincronizado com o lead vinculado quando clients.lead_id estiver preenchido.';
