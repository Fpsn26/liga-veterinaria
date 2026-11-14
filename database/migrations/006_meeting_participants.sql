CREATE TABLE meeting_participants (
  meeting_id bigint NOT NULL REFERENCES meetings (id) ON DELETE RESTRICT,
  student_id bigint NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (meeting_id, student_id)
);
CREATE INDEX meeting_participants_student_idx ON meeting_participants (student_id);

-- Preserva chamadas já lançadas antes desta migração, sem tentar inferir a
-- situação histórica de alunos que não possuem lançamento na reunião.
INSERT INTO meeting_participants (meeting_id, student_id)
SELECT meeting_id, student_id FROM attendance;

COMMENT ON TABLE meeting_participants IS 'Participantes fixados ao iniciar a reunião; desligamentos posteriores não alteram a chamada.';
