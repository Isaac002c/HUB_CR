-- Preserva o rótulo escolhido para o responsável da venda quando uma mesma
-- conta operacional possui mais de uma identificação comercial (neste caso,
-- "CR Recursos" e "Supervisão"). Não altera vínculos, comissão
-- nem preenche/regrava vendas históricas.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS seller_display_name_snapshot VARCHAR(255);
