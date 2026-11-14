import { Router } from 'express';
import { requirePermission } from '../middlewares/authorization.js';
import { csrfProtection } from './auth.js';
import { createMeetingService, MeetingError } from '../services/meeting-service.js';
import { createMeetingRepository } from '../repositories/meeting-repository.js';

export function createMeetingRouter(pool, config) {
  const router = Router();
  const service = createMeetingService(createMeetingRepository(pool, config.timeZone));
  const csrf = csrfProtection(config.origin);
  router.get('/', requirePermission('attendance:read_all'), async (req, res) => res.json(await service.list()));
  router.get('/:id', requirePermission('attendance:read_all'), async (req, res) => res.json(await service.get(req.params.id)));
  router.post('/', requirePermission('meetings:register'), csrf, async (req, res) => res.status(201).json(await service.add(req.body)));
  router.post('/:id/start', requirePermission('attendance:write'), csrf, async (req, res) => res.json(await service.start(req.params.id, req.body)));
  router.post('/:id/cancel', requirePermission('meetings:register'), csrf, async (req, res) => res.json(await service.cancel(req.params.id, req.body)));
  router.post('/:id/complete', requirePermission('attendance:write'), csrf, async (req, res) => res.json(await service.complete(req.params.id, req.body)));
  router.put('/:id/attendance', requirePermission('attendance:write'), csrf,
    async (req, res) => res.json(await service.saveAttendance(req.params.id, req.body)));
  router.put('/:id/attendance/:studentId', requirePermission('attendance:write'), csrf,
    async (req, res) => res.json(await service.attendance(req.params.id, req.params.studentId, req.body)));
  router.put('/:id/justification/:studentId', requirePermission('attendance:justify'), csrf,
    async (req, res) => res.json(await service.justify(req.params.id, req.params.studentId, req.body)));
  router.use((error, req, res, next) => {
    if (error instanceof MeetingError) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'Já existe reunião nesta data.' });
    next(error);
  });
  return router;
}
