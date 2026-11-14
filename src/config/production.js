import { loadAuthConfig } from './auth.js';

// Verifica configuração local sem abrir banco ou exibir valores.
// Não substitui a verificação da infraestrutura e a aprovação institucional.
export async function checkProductionEnvironment(env, nodeVersion = process.versions.node) {
  const checks = [];
  async function check(name, validate) {
    let ok = false;
    try { ok = Boolean(await validate()); } catch { /* Somente o nome do requisito sai no relatório. */ }
    checks.push({ name, ok });
  }
  await check('Node.js 22 ou superior', () => Number(nodeVersion.split('.')[0]) >= 22);
  await check('NODE_ENV=production', () => env.NODE_ENV === 'production');
  await check('Configuração de autenticação, sessão, origem HTTPS e fuso válidos', async () => {
    const config = await loadAuthConfig(env);
    return config.production && new URL(config.origin).protocol === 'https:';
  });
  await check('APP_ORIGIN sem localhost, IP ou domínio de exemplo', () => {
    const url = new URL(env.APP_ORIGIN);
    const host = url.hostname;
    return url.protocol === 'https:' && host.includes('.') && !host.endsWith('.')
      && !/^(?:localhost|127\.|0\.|\[)/i.test(host)
      && !/\.(?:test|invalid|localhost|example)$/i.test(host)
      && !/^(?:example\.(?:com|org|net))$/i.test(host)
      && !/^[\d.]+$/.test(host);
  });
  await check('DATABASE_URL PostgreSQL com host e nome de banco', () => {
    const url = new URL(env.DATABASE_URL);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname && url.pathname.length > 1;
  });
  await check('PORT inteiro entre 1 e 65535', () => {
    const value = env.PORT ?? '3000';
    return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 65535;
  });
  await check('Verificação global de certificados TLS habilitada', () => env.NODE_TLS_REJECT_UNAUTHORIZED !== '0');
  return checks;
}
