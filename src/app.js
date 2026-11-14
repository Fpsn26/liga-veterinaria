import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createAuthRepository } from './repositories/auth-repository.js';
import { createAuthService } from './services/auth-service.js';
import { createAuthRouter } from './routes/auth.js';
import { createPasswordChangeRepository } from './repositories/password-change-repository.js';
import { createPasswordChangeService } from './services/password-change-service.js';
import { createPasswordChangeRouter } from './routes/password-change.js';
import { createStudentRouter } from './routes/students.js';
import { createMeetingRouter } from './routes/meetings.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { requireAuthentication, requirePermission } from './middlewares/authorization.js';

export function createSessionStore(pool) {
  const Store = connectPgSimple(session);
  return new Store({ pool, tableName: 'user_sessions', createTableIfMissing: false,
    errorLog: () => console.error('Falha na manutenção das sessões.') });
}

export function createApp({ config, pool, store = createSessionStore(pool), loginLimit, changeLimit }) {
  const app = express();
  // HTML fica fora da pasta pública: CDNs não podem contornar os guards.
  const directory = fileURLToPath(new URL('../views/', import.meta.url));
  const assetsDirectory = fileURLToPath(new URL('../public/assets/', import.meta.url));
  const service = createAuthService(config, createAuthRepository(pool));
  const changeService = createPasswordChangeService(config, createAuthRepository(pool), createPasswordChangeRepository(pool));
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy ?? false);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
    if (req.path === '/' || req.path === '/index.html' || req.path.startsWith('/api/') || req.path.startsWith('/pages/')) res.set('Cache-Control', 'no-store');
    next();
  });
  const json = express.json({ limit: '10kb' });
  const attendanceJson = express.json({ limit: '1mb' });
  app.use((req, res, next) => {
    // A chamada inteira pode conter várias justificativas; demais rotas mantêm 10 KB.
    const bulk = req.method === 'PUT' && /^\/api\/admin\/meetings\/[1-9]\d{0,18}\/attendance\/?$/.test(req.path);
    return (bulk ? attendanceJson : json)(req, res, next);
  });
  app.use(session({ name: 'lahvet.sid', secret: config.secret, store, resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, secure: config.production, sameSite: 'strict', maxAge: 60 * 60 * 1000 } }));
  app.use(async (req, res, next) => {
    if (req.session.principal) {
      const expired = Date.now() - (req.session.authenticatedAt ?? 0) >= 60 * 60 * 1000;
      req.user = expired ? null : await service.resolve(req.session.principal);
      if (!req.user) {
        await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()));
        res.clearCookie('lahvet.sid', { path: '/', httpOnly: true, secure: config.production, sameSite: 'strict' });
      }
    }
    next();
  });
  app.use('/api/auth', createAuthRouter(service, config, { loginLimit }));
  app.use('/api/password-change', createPasswordChangeRouter(changeService, config, { changeLimit }));
  app.use('/api/admin', requirePermission('students:edit'));
  app.use('/api/admin/students', createStudentRouter(pool, config));
  app.use('/api/admin/meetings', createMeetingRouter(pool, config));
  app.use('/api/admin/attendance', createAttendanceRouter(pool, config, { admin: true }));
  app.use('/api/attendance', createAttendanceRouter(pool, config));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  // Só estas páginas são servidas. Nenhum diretório público pode contornar os guards.
  app.get('/favicon.ico', (req, res) => res.redirect(302, '/assets/images/favicon.png'));
  app.get(['/', '/index.html'], async (req, res) => {
    // Links vêm apenas da sessão conferida no servidor; não de parâmetros do cliente.
    const authenticated = ['admin', 'student'].includes(req.user?.role);
    let navigation = authenticated
      ? '<a href="/pages/painel.html">Painel de frequência</a>'
      : '<a href="/pages/login.html">Entrar</a>';
    if (req.user?.role === 'admin') navigation += '\n        <a href="/pages/cadastro.html">Cadastro</a>';
    const html = await readFile(new URL('../views/index.html', import.meta.url), 'utf8');
    res.type('html').send(html.replace('<!-- SESSION_NAV -->', navigation));
  });
  app.get('/pages/login.html', (req, res) => res.sendFile('pages/login.html', { root: directory }));
  app.get('/pages/recuperar-senha.html', (req, res) => res.redirect(302, '/pages/trocar-senha.html'));
  app.get('/pages/trocar-senha.html', (req, res) => res.sendFile('pages/trocar-senha.html', { root: directory }));
  app.get('/pages/painel.html', requireAuthentication, (req, res) => res.sendFile('pages/painel.html', { root: directory }));
  app.get('/pages/cadastro.html', requirePermission('students:add'), (req, res) => res.sendFile('pages/cadastro.html', { root: directory }));
  app.get('/pages/reunioes.html', requirePermission('meetings:register'), (req, res) => res.sendFile('pages/reunioes.html', { root: directory }));
  app.use('/assets', express.static(assetsDirectory, { dotfiles: 'deny', index: false }));
  app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.parse.failed' ? 400 : error.type === 'entity.too.large' ? 413 : 503;
    res.status(status).json({ error: status === 503 ? 'Serviço temporariamente indisponível.' : 'Corpo da requisição inválido.' });
  });
  return app;
}
