-- Impede novos CPFs duplicados no cadastro comercial, sem apagar nem bloquear
-- a edição dos registros históricos já existentes. O mesmo CPF pode existir em
-- um lead e no cliente gerado a partir dele somente quando ambos estão ligados
-- por clients.lead_id.

CREATE OR REPLACE FUNCTION enforce_person_cpf_unique_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cpf_digits TEXT;
  old_cpf_digits TEXT;
  conflict_found BOOLEAN;
BEGIN
  cpf_digits := regexp_replace(COALESCE(NEW.cpf, ''), '\D', '', 'g');

  IF cpf_digits = '' THEN
    NEW.cpf := NULL;
    RETURN NEW;
  END IF;

  -- Permite continuar editando cadastros históricos duplicados quando o CPF
  -- não foi trocado, inclusive caso algum CPF legado esteja incompleto. A
  -- máscara é removida durante a própria edição.
  IF TG_OP = 'UPDATE' THEN
    old_cpf_digits := regexp_replace(COALESCE(OLD.cpf, ''), '\D', '', 'g');
    IF old_cpf_digits = cpf_digits THEN
      NEW.cpf := cpf_digits;
      RETURN NEW;
    END IF;
  END IF;

  IF length(cpf_digits) <> 11 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'CPF deve ter 11 dígitos',
      CONSTRAINT = 'person_cpf_digits_valid';
  END IF;

  -- Serializa cadastros concorrentes do mesmo CPF em um tenant, cobrindo o
  -- intervalo entre a validação da API e a gravação definitiva.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.tenant_id::text || ':' || cpf_digits, 0)
  );

  IF TG_TABLE_NAME = 'multas_leads' THEN
    SELECT EXISTS (
      SELECT 1
        FROM multas_leads ml
       WHERE ml.tenant_id = NEW.tenant_id
         AND ml.id <> NEW.id
         AND regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g') = cpf_digits
    ) OR EXISTS (
      SELECT 1
        FROM clients c
       WHERE c.tenant_id = NEW.tenant_id
         AND c.lead_id IS DISTINCT FROM NEW.id
         AND regexp_replace(COALESCE(c.cpf, ''), '\D', '', 'g') = cpf_digits
    )
      INTO conflict_found;
  ELSE
    SELECT EXISTS (
      SELECT 1
        FROM clients c
       WHERE c.tenant_id = NEW.tenant_id
         AND c.id <> NEW.id
         AND regexp_replace(COALESCE(c.cpf, ''), '\D', '', 'g') = cpf_digits
    ) OR EXISTS (
      SELECT 1
        FROM multas_leads ml
       WHERE ml.tenant_id = NEW.tenant_id
         AND ml.id IS DISTINCT FROM NEW.lead_id
         AND regexp_replace(COALESCE(ml.cpf, ''), '\D', '', 'g') = cpf_digits
    )
      INTO conflict_found;
  END IF;

  IF conflict_found THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'CPF já cadastrado no sistema',
      CONSTRAINT = 'person_cpf_unique_guard';
  END IF;

  NEW.cpf := cpf_digits;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_multas_leads_cpf_unique_guard ON multas_leads;
CREATE TRIGGER trg_multas_leads_cpf_unique_guard
BEFORE INSERT OR UPDATE ON multas_leads
FOR EACH ROW
EXECUTE FUNCTION enforce_person_cpf_unique_guard();

DROP TRIGGER IF EXISTS trg_clients_cpf_unique_guard ON clients;
CREATE TRIGGER trg_clients_cpf_unique_guard
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION enforce_person_cpf_unique_guard();
