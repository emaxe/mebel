import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { preset, setup } from './helpers.js';

let t, cookie;
beforeEach(async () => { t?.close && await t.close(); t = await setup(); cookie = await t.signup(); });
afterAll(async () => { await t?.close(); });

const put = (id, body, c = cookie) => t.call('PUT', `/api/projects/${id}`, { body, cookie: c });
const proj = (name = 'Шкаф', baseVersion = 0, P = preset()) => ({ name, P, baseVersion });

describe('проекты', () => {
  it('требуют входа', async () => {
    expect((await t.call('GET', '/api/projects')).status).toBe(401);
    expect((await t.call('PUT', '/api/projects/p1', { body: proj() })).status).toBe(401);
  });

  it('создание, чтение, обновление с версиями', async () => {
    const c = await put('p1', proj());
    expect(c.status).toBe(200);
    expect(c.json.version).toBe(1);
    const g = await t.call('GET', '/api/projects/p1', { cookie });
    expect(g.json.name).toBe('Шкаф');
    expect(g.json.P.sections.length).toBeGreaterThan(0);
    const u = await put('p1', proj('Шкаф 2', 1));
    expect(u.json.version).toBe(2);
    expect((await t.call('GET', '/api/projects/p1', { cookie })).json.name).toBe('Шкаф 2');
  });

  it('новые поля проекта (вырезы, модели фурнитуры, режим сборки) сохраняются и возвращаются', async () => {
    const P = preset();
    P.cutouts = [{ part: 'Задняя стенка', sec: 0, kind: 'hole', w: 60, h: 40, r: 8, u: 400, v: 300, corner: 'w1d1' }];
    P.fittings = { 'hinge:soft': 'hinge-soft' }; P.slide = 'hidden'; P.hinge = 'wide'; P.push = false; P.wallFix = true; P.asmStep = 3;
    expect((await put('p1', proj('С вырезом', 0, P))).status).toBe(200);
    const g = (await t.call('GET', '/api/projects/p1', { cookie })).json.P;
    expect(g.cutouts).toEqual(P.cutouts); expect(g.fittings).toEqual(P.fittings);
    expect(g).toMatchObject({ slide: 'hidden', hinge: 'wide', wallFix: true });
  });

  it('проект с вырезом в несуществующей детали принимается: расчёт лишь предупреждает', async () => {
    const P = preset(); P.cutouts = [{ part: 'Нет такой', kind: 'hole', w: 50, h: 50, r: 0, u: 100, v: 100 }];
    expect((await put('p1', proj('x', 0, P))).status).toBe(200);
  });

  it('устаревший baseVersion → 409 с серверной копией', async () => {
    await put('p1', proj());
    await put('p1', proj('Новое имя', 1));
    const r = await put('p1', proj('Старая правка', 1));
    expect(r.status).toBe(409);
    expect(r.json.server.name).toBe('Новое имя');
    expect(r.json.server.version).toBe(2);
    expect((await put('p1', proj('Создать повторно', 0))).status).toBe(409);
  });

  it('чужой проект недоступен: 404 и свой PUT не затрагивает чужой', async () => {
    await put('p1', proj());
    const other = await t.signup('b@example.com');
    expect((await t.call('GET', '/api/projects/p1', { cookie: other })).status).toBe(404);
    expect((await t.call('DELETE', '/api/projects/p1', { cookie: other })).status).toBe(404);
    expect((await t.call('GET', '/api/projects', { cookie: other })).json.projects).toEqual([]);
    expect((await put('p1', proj('Мой', 0), other)).status).toBe(200);
    expect((await t.call('GET', '/api/projects/p1', { cookie })).json.name).toBe('Шкаф');
  });

  it('список с since и надгробия', async () => {
    await put('p1', proj('Один'));
    await put('p2', proj('Два'));
    const all = (await t.call('GET', '/api/projects', { cookie })).json.projects;
    expect(all.map(p => p.id)).toEqual(['p1', 'p2']);
    const cursor = Math.max(...all.map(p => p.updated));
    expect((await t.call('GET', `/api/projects?since=${cursor}`, { cookie })).json.projects).toEqual([]);

    expect((await t.call('DELETE', '/api/projects/p1', { cookie })).status).toBe(200);
    const after = (await t.call('GET', `/api/projects?since=${cursor}`, { cookie })).json.projects;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: 'p1', deleted: true });
    expect((await t.call('GET', '/api/projects/p1', { cookie })).status).toBe(404);
    expect((await put('p1', proj('Воскресить', 1))).status).toBe(409);
    const [row] = await t.sql`SELECT data FROM projects WHERE id = 'p1'`;
    expect(row.data).toEqual({});
  });

  it('невалидные данные отклоняются', async () => {
    expect((await put('p1', { name: '', P: preset(), baseVersion: 0 })).status).toBe(400);
    expect((await put('p1', { name: 'X', P: { sections: [] }, baseVersion: 0 })).status).toBe(400);
    expect((await put('p1', { name: 'X', P: 'строка', baseVersion: 0 })).status).toBe(400);
    expect((await put('bad id!', proj())).status).toBe(400);
    const big = preset(); big.junk = 'x'.repeat(600 * 1024);
    expect([413, 422]).toContain((await put('p1', proj('X', 0, big))).status);
    const broken = preset(); broken.sections[0].items = [{ type: 'shelf', y: 'abc' }, null];
    const r = await put('p9', proj('X', 0, broken));
    expect([200, 422]).toContain(r.status); // ядро либо терпит, либо сервер отвечает 422 — но не 500
  });

  it('все типы изделий проходят проверку ядром', async () => {
    for (const type of ['wardrobe', 'rack', 'nightstand', 'dresser', 'tv']) {
      expect((await put('t-' + type, proj(type, 0, preset(type)))).status).toBe(200);
    }
  });
});

describe('миниатюры', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
  const putThumb = (id, raw, c = cookie) => t.call('PUT', `/api/projects/${id}/thumb`, { raw, cookie: c, headers: { 'content-type': 'image/jpeg' } });

  it('загрузка и выдача', async () => {
    await put('p1', proj());
    expect((await putThumb('p1', jpeg)).status).toBe(200);
    const g = await t.call('GET', '/api/projects/p1/thumb', { cookie });
    expect(g.status).toBe(200);
    expect(g.res.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(g.res.rawPayload, jpeg)).toBe(0);
  });

  it('не JPEG, большой файл и чужой проект отклоняются', async () => {
    await put('p1', proj());
    expect((await putThumb('p1', Buffer.from('GIF89a....'))).status).toBe(400);
    expect((await putThumb('p1', Buffer.concat([jpeg, Buffer.alloc(300 * 1024)]))).status).toBe(413);
    const other = await t.signup('b@example.com');
    expect((await putThumb('p1', jpeg, other)).status).toBe(404);
    expect((await t.call('GET', '/api/projects/p1/thumb', { cookie: other })).status).toBe(404);
  });
});

describe('история версий', () => {
  it('снимок не чаще раза в 10 минут, откат сохраняет текущее', async () => {
    await put('p1', proj('v1'));
    await put('p1', proj('v2', 1)); // первый снимок: состояние v1
    await put('p1', proj('v3', 2)); // снимок свежий — не пишется
    let list = (await t.call('GET', '/api/projects/p1/versions', { cookie })).json.versions;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('v1');

    await t.sql`UPDATE project_versions SET created_at = now() - interval '11 minutes'`;
    await put('p1', proj('v4', 3));
    list = (await t.call('GET', '/api/projects/p1/versions', { cookie })).json.versions;
    expect(list.map(v => v.name)).toEqual(['v3', 'v1']);

    const old = list.at(-1);
    expect((await t.call('GET', `/api/projects/p1/versions/${old.id}`, { cookie })).json.P.sections.length).toBeGreaterThan(0);
    const r = await t.call('POST', `/api/projects/p1/versions/${old.id}/restore`, { cookie });
    expect(r.status).toBe(200);
    expect(r.json.name).toBe('v1');
    expect(r.json.version).toBe(5);
    list = (await t.call('GET', '/api/projects/p1/versions', { cookie })).json.versions;
    expect(list[0].name).toBe('v4'); // перед откатом сохранено текущее состояние
  });

  it('хранится не больше 50 снимков, чужая история недоступна', async () => {
    await put('p1', proj('v0'));
    for (let i = 1; i <= 55; i++) {
      await t.sql`UPDATE project_versions SET created_at = now() - interval '11 minutes'`;
      await put('p1', proj('v' + i, i));
    }
    expect((await t.call('GET', '/api/projects/p1/versions', { cookie })).json.versions).toHaveLength(50);
    const other = await t.signup('b@example.com');
    expect((await t.call('GET', '/api/projects/p1/versions', { cookie: other })).json.versions).toEqual([]);
    const [v] = await t.sql`SELECT id FROM project_versions LIMIT 1`;
    expect((await t.call('POST', `/api/projects/p1/versions/${v.id}/restore`, { cookie: other })).status).toBe(404);
  });

  it('удаление проекта стирает историю', async () => {
    await put('p1', proj('v1'));
    await put('p1', proj('v2', 1));
    await t.call('DELETE', '/api/projects/p1', { cookie });
    expect((await t.sql`SELECT 1 FROM project_versions`)).toHaveLength(0);
  });
});

describe('справочник', () => {
  it('пустой → запись → конфликт', async () => {
    expect((await t.call('GET', '/api/catalog', { cookie })).json).toEqual({ data: null, version: 0 });
    const a = await t.call('PUT', '/api/catalog', { cookie, body: { data: { sheets: [1] }, baseVersion: 0 } });
    expect(a.json.version).toBe(1);
    const b = await t.call('PUT', '/api/catalog', { cookie, body: { data: { sheets: [2] }, baseVersion: 1 } });
    expect(b.json.version).toBe(2);
    const c = await t.call('PUT', '/api/catalog', { cookie, body: { data: { sheets: [3] }, baseVersion: 1 } });
    expect(c.status).toBe(409);
    expect(c.json.server.data).toEqual({ sheets: [2] });
    expect((await t.call('GET', '/api/catalog', { cookie })).json.data).toEqual({ sheets: [2] });
  });

  it('справочники пользователей изолированы, данные не-объект отклоняются', async () => {
    await t.call('PUT', '/api/catalog', { cookie, body: { data: { x: 1 }, baseVersion: 0 } });
    const other = await t.signup('b@example.com');
    expect((await t.call('GET', '/api/catalog', { cookie: other })).json.data).toBeNull();
    expect((await t.call('PUT', '/api/catalog', { cookie, body: { data: 'строка', baseVersion: 1 } })).status).toBe(400);
  });
});

describe('ссылки для просмотра', () => {
  const verify = async () => { await new Promise(r => setTimeout(r, 50)); await t.call('POST', '/api/auth/verify', { body: { token: t.lastToken() } }); };

  it('нужна подтверждённая почта', async () => {
    await put('p1', proj());
    const r = await t.call('POST', '/api/projects/p1/share', { cookie });
    expect(r.status).toBe(403);
    expect(r.json.error).toBe('email_not_verified');
  });

  it('создание, публичное чтение без входа, отзыв', async () => {
    await verify();
    await put('p1', proj('Шкаф для клиента'));
    await t.call('PUT', '/api/catalog', { cookie, body: { data: { sheets: [] }, baseVersion: 0 } });
    const s = await t.call('POST', '/api/projects/p1/share', { cookie });
    expect(s.status).toBe(200);
    expect((await t.call('POST', '/api/projects/p1/share', { cookie })).json.token).toBe(s.json.token);

    const pub = await t.call('GET', `/api/share/${s.json.token}`);
    expect(pub.status).toBe(200);
    expect(pub.json.name).toBe('Шкаф для клиента');
    expect(pub.json.catalog).toEqual({ sheets: [] });
    expect(pub.json.user_id).toBeUndefined();
    expect(pub.res.headers['set-cookie']).toBeUndefined();

    expect((await t.call('DELETE', '/api/projects/p1/share', { cookie })).status).toBe(200);
    expect((await t.call('GET', `/api/share/${s.json.token}`)).status).toBe(404);
  });

  it('чужой проект не расшаривается, удалённый проект закрывает ссылку', async () => {
    await verify();
    await put('p1', proj());
    const s = await t.call('POST', '/api/projects/p1/share', { cookie });
    const other = await t.signup('b@example.com');
    await verify();
    expect((await t.call('POST', '/api/projects/p1/share', { cookie: other })).status).toBe(404);
    expect((await t.call('DELETE', '/api/projects/p1/share', { cookie: other })).status).toBe(404);
    expect((await t.call('GET', `/api/share/${s.json.token}`)).status).toBe(200);
    await t.call('DELETE', '/api/projects/p1', { cookie });
    expect((await t.call('GET', `/api/share/${s.json.token}`)).status).toBe(404);
  });
});

describe('служебное', () => {
  it('health', async () => {
    expect((await t.call('GET', '/api/health')).json).toEqual({ ok: true });
  });
});

describe('справочник с моделями фурнитуры', () => {
  it('полный справочник по умолчанию с параметрами присадки помещается и возвращается без потерь', async () => {
    const { DEFAULT_CATALOG } = await import('../../web/catalog.js');
    const data = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
    data.fittings.find(f => f.id === 'hinge-soft').params = { cupEdge: 22.5, plateSetback: 45 };
    data.fittings.find(f => f.id === 'slide-ball').params = { lens: '300,400,500', gap: 30 };
    data.milling.frameW = 80;
    expect(JSON.stringify(data).length).toBeLessThan(64 * 1024);
    const r = await t.call('PUT', '/api/catalog', { cookie, body: { data, baseVersion: 0 } });
    expect(r.status).toBe(200);
    expect((await t.call('GET', '/api/catalog', { cookie })).json.data).toEqual(data);
  });
});

