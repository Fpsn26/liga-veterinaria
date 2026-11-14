CREATE SCHEMA lahvet_private;
REVOKE ALL ON SCHEMA lahvet_private FROM PUBLIC;

CREATE TABLE lahvet_private.attachments (
  id uuid PRIMARY KEY,
  student_id bigint NOT NULL,
  meeting_id bigint NOT NULL,
  object_path text NOT NULL UNIQUE,
  bucket text NOT NULL,
  name text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 4194304),
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id, meeting_id) REFERENCES attendance(student_id, meeting_id) ON DELETE CASCADE
);
CREATE TABLE lahvet_private.attachment_deletions (
  object_path text PRIMARY KEY,
  bucket text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE lahvet_private.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lahvet_private.attachment_deletions ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION lahvet_private.queue_attachment_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO lahvet_private.attachment_deletions(object_path, bucket)
    VALUES (OLD.object_path, OLD.bucket) ON CONFLICT DO NOTHING;
  RETURN OLD;
END;
$$;
CREATE TRIGGER attachment_deleted BEFORE DELETE ON lahvet_private.attachments
FOR EACH ROW EXECUTE FUNCTION lahvet_private.queue_attachment_deletion();

CREATE FUNCTION lahvet_private.clear_present_attachments() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status <> 'absent' THEN
    DELETE FROM lahvet_private.attachments WHERE student_id = NEW.student_id AND meeting_id = NEW.meeting_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER attendance_clear_attachments AFTER UPDATE OF status ON attendance
FOR EACH ROW EXECUTE FUNCTION lahvet_private.clear_present_attachments();
REVOKE ALL ON ALL TABLES IN SCHEMA lahvet_private FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA lahvet_private FROM PUBLIC;
