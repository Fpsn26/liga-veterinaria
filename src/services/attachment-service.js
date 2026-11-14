import { randomUUID, createHash } from 'node:crypto';

export class AttachmentError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new AttachmentError(status, message); };
const identifier = value => {
  if (!/^[1-9]\d{0,18}$/.test(value ?? '') || BigInt(value) > 9223372036854775807n) fail(400, 'Identificador inválido.');
  return value;
};
const uuid = value => {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value ?? '')) fail(400, 'Anexo inválido.');
  return value;
};
export function validateAttachment(data, name, mime) {
  if (!Buffer.isBuffer(data) || !data.length) fail(400, 'Escolha um arquivo.');
  if (data.length > 4 * 1024 * 1024) fail(413, 'O arquivo deve ter até 4 MB.');
  if (typeof name !== 'string' || !name.trim() || name.length > 200 || /[\x00-\x1f\x7f/\\]/.test(name)) fail(400, 'Nome de arquivo inválido.');
  const type = mime?.split(';')[0].toLowerCase();
  const pdf = /\.pdf$/i.test(name) && type === 'application/pdf' && data.subarray(0, 5).toString() === '%PDF-' && data.subarray(-1024).includes(Buffer.from('%%EOF'));
  const jpg = /\.jpe?g$/i.test(name) && type === 'image/jpeg' && data.subarray(0, 3).equals(Buffer.from([255, 216, 255])) && data.subarray(-2).equals(Buffer.from([255, 217]));
  const png = /\.png$/i.test(name) && type === 'image/png' && data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && data.subarray(12,16).toString() === 'IHDR' && data.subarray(-8,-4).toString() === 'IEND';
  if (!pdf && !jpg && !png) fail(415, 'Envie um PDF, JPG ou PNG válido com a extensão correspondente.');
  return { name: name.trim(), mime: type, size: data.length, hash: createHash('sha256').update(data).digest('hex') };
}
export const attachmentColumns = `id::text, name, mime_type AS "mimeType", byte_size AS size`;
export const attachmentJson = (student, meeting) => `COALESCE((SELECT jsonb_agg(jsonb_build_object('id', f.id::text, 'name', f.name, 'mimeType', f.mime_type, 'size', f.byte_size) ORDER BY f.created_at, f.id) FROM lahvet_private.attachments f WHERE f.student_id = ${student} AND f.meeting_id = ${meeting}), '[]'::jsonb)`;

export function createAttachmentService(pool, storage) {
  async function cleanup() {
    const rows = (await pool.query(`SELECT q.object_path, q.bucket FROM lahvet_private.attachment_deletions q
      WHERE NOT EXISTS (SELECT 1 FROM lahvet_private.attachments f WHERE f.object_path = q.object_path)
      ORDER BY q.created_at LIMIT 20`)).rows;
    for (const row of rows) {
      try {
        await storage.remove(row.bucket, row.object_path);
        await pool.query('DELETE FROM lahvet_private.attachment_deletions WHERE object_path = $1', [row.object_path]);
      } catch { console.error('Remoção de anexo pendente; execute storage:cleanup.'); break; }
    }
  }
  return {
    cleanup,
    async upload(meetingId, studentId, data, name, mime) {
      identifier(meetingId); identifier(studentId);
      const file = validateAttachment(data, name, mime);
      const id = randomUUID();
      const path = `${meetingId}/${studentId}/${id}`;
      const client = await pool.connect();
      let attemptedUpload = false;
      try {
        await client.query('BEGIN');
        await client.query('SELECT id FROM meetings WHERE id = $1 FOR UPDATE', [meetingId]);
        const absence = await client.query("SELECT 1 FROM attendance WHERE meeting_id = $1 AND student_id = $2 AND status = 'absent'", [meetingId, studentId]);
        if (!absence.rows.length) fail(409, 'Salve uma falta antes de anexar o documento.');
        attemptedUpload = true;
        await storage.upload(storage.bucket, path, data, file.mime);
        const result = await client.query(`INSERT INTO lahvet_private.attachments(id, student_id, meeting_id, object_path, bucket, name, mime_type, byte_size, sha256)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${attachmentColumns}`,
        [id, studentId, meetingId, path, storage.bucket, file.name, file.mime, file.size, file.hash]);
        await client.query('COMMIT');
        return { attachment: result.rows[0] };
      } catch (error) {
        await client.query('ROLLBACK');
        // Also queue uncertain uploads: a provider timeout may occur after it stored the bytes.
        if (attemptedUpload) await client.query('INSERT INTO lahvet_private.attachment_deletions(object_path,bucket) VALUES ($1,$2) ON CONFLICT DO NOTHING', [path, storage.bucket]);
        throw error;
      } finally { client.release(); }
    },
    async remove(id) {
      uuid(id);
      const result = await pool.query(`DELETE FROM lahvet_private.attachments WHERE id = $1 RETURNING id`, [id]);
      if (!result.rows.length) fail(404, 'Anexo não encontrado.');
      await cleanup();
      return { removed: true };
    },
    async download(id, user) {
      uuid(id);
      const file = (await pool.query(`SELECT f.* FROM lahvet_private.attachments f JOIN attendance a USING(student_id, meeting_id)
        WHERE f.id = $1 AND a.status = 'absent'`, [id])).rows[0];
      if (!file || (user.role !== 'admin' && String(file.student_id) !== user.id)) fail(404, 'Anexo não encontrado.');
      const data = await storage.download(file.bucket, file.object_path);
      if (data.length !== file.byte_size || createHash('sha256').update(data).digest('hex') !== file.sha256) fail(503, 'Anexo temporariamente indisponível.');
      return { file, data };
    },
  };
}
