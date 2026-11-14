-- Contador transacional: inserções concorrentes são serializadas; rollback não
-- consome número. O contador não deve ser manipulado pelas rotas da aplicação.
CREATE TABLE meeting_number_counter (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
INSERT INTO meeting_number_counter (singleton) VALUES (true);

CREATE TABLE meetings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number bigint NOT NULL UNIQUE CHECK (number > 0),
  meeting_date date NOT NULL UNIQUE,
  meeting_time time NOT NULL,
  activity text NOT NULL CHECK (length(btrim(activity)) > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'held', 'cancelled')),
  attendance_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (NOT attendance_completed OR status = 'held')
);

CREATE FUNCTION assign_meeting_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.number IS DISTINCT FROM OLD.number THEN
      RAISE EXCEPTION 'O número da reunião não pode ser alterado.';
    END IF;
  ELSE
    IF NEW.number IS NOT NULL THEN
      RAISE EXCEPTION 'O número da reunião é gerado automaticamente.';
    END IF;
    UPDATE meeting_number_counter SET last_number = last_number + 1
      WHERE singleton = true RETURNING last_number INTO NEW.number;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Contador de reuniões indisponível.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER meetings_number BEFORE INSERT OR UPDATE ON meetings
FOR EACH ROW EXECUTE FUNCTION assign_meeting_number();

CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON meetings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER meetings_preserve_history BEFORE DELETE ON meetings
FOR EACH ROW EXECUTE FUNCTION prevent_history_deletion();

COMMENT ON COLUMN meetings.attendance_completed IS 'Só marcar após validar a chamada completa; essa validação será implementada na etapa 5.';
