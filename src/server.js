import { createApp } from './app.js';
import { loadAuthConfig } from './config/auth.js';
import { createDatabasePool } from './config/database.js';

let pool;
try {
  const config = await loadAuthConfig();
  pool = createDatabasePool();
  await pool.query('SELECT 1 FROM user_sessions LIMIT 1');
  const app = createApp({ config, pool });
  const port = Number(process.env.PORT || 3000);
  const server = app.listen(port, () => console.log(`LAHVET: ${config.origin}`));
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => server.close(async () => { await pool.end(); process.exit(0); }));
  }
} catch {
  console.error('Inicialização recusada. Confira as configurações de autenticação, a conexão e as migrações do banco.');
  await pool?.end();
  process.exitCode = 1;
}
