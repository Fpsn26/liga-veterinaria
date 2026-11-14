CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

CREATE FUNCTION prevent_history_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Preserve o histórico: utilize desligamento ou cancelamento.';
END;
$$;

CREATE TABLE students (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  registration_number text NOT NULL UNIQUE
    CHECK (length(registration_number) > 0 AND registration_number = btrim(registration_number)),
  institutional_email text NOT NULL
    CHECK (institutional_email = btrim(institutional_email))
    CHECK (institutional_email ~* '^[a-z0-9.!#$%&''*+/=?^_`{|}~-]+@alunos[.]unicerrado[.]edu[.]br$'),
  password_hash text NOT NULL CHECK (length(btrim(password_hash)) > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX students_email_unique ON students (lower(institutional_email));
CREATE INDEX students_name_idx ON students (name);

CREATE TRIGGER students_updated_at BEFORE UPDATE ON students
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER students_preserve_history BEFORE DELETE ON students
FOR EACH ROW EXECUTE FUNCTION prevent_history_deletion();

COMMENT ON COLUMN students.password_hash IS 'Somente hash de senha; nunca armazenar a senha original.';
COMMENT ON COLUMN students.status IS 'active = ativo; dismissed = desligado, com histórico preservado.';
