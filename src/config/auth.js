import { createHmac } from 'node:crypto';
import argon2 from 'argon2';

export async function loadAuthConfig(env = process.env) {
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password, SESSION_SECRET: secret, APP_ORIGIN: origin } = env;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || !password.trim()) {
    throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD no ambiente.');
  }
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('SESSION_SECRET deve ter pelo menos 32 bytes.');
  const url = new URL(origin);
  const production = env.NODE_ENV === 'production';
  const timeZone = env.APP_TIMEZONE || 'America/Sao_Paulo';
  new Intl.DateTimeFormat('pt-BR', { timeZone });
  if (env.TRUST_PROXY && env.TRUST_PROXY !== 'loopback') throw new Error('TRUST_PROXY aceita somente loopback ou vazio.');
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password
    || (production && url.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN deve conter somente a origem; produção exige HTTPS.');
  }
  return {
    // A Vercel fornece o último proxy e sobrescreve X-Forwarded-For.
    // Fora da plataforma, permanece a configuração restrita anterior.
    email: email.toLowerCase(), secret, origin, production, timeZone,
    trustProxy: env.VERCEL === '1' ? 1 : env.TRUST_PROXY === 'loopback' ? 'loopback' : false,
    adminPasswordHash: await argon2.hash(password, { type: argon2.argon2id }),
    adminVersion: createHmac('sha256', secret).update(email.toLowerCase()).update('\0').update(password).digest('hex'),
  };
}
