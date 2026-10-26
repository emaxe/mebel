import { randomBytes } from 'node:crypto';
import { requireAuth } from '../lib/session.js';

export default async function share(app) {
  const auth = { preHandler: requireAuth };

  app.post('/projects/:id/share', auth, async (req, reply) => {
    if (!req.user.verified) return reply.code(403).send({ error: 'email_not_verified', message: 'Подтвердите почту, чтобы делиться проектами' });
    // токен создаётся один раз; повторный вызов возвращает тот же
    const [p] = await app.sql`UPDATE projects SET share_token = COALESCE(share_token, ${randomBytes(18).toString('base64url')})
      WHERE user_id = ${req.user.id} AND id = ${req.params.id} AND deleted_at IS NULL RETURNING share_token`;
    return p ? { token: p.share_token } : reply.code(404).send({ error: 'not_found' });
  });

  app.delete('/projects/:id/share', auth, async (req, reply) => {
    const r = await app.sql`UPDATE projects SET share_token = NULL WHERE user_id = ${req.user.id} AND id = ${req.params.id} RETURNING 1`;
    return r.length ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  // публичный просмотр: без входа, только чтение; справочник владельца нужен для КП с ценами
  app.get('/share/:token', async (req, reply) => {
    const [p] = await app.sql`SELECT p.name, p.data AS "P", (SELECT data FROM catalogs c WHERE c.user_id = p.user_id) AS catalog
      FROM projects p WHERE p.share_token = ${req.params.token} AND p.deleted_at IS NULL`;
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return reply.header('cache-control', 'no-store').send(p);
  });
}
