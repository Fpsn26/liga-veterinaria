import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createDatabasePool } from '../src/config/database.js';

const migrationsDirectory = new URL('./migrations/', import.meta.url);

// O cliente pertence ao chamador; toda a execução ocorre em uma transação.
export async function applyMigrations(client) {
  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  const applied = [];

  await client.query('BEGIN');
  try {
    // Serializa processos de migração concorrentes no mesmo banco.
    await client.query('SELECT pg_advisory_xact_lock(194801, 2)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    for (const name of files) {
      const sql = await readFile(new URL(name, migrationsDirectory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const result = await client.query(
        'SELECT checksum FROM schema_migrations WHERE name = $1', [name],
      );

      if (result.rows.length) {
        if (result.rows[0].checksum !== checksum) {
          throw new Error(`Migração já aplicada foi alterada: ${name}`);
        }
        continue;
      }

      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
        [name, checksum],
      );
      applied.push(name);
    }

    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  let pool;
  let client;
  try {
    pool = createDatabasePool();
    client = await pool.connect();
    const applied = await applyMigrations(client);
    console.log(applied.length ? `Migrações aplicadas: ${applied.join(', ')}` : 'Banco atualizado; nenhuma migração pendente.');
  } catch {
    // Erros do driver podem conter dados pessoais ou credenciais.
    console.error('Não foi possível aplicar as migrações. Confira o ambiente, a conexão e a integridade dos arquivos SQL.');
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool?.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
