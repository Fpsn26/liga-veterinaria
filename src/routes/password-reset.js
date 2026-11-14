import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { csrfProtection } from './auth.js';
import { resetMessage, validateNewPassword } from '../services/password-reset-service.js';

const save = session => new Promise((resolve, reject) => session.save(error => error ? reject(error) : resolve()));
const invalid = res => res.status(403).json({ error: 'Link inválido, expirado ou já utilizado. Solicite outro link pela tela de login.' });
export function createPasswordResetRouter(service, config, { resetLimit = 10 } = {}) {
  const router = Router();
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: resetLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' } });
  router.post('/request', limit, csrfProtection(config.origin), async (req, res) => {
    const identifier = req.body?.identifier;
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254) {
      return res.status(400).json({ error: 'Informe email institucional ou matrícula válidos.' });
    }
    if (!await service.request(identifier.trim())) return res.status(503).json({ error: 'Recuperação de senha temporariamente indisponível.' });
    res.status(202).json({ message: resetMessage });
  });
  router.post('/confirm', limit, csrfProtection(config.origin), async (req, res) => {
    if (!await service.valid(req.session.passwordReset)) return invalid(res);
    const { password, confirmation } = req.body ?? {};
    if (!validateNewPassword(password, confirmation)) return res.status(400).json({ error: 'As senhas devem coincidir e ter de 8 a 1024 caracteres, uma letra maiúscula e um número ou caractere especial.' });
    if (!await service.reset(req.session.passwordReset, password)) return invalid(res);
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    await save(req.session);
    res.json({ message: 'Senha alterada. Entre com sua nova senha.' });
  });
  return router;
}
export function passwordResetPage(service, directory) {
  const limited = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' } });
  const page = async (req, res) => {
    if ('token' in req.query) {
      const grant = await service.grant(req.query.token);
      if (!grant) return invalid(res);
      await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.passwordReset = grant;
      await save(req.session);
      return res.redirect(303, '/pages/trocar-senha.html');
    }
    if (!await service.valid(req.session.passwordReset)) return invalid(res);
    res.sendFile('pages/trocar-senha.html', { root: directory });
  };
  return [limited, page];
}
