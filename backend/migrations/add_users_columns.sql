-- Script de Migração: Adicionar colunas role e seller_id na tabela users
-- Execute este SQL no seu banco de dados (via psql, pgAdmin, ou console do Neon)

-- 1. Adicionar coluna role (se não existir)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'seller';

-- 2. Adicionar coluna seller_id (se não existir)
-- Nota: Esta pode falhar se a tabela sellers não existir ainda
-- Se falhar, comente a linha abaixo e execute primeiro o setup_sellers
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_id UUID;

-- 3. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_seller_id ON users(seller_id);

-- 4. Atualizar usuários existentes para ter role 'admin'
UPDATE users SET role = 'admin' WHERE role IS NULL OR role = '';

-- Verificar resultado
SELECT id, name, email, role, seller_id FROM users LIMIT 10;
