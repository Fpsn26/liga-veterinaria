import { Router, raw } from 'express';
import { requireAuthentication, requirePermission } from '../middlewares/authorization.js';
import { csrfProtection } from './auth.js';
import { AttachmentError } from '../services/attachment-service.js';

export function createAttachmentRouter(service, config) {
  const router = Router();
  router.use(requireAuthentication);
  const admin = requirePermission('attendance:justify');
  const csrf = csrfProtection(config.origin);
  router.post('/:meetingId/:studentId', admin, csrf, raw({ type: () => true, limit: '4mb' }), async (req, res) => {
    let name;
    try { name = decodeURIComponent(req.get('X-File-Name') || ''); }
    catch { throw new AttachmentError(400, 'Nome de arquivo inválido.'); }
    res.status(201).json(await service.upload(req.params.meetingId, req.params.studentId, req.body, name, req.get('Content-Type')));
  });
  router.delete('/:id', admin, csrf, async (req, res) => res.json(await service.remove(req.params.id)));
  router.get('/:id/download', async (req, res) => {
    const { file, data } = await service.download(req.params.id, req.user);
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': file.mime_type,
      'Content-Disposition': `attachment; filename="anexo"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`,
      'Content-Security-Policy': "sandbox; default-src 'none'" });
    res.send(data);
  });
  router.use((error, req, res, next) => {
    if (error instanceof AttachmentError) return res.status(error.status).json({ error: error.message });
    next(error);
  });
  return router;
}
