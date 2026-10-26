import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setup, cfg, preset } from './helpers.js';
import { createApi } from '../../web/api.js';
import { createSync, projectHash } from '../../web/sync.js';
import { CATALOG_KEY } from '../../web/catalog.js';

let t;
beforeEach(async () => { t?.close && await t.close(); t = await setup(); });
afterAll(async () => { await t?.close(); });

const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };

/** Устройство: своё хранилище, база проектов и «браузер» (cookie), который ходит в Fastify через inject. */
function device({ online = true } = {}) {
  let cookie = '';
  const d = { online, storage: memStorage(), db: {}, events: [], thumbs: new Map(), wiped: 0 };
  const fetchFn = async (url, init = {}) => {
    if (!d.online) throw new TypeError('network down');
    const body = init.body;
    const payload = body instanceof Blob ? Buffer.from(await body.arrayBuffer()) : body;
    const res = await t.app.inject({ method: init.method, url: '/' + url, payload, headers: { origin: cfg.appUrl, ...init.headers, ...(cookie ? { cookie } : {}) } });
    const sid = res.cookies.find(c => c.name === 'sid');
    if (sid) cookie = sid.value ? `sid=${sid.value}` : '';
    const ct = res.headers['content-type'] || '';
    return { ok: res.statusCode < 400, status: res.statusCode, headers: { get: k => res.headers[k.toLowerCase()] ?? null },
      json: async () => res.json(), blob: async () => new Blob([res.rawPayload], { type: ct }) };
  };
  d.api = createApi(fetchFn);
  d.sync = createSync({
    api: d.api, storage: d.storage, getDb: () => d.db, persist: () => {}, onEvent: e => d.events.push(e),
    skip: id => d.placeholder === id, wipe: () => { d.db = {}; d.thumbs.clear(); d.wiped++; },
    thumbs: { get: async id => d.thumbs.get(id) || null, drop: async id => d.thumbs.delete(id) },
  });
  d.login = async (email = 'a@example.com', password = 'password123') => {
    let r = await d.api.post('/auth/login', { email, password });
    if (!r.ok) r = await d.api.post('/auth/register', { email, password });
    return d.sync.setUser(r.data.user);
  };
  d.add = (id, name, P = preset()) => { d.db[id] = { name, updated: Date.now(), P }; };
  return d;
}
const lastEvent = (d, type) => d.events.filter(e => e.type === type).at(-1);

describe('sync: проекты', () => {
  it('гостевые проекты загружаются в аккаунт при первом входе, второе устройство их получает', async () => {
    const a = device(); a.add('p1', 'Шкаф'); a.add('p2', 'Стеллаж', preset('rack'));
    expect((await a.login()).foreign).toBe(false);
    await a.sync.run();
    expect(a.sync.status).toBe('idle');

    const b = device(); await b.login(); await b.sync.run();
    expect(Object.keys(b.db).sort()).toEqual(['p1', 'p2']);
    expect(b.db.p2.name).toBe('Стеллаж');
    expect(b.db.p2.P.type).toBe('rack');
    expect(b.sync.isDirty('p1')).toBe(false);
  });

  it('правка уходит на сервер, переименование тоже, другое устройство подхватывает', async () => {
    const a = device(), b = device(); a.add('p1', 'Шкаф');
    await a.login(); await a.sync.run(); await b.login(); await b.sync.run();

    a.db.p1.name = 'Шкаф в спальню'; a.db.p1.P.height = 2100;
    expect(a.sync.isDirty('p1')).toBe(true);
    await a.sync.run();
    expect(a.sync.isDirty('p1')).toBe(false);

    await b.sync.run();
    expect(b.db.p1.name).toBe('Шкаф в спальню');
    expect(b.db.p1.P.height).toBe(2100);
    expect(lastEvent(b, 'projects').replaced.has('p1')).toBe(true);
  });

  it('параметры вида (open, hideDoors, showHoles) правкой не считаются', async () => {
    const a = device(); a.add('p1', 'Шкаф'); await a.login(); await a.sync.run();
    a.db.p1.P.open = 1; a.db.p1.P.hideDoors = true; a.db.p1.P.showHoles = true;
    expect(a.sync.isDirty('p1')).toBe(false);
    expect(projectHash({ name: 'x', P: { b: 1, a: 2 } })).toBe(projectHash({ name: 'x', P: { a: 2, b: 1 } }));
  });

  it('удаление доходит до сервера и до другого устройства', async () => {
    const a = device(), b = device(); a.add('p1', 'Один'); a.add('p2', 'Два');
    await a.login(); await a.sync.run(); await b.login(); await b.sync.run();

    delete a.db.p1; await a.sync.run();
    expect((await t.call('GET', '/api/projects/p1', { cookie: (await t.call('POST', '/api/auth/login', { body: { email: 'a@example.com', password: 'password123' } })).res.cookies.map(c => `${c.name}=${c.value}`).join('; ') })).status).toBe(404);

    await b.sync.run();
    expect(Object.keys(b.db)).toEqual(['p2']);
    expect(lastEvent(b, 'projects').removed.has('p1')).toBe(true);
  });

  it('офлайн-правки копятся и уходят, когда сеть вернулась', async () => {
    const a = device(); a.add('p1', 'Шкаф'); await a.login(); await a.sync.run();
    a.online = false;
    a.db.p1.name = 'Правка офлайн';
    await a.sync.run();
    expect(a.sync.status).toBe('offline');
    expect(a.sync.isDirty('p1')).toBe(true);

    a.online = true; await a.sync.run();
    expect(a.sync.status).toBe('idle');
    const b = device(); await b.login(); await b.sync.run();
    expect(b.db.p1.name).toBe('Правка офлайн');
  });

  it('конфликт: сервер основной, локальная версия сохраняется копией', async () => {
    const a = device(), b = device(); a.add('p1', 'Шкаф');
    await a.login(); await a.sync.run(); await b.login(); await b.sync.run();

    a.db.p1.name = 'Правка A'; await a.sync.run();     // дошла первой
    b.db.p1.name = 'Правка B';                          // b правил, не зная об этом
    await b.sync.run();

    expect(b.db.p1.name).toBe('Правка A');
    const copy = Object.entries(b.db).find(([id]) => id !== 'p1');
    expect(copy[1].name).toMatch(/^Правка B \(конфликт \d\d\.\d\d\)$/);
    expect(lastEvent(b, 'conflicts').conflicts[0].copy).toBe(copy[1].name);
    await b.sync.run(); // копия уходит на сервер как новый проект
    await a.sync.run();
    expect(Object.keys(a.db)).toHaveLength(2);
  });

  it('удалён на сервере, а локально правился: проект не теряется, заводится заново', async () => {
    const a = device(), b = device(); a.add('p1', 'Шкаф');
    await a.login(); await a.sync.run(); await b.login(); await b.sync.run();
    delete a.db.p1; await a.sync.run();
    b.db.p1.name = 'Дорогой проект'; await b.sync.run();
    const names = Object.values(b.db).map(p => p.name);
    expect(names).toEqual(['Дорогой проект']);
    expect(b.db.p1).toBeUndefined();
    await b.sync.run();
    expect(b.sync.isDirty(Object.keys(b.db)[0])).toBe(false);
  });

  it('временная заготовка не отправляется', async () => {
    const a = device(); a.add('tmp', 'Новый проект'); a.placeholder = 'tmp';
    await a.login(); await a.sync.run();
    expect((await t.sql`SELECT 1 FROM projects`)).toHaveLength(0);
  });

  it('проект, который сервер не принимает, не повторяется до правки', async () => {
    const a = device(); a.add('p1', 'Плохой', { ...preset(), sections: [] });
    await a.login(); await a.sync.run();
    expect(lastEvent(a, 'rejected').id).toBe('p1');
    const n = a.events.length; await a.sync.run();
    expect(a.events.filter(e => e.type === 'rejected')).toHaveLength(1);
    expect(a.events.length).toBeGreaterThan(n - 1);
  });

  it('миниатюра уходит на сервер и доступна другому устройству', async () => {
    const jpeg = new Blob([Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(50, 7)])], { type: 'image/jpeg' });
    const a = device(); a.add('p1', 'Шкаф'); await a.login();
    a.thumbs.set('p1', jpeg);
    a.sync.markThumb('p1');
    await a.sync.run();
    expect((await t.sql`SELECT length(jpeg) AS n FROM project_thumbs`)[0].n).toBe(54);

    const b = device(); await b.login();
    const r = await b.api.get('/projects/p1/thumb');
    expect(r.ok).toBe(true);
    expect(r.data.size).toBe(54);
  });
});

describe('sync: справочник', () => {
  const cat = (price = 2200) => ({ sheets: [{ mat: 'ЛДСП', T: 16, price }], markup: 30 });

  it('локальный справочник уходит на сервер, чистое устройство его забирает', async () => {
    const a = device(); a.storage.setItem(CATALOG_KEY, JSON.stringify(cat(2500)));
    await a.login(); await a.sync.run();
    const b = device(); await b.login(); await b.sync.run();
    expect(JSON.parse(b.storage.getItem(CATALOG_KEY)).sheets[0].price).toBe(2500);
    expect(b.events.some(e => e.type === 'catalog')).toBe(true);
  });

  it('правка цены на одном устройстве доходит до другого', async () => {
    const a = device(), b = device(); a.storage.setItem(CATALOG_KEY, JSON.stringify(cat()));
    await a.login(); await a.sync.run(); await b.login(); await b.sync.run();
    a.storage.setItem(CATALOG_KEY, JSON.stringify(cat(3000))); await a.sync.run();
    await b.sync.run();
    expect(JSON.parse(b.storage.getItem(CATALOG_KEY)).sheets[0].price).toBe(3000);
  });

  it('первый контакт с расхождением: побеждает сервер, локальный остаётся в резервной копии', async () => {
    const a = device(); a.storage.setItem(CATALOG_KEY, JSON.stringify(cat(2500)));
    await a.login(); await a.sync.run();
    const b = device(); b.storage.setItem(CATALOG_KEY, JSON.stringify(cat(9999)));
    await b.login(); await b.sync.run();
    expect(JSON.parse(b.storage.getItem(CATALOG_KEY)).sheets[0].price).toBe(2500);
    expect(JSON.parse(b.storage.getItem(CATALOG_KEY + '-backup')).sheets[0].price).toBe(9999);
  });

  it('правили на обоих устройствах: побеждает то, что синхронизируется позже', async () => {
    const a = device(), b = device(); a.storage.setItem(CATALOG_KEY, JSON.stringify(cat()));
    await a.login(); await a.sync.run(); await b.login(); await b.sync.run();
    a.storage.setItem(CATALOG_KEY, JSON.stringify(cat(3100))); await a.sync.run();
    b.storage.setItem(CATALOG_KEY, JSON.stringify(cat(3200))); await b.sync.run();
    await a.sync.run();
    expect(JSON.parse(a.storage.getItem(CATALOG_KEY)).sheets[0].price).toBe(3200);
  });
});

describe('sync: аккаунты на устройстве', () => {
  it('чужие проекты на устройстве: нужно решение; merge переносит в новый аккаунт, wipe стирает', async () => {
    const a = device(); a.add('p1', 'Проект A'); await a.login('a@example.com'); await a.sync.run();
    a.sync.expire();                                    // сессия кончилась, данные остались
    const r = await a.login('b@example.com');
    expect(r.foreign).toBe(true);
    expect(a.sync.user).toBeNull();

    const user = (await a.api.get('/auth/me')).data.user;
    a.sync.resolveForeign(user, 'merge'); await a.sync.run();
    expect((await t.sql`SELECT p.id FROM projects p JOIN users u ON u.id = p.user_id WHERE u.email = 'b@example.com'`).map(r => r.id)).toEqual(['p1']);

    const c = device(); c.add('x1', 'Проект C'); await c.login('c@example.com'); await c.sync.run(); c.sync.expire();
    const rc = await c.login('d@example.com'); expect(rc.foreign).toBe(true);
    c.sync.resolveForeign((await c.api.get('/auth/me')).data.user, 'wipe');
    expect(c.wiped).toBe(1); expect(c.db).toEqual({});
  });

  it('выход: keep оставляет проекты гостевыми, повторный вход не дублирует', async () => {
    const a = device(); a.add('p1', 'Шкаф'); await a.login(); await a.sync.run();
    await a.api.post('/auth/logout'); a.sync.signOut(true);
    expect(Object.keys(a.db)).toEqual(['p1']); expect(a.sync.status).toBe('off');
    await a.login(); await a.sync.run();
    expect(Object.keys(a.db)).toEqual(['p1']);
    expect((await t.sql`SELECT 1 FROM projects`)).toHaveLength(1);
  });

  it('выход: без keep проекты стираются с устройства', async () => {
    const a = device(); a.add('p1', 'Шкаф'); await a.login(); await a.sync.run();
    a.sync.signOut(false);
    expect(a.db).toEqual({}); expect(a.wiped).toBe(1);
    expect((await t.sql`SELECT 1 FROM projects`)).toHaveLength(1); // на сервере проект остался
  });

  it('401 в середине синхронизации: статус off, событие unauthorized', async () => {
    const a = device(); a.add('p1', 'Шкаф'); await a.login(); await a.sync.run();
    await t.sql`DELETE FROM sessions`;
    a.db.p1.name = 'Новое'; await a.sync.run();
    expect(a.sync.status).toBe('off');
    expect(lastEvent(a, 'unauthorized')).toBeTruthy();
  });
});
