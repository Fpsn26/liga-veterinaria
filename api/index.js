import { createApp } from '../src/app.js';
import { loadAuthConfig } from '../src/config/auth.js';
import { createDatabasePool } from '../src/config/database.js';
import { sendError } from '../src/http/errors.js';

// Uma inicialização por instância quente; falhas podem ser tentadas novamente.
export function createVercelHandler(initialize) {
  let ready;
  return async (req, res) => {
    try {
      ready ??= Promise.resolve().then(initialize);
      const app = await ready;
      return app(req, res);
    } catch {
      ready = undefined;
      if (res.headersSent) { res.destroy(); return; }
      return sendError(req, res, 503, 'Serviço temporariamente indisponível.');
    }
  };
}

export default createVercelHandler(async () => {
  const config = await loadAuthConfig();
  const pool = createDatabasePool();
  try {
    await pool.query('SELECT 1 FROM user_sessions LIMIT 1');
    return createApp({ config, pool });
  } catch (error) {
    await pool.end();
    throw error;
  }
});
