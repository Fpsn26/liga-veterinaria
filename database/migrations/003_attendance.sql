CREATE TABLE attendance (
  student_id bigint NOT NULL REFERENCES students (id) ON DELETE RESTRICT,
  meeting_id bigint NOT NULL REFERENCES meetings (id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('present', 'absent')),
  justification text CHECK (justification IS NULL OR length(btrim(justification)) > 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, meeting_id),
  CHECK (justification IS NULL OR status = 'absent')
);

CREATE INDEX attendance_meeting_idx ON attendance (meeting_id);

CREATE TRIGGER attendance_updated_at BEFORE UPDATE ON attendance
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE attendance IS 'Ausência de registro é chamada pendente, não falta automática.';
COMMENT ON COLUMN attendance.justification IS 'Justifica uma falta sem abonar nem mudar o estado absent.';
