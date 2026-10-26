import { requireAuth } from '../lib/session.js';
import { checkProject, projectBody } from '../lib/validate.js';

const MS = 'floor(extract(epoch FROM updated_at) * 1000)::float8';
const SNAPSHOT_EVERY = '10 minutes', KEEP_VERSIONS = 50;
const full = r => ({ id: r.id, name: r.name, P: r.data, version: r.version, updated: r.updated });

/** Снимок текущего состояния в историю: не чаще раза в 10 минут (force — всегда), хранится 50 последних. */
async function snapshot(tx, userId, p, force = false) {
  if (!force) {
    const [last] = await tx`SELECT created_at > now() - ${SNAPSHOT_EVERY}::interval AS fresh FROM project_versions
      WHERE user_id = ${userId} AND project_id = ${p.id} ORDER BY id DESC LIMIT 1`;
    if (last?.fresh) return;
  }
  await tx`INSERT INTO project_versions (user_id, project_id, version, name, data) VALUES (${userId}, ${p.id}, ${p.version}, ${p.name}, ${tx.json(p.data)})`;
  await tx`DELETE FROM project_versions WHERE user_id = ${userId} AND project_id = ${p.id}
    AND id NOT IN (SELECT id FROM project_versions WHERE user_id = ${userId} AND project_id = ${p.id} ORDER BY id DESC LIMIT ${KEEP_VERSIONS})`;
}

export default async function projects(app) {
  const auth = { preHandler: requireAuth };
  const idOk = id => /^[\w-]{1,64}$/.test(id);

  app.get('/projects', auth, async req => {
    const since = Math.max(0, Number(req.query.since) || 0);
    const rows = await app.sql`SELECT id, name, type, version, ${app.sql.unsafe(MS)} AS updated, deleted_at IS NOT NULL AS deleted,
        share_token IS NOT NULL AS shared
      FROM projects WHERE user_id = ${req.user.id} AND ${app.sql.unsafe(MS)} > ${since} ORDER BY updated_at`;
    return { projects: rows };
  });

  app.get('/projects/:id', auth, async (req, reply) => {
    const [p] = await app.sql`SELECT id, name, data, version, ${app.sql.unsafe(MS)} AS updated FROM projects
      WHERE user_id = ${req.user.id} AND id = ${req.params.id} AND deleted_at IS NULL`;
    return p ? full(p) : reply.code(404).send({ error: 'not_found' });
  });

  app.put('/projects/:id', auth, async (req, reply) => {
    if (!idOk(req.params.id)) return reply.code(400).send({ error: 'invalid', message: 'Некорректный id' });
    const body = projectBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', message: 'Некорректные данные проекта' });
    const { name, P, baseVersion } = body.data, bad = checkProject(P);
    if (bad) return reply.code(422).send({ error: 'invalid_project', message: bad });
    const userId = req.user.id, id = req.params.id;

    const res = await app.sql.begin(async tx => {
      const [cur] = await tx`SELECT id, name, data, version, deleted_at IS NOT NULL AS deleted, ${tx.unsafe(MS)} AS updated
        FROM projects WHERE user_id = ${userId} AND id = ${id} FOR UPDATE`;
      if (!cur) {
        if (baseVersion !== 0) return { conflict: { deleted: true } };
        const [r] = await tx`INSERT INTO projects (user_id, id, name, type, data) VALUES (${userId}, ${id}, ${name}, ${P.type || ''}, ${tx.json(P)})
          ON CONFLICT DO NOTHING RETURNING version, ${tx.unsafe(MS)} AS updated`;
        return r ? { ok: r } : { conflict: { stale: true } }; // гонка: параллельный PUT уже создал проект
      }
      if (cur.deleted) return { conflict: { deleted: true } };
      if (cur.version !== baseVersion) return { conflict: { server: full(cur) } };
      await snapshot(tx, userId, cur);
      const [r] = await tx`UPDATE projects SET name = ${name}, type = ${P.type || ''}, data = ${tx.json(P)}, version = version + 1, updated_at = now()
        WHERE user_id = ${userId} AND id = ${id} RETURNING version, ${tx.unsafe(MS)} AS updated`;
      return { ok: r };
    });
    if (res.conflict) return reply.code(409).send({ error: 'conflict', ...res.conflict });
    return res.ok;
  });

  app.delete('/projects/:id', auth, async (req, reply) => {
    const userId = req.user.id, id = req.params.id;
    const [r] = await app.sql.begin(async tx => {
      await tx`DELETE FROM project_thumbs WHERE user_id = ${userId} AND project_id = ${id}`;
      await tx`DELETE FROM project_versions WHERE user_id = ${userId} AND project_id = ${id}`;
      // строка остаётся надгробием, чтобы другие устройства узнали об удалении; содержимое стирается
      return tx`UPDATE projects SET deleted_at = COALESCE(deleted_at, now()), data = '{}'::jsonb, share_token = NULL, version = version + 1, updated_at = now()
        WHERE user_id = ${userId} AND id = ${id} RETURNING version, ${tx.unsafe(MS)} AS updated`;
    });
    return r ? r : reply.code(404).send({ error: 'not_found' });
  });

  // ── миниатюры
  app.addContentTypeParser('image/jpeg', { parseAs: 'buffer', bodyLimit: 200 * 1024 }, (req, body, done) => done(null, body));

  app.put('/projects/:id/thumb', { ...auth, bodyLimit: 200 * 1024 }, async (req, reply) => {
    const b = req.body;
    if (!Buffer.isBuffer(b) || b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return reply.code(400).send({ error: 'invalid', message: 'Нужен JPEG' });
    const [p] = await app.sql`SELECT 1 FROM projects WHERE user_id = ${req.user.id} AND id = ${req.params.id} AND deleted_at IS NULL`;
    if (!p) return reply.code(404).send({ error: 'not_found' });
    await app.sql`INSERT INTO project_thumbs (user_id, project_id, jpeg) VALUES (${req.user.id}, ${req.params.id}, ${b})
      ON CONFLICT (user_id, project_id) DO UPDATE SET jpeg = EXCLUDED.jpeg, updated_at = now()`;
    return { ok: true };
  });

  app.get('/projects/:id/thumb', auth, async (req, reply) => {
    const [t] = await app.sql`SELECT jpeg FROM project_thumbs WHERE user_id = ${req.user.id} AND project_id = ${req.params.id}`;
    if (!t) return reply.code(404).send({ error: 'not_found' });
    return reply.header('cache-control', 'private, no-cache').type('image/jpeg').send(t.jpeg);
  });

  // ── история версий
  app.get('/projects/:id/versions', auth, async req => ({
    versions: await app.sql`SELECT id, version, name, floor(extract(epoch FROM created_at) * 1000)::float8 AS created FROM project_versions
      WHERE user_id = ${req.user.id} AND project_id = ${req.params.id} ORDER BY id DESC`,
  }));

  app.get('/projects/:id/versions/:vid', auth, async (req, reply) => {
    const [v] = await app.sql`SELECT id, version, name, data AS "P" FROM project_versions
      WHERE user_id = ${req.user.id} AND project_id = ${req.params.id} AND id = ${Number(req.params.vid) || 0}`;
    return v || reply.code(404).send({ error: 'not_found' });
  });

  app.post('/projects/:id/versions/:vid/restore', auth, async (req, reply) => {
    const userId = req.user.id, id = req.params.id;
    const res = await app.sql.begin(async tx => {
      const [cur] = await tx`SELECT id, name, data, version FROM projects WHERE user_id = ${userId} AND id = ${id} AND deleted_at IS NULL FOR UPDATE`;
      const [v] = await tx`SELECT name, data FROM project_versions WHERE user_id = ${userId} AND project_id = ${id} AND id = ${Number(req.params.vid) || 0}`;
      if (!cur || !v) return null;
      await snapshot(tx, userId, cur, true); // перед откатом сохраняем текущее: откат тоже можно отменить
      await tx`UPDATE projects SET name = ${v.name}, data = ${tx.json(v.data)}, version = version + 1, updated_at = now() WHERE user_id = ${userId} AND id = ${id}`;
      const [r] = await tx`SELECT id, name, data, version, ${tx.unsafe(MS)} AS updated FROM projects WHERE user_id = ${userId} AND id = ${id}`;
      return r;
    });
    return res ? full(res) : reply.code(404).send({ error: 'not_found' });
  });
}
