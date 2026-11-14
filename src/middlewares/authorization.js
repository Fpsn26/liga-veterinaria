import { sendError } from '../http/errors.js';

export const permissions = Object.freeze({
  admin: Object.freeze(['students:add', 'students:edit', 'students:dismiss', 'attendance:read_all', 'attendance:write', 'attendance:justify', 'meetings:register']),
  student: Object.freeze(['attendance:read_own']),
});

export function requireAuthentication(req, res, next) {
  if (!req.user) return sendError(req, res, 401, 'Autenticação necessária.');
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return sendError(req, res, 401, 'Autenticação necessária.');
    const allowed = Object.hasOwn(permissions, req.user.role) ? permissions[req.user.role] : [];
    if (!allowed.includes(permission)) return sendError(req, res, 403, 'Acesso não permitido.');
    next();
  };
}

// Rotas de frequência futuras devem obter o aluno da sessão ou validar o dono.
export function requireOwnStudent(req, res, next) {
  if (!req.user) return sendError(req, res, 401, 'Autenticação necessária.');
  if (req.user.role !== 'student' || String(req.params.studentId) !== req.user.id) {
    return sendError(req, res, 403, 'Acesso não permitido.');
  }
  next();
}
