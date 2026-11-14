-- Estrutura utilizada por connect-pg-simple, sem criação automática em runtime.
CREATE TABLE user_sessions (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX user_sessions_expire_idx ON user_sessions (expire);
COMMENT ON TABLE user_sessions IS 'Sessões do servidor, incluindo tokens CSRF e versão das credenciais; sem senhas originais.';
