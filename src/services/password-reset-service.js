import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

export const resetMessage = 'Se os dados corresponderem a um aluno ativo, enviaremos um link ao email institucional cadastrado. Verifique também o spam e aguarde antes de solicitar novamente.';
export function validateNewPassword(password, confirmation) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 1024
    && /\p{Lu}/u.test(password) && /[\p{N}]|[^\p{L}\p{N}\s]/u.test(password) && password === confirmation;
}
export function createPasswordResetService(config, repository, mailer) {
  const signature = (hash, student) => createHmac('sha256', config.secret)
    .update(JSON.stringify([hash, student.institutional_email, student.password_hash])).digest('hex');
  const matches = (grant, row) => !!row && !!grant && /^[a-f0-9]{64}$/.test(grant.signature ?? '')
    && timingSafeEqual(Buffer.from(signature(grant.hash, row)), Buffer.from(grant.signature));
  return {
    async request(identifier) {
      if (!mailer) return false;
      if (identifier.toLowerCase() === config.email) return true;
      const nonce = randomBytes(32).toString('hex');
      const hash = createHash('sha256').update(nonce).digest('hex');
      const student = await repository.issue(identifier, hash);
      if (student) {
        const url = new URL('/pages/trocar-senha.html', config.origin);
        url.searchParams.set('token', nonce + signature(hash, student));
        try { await mailer({ to: student.institutional_email, url: url.href }); }
        catch {
          await repository.invalidate(hash);
          // Mesmo resultado público para conta existente, inexistente e falha do provedor.
          console.error('Falha no envio do email de recuperação.');
        }
      }
      return true;
    },
    async grant(raw) {
      if (typeof raw !== 'string' || !/^[a-f0-9]{128}$/.test(raw)) return null;
      const grant = { hash: createHash('sha256').update(raw.slice(0, 64)).digest('hex'), signature: raw.slice(64) };
      return matches(grant, await repository.find(grant.hash)) ? grant : null;
    },
    async valid(grant) { return !!grant && matches(grant, await repository.find(grant.hash)); },
    async reset(grant, password) {
      if (!await this.valid(grant)) return false;
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      return repository.consume(grant.hash, hash, row => matches(grant, row));
    },
  };
}
