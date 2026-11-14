export const permissions = Object.freeze({
  admin: Object.freeze(['students:add', 'students:edit', 'students:dismiss', 'attendance:read_all', 'attendance:write', 'attendance:justify', 'meetings:register']),
  student: Object.freeze(['attendance:read_own']),
});

export function requireAuthentication(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Autenticação necessária.' });
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Autenticação necessária.' });
    const allowed = Object.hasOwn(permissions, req.user.role) ? permissions[req.user.role] : [];
    if (!allowed.includes(permission)) return res.status(403).json({ error: 'Acesso não permitido.' });
    next();
  };
}

// Rotas de frequência futuras devem obter o aluno da sessão ou validar o dono.
export function requireOwnStudent(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Autenticação necessária.' });
  if (req.user.role !== 'student' || String(req.params.studentId) !== req.user.id) {
    return res.status(403).json({ error: 'Acesso não permitido.' });
  }
  next();
}
