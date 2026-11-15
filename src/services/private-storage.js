import { AttachmentError } from './attachment-service.js';

export function createPrivateStorage(env = process.env, request = fetch) {
  const bucket = env.SUPABASE_ATTACHMENTS_BUCKET || 'justificativas';
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  let origin;
  try {
    const url = new URL(env.SUPABASE_URL);
    if (url.protocol === 'https:' && url.origin === env.SUPABASE_URL && !url.username && !url.password) origin = url.origin;
  } catch { /* Missing optional configuration is reported only when used. */ }
  async function call(path, options = {}) {
    if (!origin || !key || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(bucket)) throw new AttachmentError(503, 'Armazenamento de anexos não configurado.');
    try {
      const response = await request(`${origin}/storage/v1/${path}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000),
        // New secret keys are not JWTs: send them only as apikey.
        headers: { apikey: key, ...(!key.startsWith('sb_secret_') ? { Authorization: `Bearer ${key}` } : {}), ...options.headers } });
      if (!response.ok) throw new Error('Storage rejected request');
      return response;
    } catch { throw new AttachmentError(503, 'Armazenamento de anexos temporariamente indisponível.'); }
  }
  async function privateBucket(name) {
    if (name !== bucket) throw new AttachmentError(503, 'Bucket de anexos divergente.');
    const info = await (await call(`bucket/${encodeURIComponent(name)}`)).json();
    if (info.public !== false) throw new AttachmentError(503, 'O bucket de anexos precisa ser privado.');
  }
  const object = (name, path) => `${encodeURIComponent(name)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  return {
    bucket,
    async upload(name, path, data, mime) {
      await privateBucket(name);
      await call(`object/${object(name, path)}`, { method: 'POST', body: data, headers: { 'Content-Type': mime, 'x-upsert': 'false' } });
    },
    async download(name, path) {
      await privateBucket(name);
      const response = await call(`object/${object(name, path)}`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 4194304) { await response.body.cancel?.().catch(() => {}); throw new AttachmentError(503, 'Anexo inválido.'); }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    },
    async remove(name, path) {
      await privateBucket(name);
      await call(`object/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [path] }) });
    },
  };
}
