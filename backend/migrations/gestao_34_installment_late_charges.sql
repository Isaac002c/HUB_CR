-- Registra separadamente valores recebidos como multa/juros de atraso para
-- que não aumentem o saldo principal programado nem a base de comissão.
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS late_charges_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
