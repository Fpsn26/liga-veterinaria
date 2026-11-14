CREATE TABLE password_reset_tokens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id bigint NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (length(btrim(token_hash)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamptz NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes'),
  used_at timestamptz,
  invalidated_at timestamptz,
  CHECK (expires_at = created_at + INTERVAL '30 minutes'),
  CHECK (used_at IS NULL OR (used_at >= created_at AND used_at < expires_at)),
  CHECK (invalidated_at IS NULL OR invalidated_at >= created_at)
);

CREATE INDEX password_reset_tokens_student_idx ON password_reset_tokens (student_id);
CREATE INDEX password_reset_tokens_expiration_idx ON password_reset_tokens (expires_at);

COMMENT ON COLUMN password_reset_tokens.token_hash IS 'Somente hash do token; nunca armazenar ou registrar o token original.';
COMMENT ON TABLE password_reset_tokens IS 'Consumo atômico, expiração e invalidação serão aplicados pelo serviço de troca de senha na etapa 7.';
