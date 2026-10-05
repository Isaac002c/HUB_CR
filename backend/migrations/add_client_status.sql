-- ================================================
-- Migration: Add status column to clients table
-- Run once in production database
-- ================================================

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'negociacao';

-- Garante que registros antigos tenham valor padrão
UPDATE clients
  SET status = 'negociacao'
  WHERE status IS NULL OR status = '';

-- Adiciona constraint de valores permitidos
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_status_check;

ALTER TABLE clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('negociacao', 'fechado'));

COMMENT ON COLUMN clients.status IS
  'Status comercial do cliente: negociacao = em processo de fechamento, fechado = contrato assinado';
