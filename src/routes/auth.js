import { Router } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { requireAuthentication } from '../middlewares/authorization.js';

const token = () => randomBytes(32).toString('hex');
const save = (session) => new Promise((resolve, reject) => session.save((error) => error ? reject(error) : resolve()));
const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));

export function csrfProtection(origin) {
  return (req, res, next) => {
    const supplied = req.get('x-csrf-token');
    const expected = req.session?.csrf;
    if ((req.get('origin') && req.get('origin') !== origin) || !/^[a-f0-9]{64}$/.test(supplied ?? '') || !expected
      || supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).json({ error: 'Requisição não autorizada. Atualize a página.' });
    }
    next();
  };
}

export function createAuthRouter(service, config, { loginLimit = 10 } = {}) {
  const router = Router();
  const limited = rateLimit({ windowMs: 15 * 60 * 1000, limit: loginLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' } });
  const csrfLimited = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false });
  router.get('/csrf', csrfLimited, async (req, res) => {
    req.session.csrf ??= token();
    await save(req.session);
    res.json({ csrfToken: req.session.csrf });
  });
  router.post('/login', limited, csrfProtection(config.origin), async (req, res) => {
    const { identifier, password } = req.body ?? {};
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254
      || typeof password !== 'string' || !password.trim() || password.length > 1024) {
      return res.status(400).json({ error: 'Informe email ou matrícula e senha válidos.' });
    }
    const result = await service.login(identifier.trim(), password);
    if (!result) return res.status(401).json({ error: 'Email, matrícula ou senha inválidos.' });
    await regenerate(req);
    req.session.principal = result.principal;
    req.session.csrf = token();
    req.session.authenticatedAt = Date.now();
    await save(req.session);
    res.json({ user: result.user, csrfToken: req.session.csrf });
  });
  router.get('/me', requireAuthentication, (req, res) => res.json({ user: req.user }));
  router.post('/logout', csrfProtection(config.origin), requireAuthentication, async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()));
    res.clearCookie('lahvet.sid', { path: '/', httpOnly: true, sameSite: 'strict', secure: config.production });
    res.sendStatus(204);
  });
  return router;
}
