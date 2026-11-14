export function createAuthRepository(pool) {
  return {
    async findByLogin(identifier) {
      const result = identifier.includes('@')
        ? await pool.query('SELECT id, name, registration_number, password_hash, status FROM students WHERE lower(institutional_email) = lower($1)', [identifier])
        : await pool.query('SELECT id, name, registration_number, password_hash, status FROM students WHERE registration_number = $1', [identifier]);
      return result.rows[0] ?? null;
    },
    async findById(id) {
      return (await pool.query('SELECT id, name, registration_number, password_hash, status FROM students WHERE id = $1', [id])).rows[0] ?? null;
    },
  };
}
