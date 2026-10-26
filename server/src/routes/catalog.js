import { requireAuth } from '../lib/session.js';
import { MAX_CATALOG_BYTES, catalogBody } from '../lib/validate.js';

export default async function catalog(app) {
  const auth = { preHandler: requireAuth };

  app.get('/catalog', auth, async req => {
    const [c] = await app.sql`SELECT data, version FROM catalogs WHERE user_id = ${req.user.id}`;
    return c || { data: null, version: 0 };
  });

  app.put('/catalog', auth, async (req, reply) => {
    const body = catalogBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', message: 'Некорректный справочник' });
    const { data, baseVersion } = body.data;
    if (JSON.stringify(data).length > MAX_CATALOG_BYTES) return reply.code(422).send({ error: 'invalid', message: 'Справочник слишком большой' });
    const userId = req.user.id;
    const res = await app.sql.begin(async tx => {
      const [cur] = await tx`SELECT data, version FROM catalogs WHERE user_id = ${userId} FOR UPDATE`;
      if (!cur) {
        if (baseVersion !== 0) return { conflict: { server: { data: null, version: 0 } } };
        const [r] = await tx`INSERT INTO catalogs (user_id, data) VALUES (${userId}, ${tx.json(data)}) ON CONFLICT DO NOTHING RETURNING version`;
        return r ? { ok: r } : { conflict: { stale: true } };
      }
      if (cur.version !== baseVersion) return { conflict: { server: cur } };
      const [r] = await tx`UPDATE catalogs SET data = ${tx.json(data)}, version = version + 1, updated_at = now() WHERE user_id = ${userId} RETURNING version`;
      return { ok: r };
    });
    return res.conflict ? reply.code(409).send({ error: 'conflict', ...res.conflict }) : res.ok;
  });
}
