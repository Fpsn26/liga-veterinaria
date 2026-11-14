import { Router } from 'express';
import { requirePermission } from '../middlewares/authorization.js';
import { csrfProtection } from './auth.js';
import { createStudentService, StudentError } from '../services/student-service.js';
import { createStudentRepository } from '../repositories/student-repository.js';

export function createStudentRouter(pool, config) {
  const router = Router();
  const service = createStudentService(createStudentRepository(pool), config);
  const csrf = csrfProtection(config.origin);
  router.get('/', requirePermission('students:edit'), async (req, res) => res.json({ students: await service.list() }));
  router.post('/', requirePermission('students:add'), csrf, async (req, res) => res.status(201).json(await service.add(req.body)));
  router.put('/:id', requirePermission('students:edit'), csrf, async (req, res) => res.json(await service.edit(req.params.id, req.body)));
  router.post('/:id/dismiss', requirePermission('students:dismiss'), csrf, async (req, res) => res.json(await service.dismiss(req.params.id, req.body)));
  router.use((error, req, res, next) => {
    if (error instanceof StudentError) return res.status(error.status).json({ error: error.message });
    if (error.code === '23505') return res.status(409).json({ error: 'Matrícula ou email já cadastrado.' });
    next(error);
  });
  return router;
}
