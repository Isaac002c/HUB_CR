-- Imagem de resultado exibida exclusivamente na vitrine de processos deferidos.
-- Não altera o arquivo físico: a URL aponta para o storage de uploads já existente.

ALTER TABLE fines
  ADD COLUMN IF NOT EXISTS deferred_image_url TEXT;

ALTER TABLE fines
  ADD COLUMN IF NOT EXISTS deferred_image_updated_at TIMESTAMPTZ;
