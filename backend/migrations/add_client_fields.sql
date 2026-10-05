-- Add missing fields to clients table
-- Safe: uses IF NOT EXISTS

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS first_cnh DATE,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update updated_at trigger if needed (Postgres auto)
COMMENT ON COLUMN clients.birth_date IS 'Data de nascimento do cliente';
COMMENT ON COLUMN clients.first_cnh IS 'Data da primeira CNH';
COMMENT ON COLUMN clients.address IS 'Endereço completo';
COMMENT ON COLUMN clients.notes IS 'Observações/Informações adicionais';
