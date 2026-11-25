-- Permite registrar quando o MASTER definiu encargos diferentes do cálculo contratual.
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS late_charges_override_amount NUMERIC(14,2);
