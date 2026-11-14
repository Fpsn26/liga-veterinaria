import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { csrfProtection } from './auth.js';
import { validateNewPassword } from '../services/password-change-service.js';

export function createPasswordChangeRouter(service, config, { changeLimit = 10 } = {}) {
  const router = Router();
  const limit = rateLimit({ windowMs: 15 * 60 * 1000, limit: changeLimit, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Muitas tentativas. Aguarde antes de tentar novamente.' } });
  router.post('/', limit, csrfProtection(config.origin), async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some(key => !['identifier', 'currentPassword', 'password', 'confirmation'].includes(key))) {
      return res.status(400).json({ error: 'Dados da requisição inválidos.' });
    }
    const { identifier, currentPassword, password, confirmation } = body;
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254
      || typeof currentPassword !== 'string' || !currentPassword.trim() || currentPassword.length > 1024) {
      return res.status(400).json({ error: 'Informe email ou matrícula e senha atual válidos.' });
    }
    if (!validateNewPassword(password, confirmation)) {
      return res.status(400).json({ error: 'As senhas devem coincidir e ter de 8 a 1024 caracteres, uma letra maiúscula e um número ou caractere especial.' });
    }
    if (!await service.change(identifier.trim(), currentPassword, password)) {
      return res.status(401).json({ error: 'Email, matrícula ou senha atual inválidos.' });
    }
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.json({ message: 'Senha alterada. Entre com sua nova senha.' });
  });
  return router;
}
