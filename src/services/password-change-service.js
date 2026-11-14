import argon2 from 'argon2';

export function validateNewPassword(password, confirmation) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 1024
    && /\p{Lu}/u.test(password) && /[\p{N}]|[^\p{L}\p{N}\s]/u.test(password) && password === confirmation;
}

export function createPasswordChangeService(config, authRepository, repository) {
  return {
    async change(identifier, currentPassword, password) {
      // O Admin continua sendo configurado somente pelo ambiente.
      const student = identifier.toLowerCase() === config.email ? null : await authRepository.findByLogin(identifier);
      let verified = false;
      try { verified = await argon2.verify(student?.password_hash ?? config.adminPasswordHash, currentPassword); }
      catch { /* Hash inválido também resulta em credenciais recusadas. */ }
      if (!student || student.status !== 'active' || !verified) return false;
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      return repository.change(student.id, student.password_hash, hash);
    },
  };
}
