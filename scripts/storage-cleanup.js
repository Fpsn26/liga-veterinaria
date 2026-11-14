import { createDatabasePool } from '../src/config/database.js';
import { createPrivateStorage } from '../src/services/private-storage.js';
import { createAttachmentService } from '../src/services/attachment-service.js';

const pool = createDatabasePool();
try {
  const service = createAttachmentService(pool, createPrivateStorage());
  let remaining;
  do {
    const before = Number((await pool.query('SELECT count(*) FROM lahvet_private.attachment_deletions')).rows[0].count);
    await service.cleanup();
    remaining = Number((await pool.query('SELECT count(*) FROM lahvet_private.attachment_deletions')).rows[0].count);
    if (remaining && remaining >= before) { process.exitCode = 1; break; }
  } while (remaining);
  console.log(`Remoções pendentes: ${remaining}.`);
} catch { console.error('Falha ao processar remoções de anexos.'); process.exitCode = 1; }
finally { await pool.end(); }
