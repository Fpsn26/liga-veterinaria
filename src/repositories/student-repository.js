import { StudentError } from '../services/student-service.js';

const fields = 'id::text AS id, name, registration_number AS "registrationNumber", institutional_email AS email, status';

export function createStudentRepository(pool) {
  return {
    async list() {
      return (await pool.query(`SELECT ${fields} FROM students ORDER BY name, id`)).rows;
    },
    async add(data, hash) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Impede que uma reunião seja marcada como realizada entre a verificação
        // e a inclusão do aluno. O lock é liberado no commit/rollback.
        await client.query('LOCK TABLE meetings IN SHARE MODE');
        if ((await client.query("SELECT 1 FROM meetings WHERE status = 'held' LIMIT 1")).rows.length) {
          throw new StudentError(409, 'Não é permitido adicionar alunos após o início das atividades.');
        }
        const result = await client.query(`INSERT INTO students
          (name, registration_number, institutional_email, password_hash)
          VALUES ($1, $2, $3, $4) RETURNING ${fields}`,
        [data.name, data.registrationNumber, data.email, hash]);
        await client.query('COMMIT');
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally { client.release(); }
    },
    async edit(id, data) {
      return (await pool.query(`UPDATE students SET name = $1, registration_number = $2, institutional_email = $3
        WHERE id = $4 RETURNING ${fields}`, [data.name, data.registrationNumber, data.email, id])).rows[0];
    },
    async dismiss(id) {
      return (await pool.query(`UPDATE students SET status = 'dismissed'
        WHERE id = $1 AND status = 'active' RETURNING ${fields}`, [id])).rows[0];
    },
  };
}
