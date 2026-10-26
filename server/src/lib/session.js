import { createHash, randomBytes } from 'node:crypto';

export const COOKIE = 'sid';
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = t => createHash('sha256').update(t).digest('hex');

/** Создаёт сессию и ставит httpOnly-cookie. */
export async function startSession(app, req, reply, userId) {
  const token = newToken(), days = app.cfg.sessionDays;
  await app.sql`INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
    VALUES (${hashToken(token)}, ${userId}, now() + make_interval(days => ${days}), ${String(req.headers['user-agent'] || '').slice(0, 200)})`;
  reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: app.cfg.secureCookie, path: '/', maxAge: days * 86400 });
}

/** preHandler: кладёт req.user или отвечает 401. Скользящее продление — когда осталось меньше 25 из 30 дней. */
export async function requireAuth(req, reply) {
  const token = req.cookies[COOKIE];
  if (!token) return reply.code(401).send({ error: 'unauthorized' });
  const [row] = await req.server.sql`SELECT u.id, u.email, u.email_verified_at IS NOT NULL AS verified, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  if (!row) { reply.clearCookie(COOKIE, { path: '/' }); return reply.code(401).send({ error: 'unauthorized' }); }
  req.user = { id: row.id, email: row.email, verified: row.verified };
  req.sessionHash = hashToken(token);
  const days = req.server.cfg.sessionDays;
  if (row.expires_at.getTime() < Date.now() + (days - 5) * 864e5) {
    await req.server.sql`UPDATE sessions SET expires_at = now() + make_interval(days => ${days}) WHERE token_hash = ${req.sessionHash}`;
    reply.setCookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.server.cfg.secureCookie, path: '/', maxAge: days * 86400 });
  }
}
