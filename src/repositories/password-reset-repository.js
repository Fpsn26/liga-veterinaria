export function createPasswordResetRepository(pool) {
  const valid = `SELECT t.id, t.student_id, s.institutional_email, s.password_hash
    FROM password_reset_tokens t JOIN students s ON s.id = t.student_id
    WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.invalidated_at IS NULL
      AND t.expires_at > clock_timestamp() AND s.status = 'active'`;
  return {
    async issue(identifier, hash) {
      // Limite por conta também vale entre processos e entre email/matrícula.
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const student = (await client.query(`SELECT id, institutional_email, password_hash FROM students
          WHERE status = 'active' AND (registration_number = $1 OR lower(institutional_email) = lower($1)) FOR UPDATE`, [identifier])).rows[0];
        let issued = false;
        if (student) {
          const recent = await client.query(`SELECT 1 FROM password_reset_tokens WHERE student_id = $1
            AND created_at > clock_timestamp() - INTERVAL '1 minute' LIMIT 1`, [student.id]);
          if (!recent.rows.length) {
            await client.query('INSERT INTO password_reset_tokens (student_id, token_hash) VALUES ($1, $2)', [student.id, hash]);
            issued = true;
          }
        }
        await client.query('COMMIT');
        return issued ? student : null;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    async find(hash) { return (await pool.query(valid, [hash])).rows[0] ?? null; },
    async invalidate(hash) {
      await pool.query('UPDATE password_reset_tokens SET invalidated_at = clock_timestamp() WHERE token_hash = $1 AND used_at IS NULL', [hash]);
    },
    async consume(hash, passwordHash, matches) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Ordem única de locks por aluno: serializa consumo de links diferentes.
        const owner = (await client.query('SELECT student_id FROM password_reset_tokens WHERE token_hash = $1', [hash])).rows[0];
        if (owner) await client.query('SELECT id FROM students WHERE id = $1 FOR UPDATE', [owner.student_id]);
        const row = (await client.query(valid, [hash])).rows[0];
        if (!row || !matches(row)) { await client.query('ROLLBACK'); return false; }
        const consumed = await client.query(`UPDATE password_reset_tokens SET used_at = statement_timestamp()
          WHERE id = $1 AND expires_at > statement_timestamp() RETURNING id`, [row.id]);
        if (!consumed.rows.length) { await client.query('ROLLBACK'); return false; }
        await client.query('UPDATE students SET password_hash = $1 WHERE id = $2', [passwordHash, row.student_id]);
        await client.query(`UPDATE password_reset_tokens SET invalidated_at = clock_timestamp()
          WHERE student_id = $1 AND id <> $2 AND used_at IS NULL AND invalidated_at IS NULL`, [row.student_id, row.id]);
        await client.query('COMMIT');
        return true;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
}
