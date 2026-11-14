import argon2 from 'argon2';
import { createHmac } from 'node:crypto';

export function createAuthService(config, repository) {
  const version = (hash) => createHmac('sha256', config.secret).update(hash).digest('hex');
  const studentUser = (student) => ({ role: 'student', id: String(student.id), name: student.name, registrationNumber: student.registration_number });
  async function verify(hash, password) {
    try { return await argon2.verify(hash, password); } catch { return false; }
  }
  return {
    async login(identifier, password) {
      if (identifier.toLowerCase() === config.email) {
        if (!await verify(config.adminPasswordHash, password)) return null;
        return { principal: { role: 'admin', version: config.adminVersion }, user: { role: 'admin', name: 'Administrador' } };
      }
      const student = await repository.findByLogin(identifier);
      // A conta inexistente também realiza uma verificação Argon2.
      const valid = await verify(student?.password_hash ?? config.adminPasswordHash, password);
      if (!student || !valid) return null;
      // Desligados mantêm histórico, mas não podem autenticar.
      if (student.status !== 'active') return null;
      return { principal: { role: 'student', id: String(student.id), version: version(student.password_hash) }, user: studentUser(student) };
    },
    async resolve(principal) {
      if (!principal) return null;
      if (principal.role === 'admin') {
        return principal.version === config.adminVersion ? { role: 'admin', name: 'Administrador' } : null;
      }
      if (principal.role !== 'student' || !/^\d+$/.test(principal.id ?? '')) return null;
      const student = await repository.findById(principal.id);
      if (!student || student.status !== 'active' || version(student.password_hash) !== principal.version) return null;
      return studentUser(student);
    },
  };
}
