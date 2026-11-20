-- Aumentar a versão invalida tokens antigos apenas do usuário afetado.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INTEGER;

UPDATE users SET session_version = 0 WHERE session_version IS NULL;

ALTER TABLE users
  ALTER COLUMN session_version SET DEFAULT 0,
  ALTER COLUMN session_version SET NOT NULL;
