import { loadConfig } from '../src/config.js';
import { connect, migrate } from '../src/db/index.js';
import { buildApp } from '../src/app.js';
import { makePreset } from '../../web/rules.js';

export const TEST_DB = process.env.TEST_DATABASE_URL || 'postgres://postgres:test@localhost:55432/mebel_test';
export const cfg = loadConfig({ APP_URL: 'http://localhost:8080' });
export const preset = (type = 'wardrobe') => makePreset(type);

export async function setup(opts = {}) {
  const sql = connect(TEST_DB);
  await migrate(sql);
  await sql`TRUNCATE users, catalogs CASCADE`;
  const mails = [];
  const app = await buildApp({ sql, cfg, mailer: { send: async m => mails.push(m) }, rate: { global: 100000, auth: 100000 }, ...opts });
  const call = async (method, url, { body, cookie, headers = {}, raw } = {}) => {
    const res = await app.inject({
      method, url, headers: { origin: cfg.appUrl, ...(cookie ? { cookie } : {}), ...headers },
      ...(raw !== undefined ? { payload: raw } : body !== undefined ? { payload: body } : {}),
    });
    let json; try { json = res.json(); } catch { /* не JSON */ }
    return { status: res.statusCode, json, res };
  };
  /** Регистрирует пользователя, возвращает cookie. */
  const signup = async (email = 'a@example.com', password = 'password123') => {
    const r = await call('POST', '/api/auth/register', { body: { email, password } });
    return r.res.cookies.find(c => c.name === 'sid') ? `sid=${r.res.cookies.find(c => c.name === 'sid').value}` : null;
  };
  /** Сколько писем и токен из последнего. */
  const lastToken = () => /#(?:verify|reset)=([\w-]+)/.exec(mails.at(-1).text)[1];
  return { app, sql, call, signup, mails, lastToken, close: async () => { await app.close(); await sql.end(); } };
}
