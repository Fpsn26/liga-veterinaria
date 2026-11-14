export function createPasswordChangeRepository(pool) {
  return {
    async change(studentId, expectedHash, newHash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Comparação atômica impede sobrescrever uma troca concorrente ou senha alterada.
        const result = await client.query(`UPDATE students SET password_hash = $1
          WHERE id = $2 AND password_hash = $3 AND status = 'active' RETURNING id`, [newHash, studentId, expectedHash]);
        if (!result.rows.length) { await client.query('ROLLBACK'); return false; }
        // Tokens do antigo fluxo de email deixam de valer, sem apagar histórico/migrações.
        await client.query(`UPDATE password_reset_tokens SET invalidated_at = clock_timestamp()
          WHERE student_id = $1 AND used_at IS NULL AND invalidated_at IS NULL`, [studentId]);
        await client.query('COMMIT');
        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
  };
}
