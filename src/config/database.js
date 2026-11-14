import pg from 'pg';

// Importar este módulo não abre conexões nem lê credenciais no navegador.
export function createDatabasePool(connectionString = process.env.DATABASE_URL, { serverless = process.env.VERCEL === '1' } = {}) {
  if (!connectionString) {
    throw new Error('Configure DATABASE_URL no ambiente do servidor.');
  }

  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL deve usar PostgreSQL.');
  }

  const pool = new pg.Pool({
    connectionString,
    max: serverless ? 1 : 10,
    allowExitOnIdle: serverless,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  });

  // Evita que erros de conexões ociosas exponham a URL ou dados de consultas.
  pool.on('error', () => {
    console.error('Uma conexão ociosa com o banco foi encerrada.');
  });

  return pool;
}
