import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { hash } from '@node-rs/argon2';
import auth from './routes/auth.js';
import projects from './routes/projects.js';
import catalog from './routes/catalog.js';
import share from './routes/share.js';

/** Собирает приложение. Зависимости передаются снаружи, чтобы тесты подставляли свою БД и почтовик. */
export async function buildApp({ sql, cfg, mailer, rate = { global: 300, auth: 10 }, logger = false }) {
  const app = Fastify({ logger, trustProxy: true, bodyLimit: 1024 * 1024 });
  app.decorate('sql', sql);
  app.decorate('cfg', cfg);
  app.decorate('mailer', mailer);
  app.decorate('rate', rate);
  app.decorate('dummyHash', await hash('dummy-password-for-timing'));

  await app.register(cookie);
  await app.register(rateLimit, { global: true, max: rate.global, timeWindow: '1 minute' });

  // CSRF: изменяющие запросы принимаются только со своего origin (cookie — SameSite=Lax, это второй рубеж)
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    if (req.headers.origin !== cfg.appUrl) return reply.code(403).send({ error: 'bad_origin' });
  });

  app.setErrorHandler((err, req, reply) => {
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.code || 'bad_request', message: err.message });
    req.log.error(err);
    reply.code(500).send({ error: 'internal' });
  });

  app.get('/api/health', async () => (await sql`SELECT 1`, { ok: true }));
  await app.register(async api => { await api.register(auth); await api.register(projects); await api.register(catalog); await api.register(share); }, { prefix: '/api' });
  return app;
}
