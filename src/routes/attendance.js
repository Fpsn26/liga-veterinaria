import { Router } from 'express';
import { requirePermission } from '../middlewares/authorization.js';
import { createAttendanceRepository } from '../repositories/attendance-repository.js';
import { createAttendanceService, AttendanceError } from '../services/attendance-service.js';

export function createAttendanceRouter(pool, config, { admin = false } = {}) {
  const router = Router();
  const service = createAttendanceService(createAttendanceRepository(pool, config.timeZone));
  if (admin) {
    router.use(requirePermission('attendance:read_all'));
    router.get('/', async (req, res) => res.json(await service.list(req.query)));
    router.get('/:studentId', async (req, res) => {
      if (Object.keys(req.query).length) throw new AttendanceError(400, 'Esta consulta não aceita filtros.');
      res.json(await service.detail(req.params.studentId));
    });
  } else {
    router.use(requirePermission('attendance:read_own'));
    router.get('/me', async (req, res) => {
      if (Object.keys(req.query).length) throw new AttendanceError(400, 'Esta consulta não aceita filtros ou identificadores.');
      // A identidade vem exclusivamente da sessão, nunca de parâmetros do cliente.
      res.json(await service.detail(req.user.id));
    });
  }
  router.use((error, req, res, next) => {
    if (error instanceof AttendanceError) return res.status(error.status).json({ error: error.message });
    next(error);
  });
  return router;
}
