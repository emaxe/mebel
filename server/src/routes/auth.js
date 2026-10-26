import { z } from 'zod';
import { hash, verify } from '@node-rs/argon2';
import { COOKIE, hashToken, newToken, requireAuth, startSession } from '../lib/session.js';
import { resetMail, verifyMail } from '../lib/mail.js';

const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(8, 'Пароль не короче 8 символов').max(200);
const publicUser = u => ({ id: u.id, email: u.email, verified: u.verified });

export default async function auth(app) {
  const strict = { config: { rateLimit: { max: app.rate.auth, timeWindow: '1 minute' } } };

  async function sendToken(userId, kind, hours, mail) {
    const token = newToken();
    await app.sql`INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (${hashToken(token)}, ${userId}, ${kind}, now() + make_interval(hours => ${hours}))`;
    await app.mailer.send({ to: (await app.sql`SELECT email FROM users WHERE id = ${userId}`)[0].email, ...mail(app.cfg, token) });
  }

  app.post('/auth/register', strict, async (req, reply) => {
    const body = z.object({ email, password }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', message: body.error.issues[0].message });
    const passwordHash = await hash(body.data.password);
    const [user] = await app.sql`INSERT INTO users (email, password_hash) VALUES (${body.data.email}, ${passwordHash})
      ON CONFLICT (email) DO NOTHING RETURNING id, email`;
    if (!user) return reply.code(409).send({ error: 'email_taken', message: 'Этот адрес уже зарегистрирован' });
    await startSession(app, req, reply, user.id);
    sendToken(user.id, 'verify', 72, verifyMail).catch(e => req.log.error(e, 'verify mail'));
    return reply.code(201).send({ user: { id: user.id, email: user.email, verified: false } });
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const body = z.object({ email, password: z.string().max(200) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', message: 'Введите почту и пароль' });
    const [u] = await app.sql`SELECT id, email, password_hash, email_verified_at IS NOT NULL AS verified FROM users WHERE email = ${body.data.email}`;
    // хеш считаем и для несуществующего адреса — время ответа не выдаёт, зарегистрирован ли он
    const ok = await verify(u ? u.password_hash : app.dummyHash, body.data.password).catch(() => false);
    if (!u || !ok) return reply.code(401).send({ error: 'bad_credentials', message: 'Неверная почта или пароль' });
    await startSession(app, req, reply, u.id);
    return { user: publicUser(u) };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await app.sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: requireAuth }, async req => ({ user: req.user }));

  app.post('/auth/resend-verify', { preHandler: requireAuth, ...strict }, async (req, reply) => {
    if (req.user.verified) return { ok: true };
    await sendToken(req.user.id, 'verify', 72, verifyMail);
    return { ok: true };
  });

  app.post('/auth/verify', strict, async (req, reply) => {
    const body = z.object({ token: z.string().min(10).max(100) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    const [t] = await app.sql`UPDATE email_tokens SET used_at = now()
      WHERE token_hash = ${hashToken(body.data.token)} AND kind = 'verify' AND used_at IS NULL AND expires_at > now() RETURNING user_id`;
    if (!t) return reply.code(400).send({ error: 'bad_token', message: 'Ссылка недействительна или устарела' });
    await app.sql`UPDATE users SET email_verified_at = now() WHERE id = ${t.user_id} AND email_verified_at IS NULL`;
    return { ok: true };
  });

  // всегда 200: ответ не говорит, есть ли такой адрес; сброс только для подтверждённой почты
  app.post('/auth/forgot', strict, async (req, reply) => {
    const body = z.object({ email }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', message: 'Введите адрес почты' });
    const [u] = await app.sql`SELECT id FROM users WHERE email = ${body.data.email} AND email_verified_at IS NOT NULL`;
    if (u) sendToken(u.id, 'reset', 1, resetMail).catch(e => req.log.error(e, 'reset mail'));
    return { ok: true };
  });

  app.post('/auth/reset', strict, async (req, reply) => {
    const body = z.object({ token: z.string().min(10).max(100), password }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', message: body.error.issues[0].message });
    const passwordHash = await hash(body.data.password);
    const [t] = await app.sql`UPDATE email_tokens SET used_at = now()
      WHERE token_hash = ${hashToken(body.data.token)} AND kind = 'reset' AND used_at IS NULL AND expires_at > now() RETURNING user_id`;
    if (!t) return reply.code(400).send({ error: 'bad_token', message: 'Ссылка недействительна или устарела' });
    await app.sql.begin(async tx => {
      await tx`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${t.user_id}`;
      await tx`DELETE FROM sessions WHERE user_id = ${t.user_id}`; // все прежние входы теряют силу
    });
    return { ok: true };
  });
}
