import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setup } from './helpers.js';

let t;
beforeEach(async () => { t?.close && await t.close(); t = await setup(); });
afterAll(async () => { await t?.close(); });

describe('авторизация', () => {
  it('регистрация → me → выход', async () => {
    const r = await t.call('POST', '/api/auth/register', { body: { email: 'Mix@Example.com', password: 'password123' } });
    expect(r.status).toBe(201);
    expect(r.json.user.email).toBe('mix@example.com');
    const sid = r.res.cookies.find(c => c.name === 'sid');
    expect(sid.httpOnly).toBe(true);
    expect(sid.sameSite).toBe('Lax');
    const cookie = `sid=${sid.value}`;
    expect((await t.call('GET', '/api/auth/me', { cookie })).json.user.email).toBe('mix@example.com');
    await t.call('POST', '/api/auth/logout', { cookie });
    expect((await t.call('GET', '/api/auth/me', { cookie })).status).toBe(401);
  });

  it('пароль в базе — хеш, токен сессии — тоже', async () => {
    const cookie = await t.signup();
    const [u] = await t.sql`SELECT password_hash FROM users`;
    expect(u.password_hash).toMatch(/^\$argon2id\$/);
    const [s] = await t.sql`SELECT token_hash FROM sessions`;
    expect(cookie).not.toContain(s.token_hash);
  });

  it('дубликат почты и короткий пароль отклоняются', async () => {
    await t.signup();
    expect((await t.call('POST', '/api/auth/register', { body: { email: 'a@example.com', password: 'password123' } })).status).toBe(409);
    expect((await t.call('POST', '/api/auth/register', { body: { email: 'b@example.com', password: 'short' } })).status).toBe(400);
    expect((await t.call('POST', '/api/auth/register', { body: { email: 'нет', password: 'password123' } })).status).toBe(400);
  });

  it('вход: верный и неверный пароль', async () => {
    await t.signup();
    const bad = await t.call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'wrongwrong' } });
    expect(bad.status).toBe(401);
    expect((await t.call('POST', '/api/auth/login', { body: { email: 'nobody@example.com', password: 'wrongwrong' } })).status).toBe(401);
    const ok = await t.call('POST', '/api/auth/login', { body: { email: 'A@example.com', password: 'password123' } });
    expect(ok.status).toBe(200);
    expect(ok.res.cookies.some(c => c.name === 'sid')).toBe(true);
  });

  it('подтверждение почты по токену из письма, повторно токен не работает', async () => {
    const cookie = await t.signup();
    await new Promise(r => setTimeout(r, 50));
    expect(t.mails).toHaveLength(1);
    const token = t.lastToken();
    expect((await t.call('GET', '/api/auth/me', { cookie })).json.user.verified).toBe(false);
    expect((await t.call('POST', '/api/auth/verify', { body: { token } })).status).toBe(200);
    expect((await t.call('GET', '/api/auth/me', { cookie })).json.user.verified).toBe(true);
    expect((await t.call('POST', '/api/auth/verify', { body: { token } })).status).toBe(400);
  });

  it('сброс пароля: письмо только подтверждённым, сессии сбрасываются', async () => {
    const cookie = await t.signup();
    await new Promise(r => setTimeout(r, 50));
    await t.call('POST', '/api/auth/verify', { body: { token: t.lastToken() } });
    t.mails.length = 0;

    expect((await t.call('POST', '/api/auth/forgot', { body: { email: 'ghost@example.com' } })).status).toBe(200);
    await t.call('POST', '/api/auth/forgot', { body: { email: 'a@example.com' } });
    await new Promise(r => setTimeout(r, 50));
    expect(t.mails).toHaveLength(1);

    const token = t.lastToken();
    expect((await t.call('POST', '/api/auth/reset', { body: { token, password: 'newpassword1' } })).status).toBe(200);
    expect((await t.call('GET', '/api/auth/me', { cookie })).status).toBe(401);
    expect((await t.call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'password123' } })).status).toBe(401);
    expect((await t.call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'newpassword1' } })).status).toBe(200);
    expect((await t.call('POST', '/api/auth/reset', { body: { token, password: 'another12345' } })).status).toBe(400);
  });

  it('неподтверждённой почте сброс не отправляется', async () => {
    await t.signup();
    await new Promise(r => setTimeout(r, 50));
    t.mails.length = 0;
    await t.call('POST', '/api/auth/forgot', { body: { email: 'a@example.com' } });
    await new Promise(r => setTimeout(r, 50));
    expect(t.mails).toHaveLength(0);
  });

  it('CSRF: чужой или отсутствующий Origin отклоняется', async () => {
    const a = await t.call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'x' }, headers: { origin: 'https://evil.example' } });
    expect(a.status).toBe(403);
    const b = await t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@example.com', password: 'x' } });
    expect(b.statusCode).toBe(403);
  });

  it('ограничение частоты на /auth/*', async () => {
    await t.close();
    t = await setup({ rate: { global: 1000, auth: 3 } });
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await t.call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'wrongwrong' } })).status);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
  });
});
