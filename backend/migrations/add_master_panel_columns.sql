-- ============================================================
-- Migration: colunas para o Painel de Administração Global
-- Aditiva, idempotente, sem nada destrutivo.
--   tenants.status  -> ativo/inativo (default 'ativo' p/ não bloquear ninguém)
--   tenants.email   -> contato do tenant (opcional)
--   users.last_login-> último acesso (preenchido no login)
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ativo';
UPDATE tenants SET status = 'ativo' WHERE status IS NULL;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;

-- ----------------------------------------------------------------
-- ROLLBACK:
--   ALTER TABLE users   DROP COLUMN IF EXISTS last_login;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS email;
--   ALTER TABLE tenants DROP COLUMN IF EXISTS status;
-- ----------------------------------------------------------------
