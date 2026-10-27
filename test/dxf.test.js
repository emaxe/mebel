import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { groupParts, toDXF } from '../web/export.js';
import { partContour, roundedRect } from '../web/dxf.js';
import { randomProject } from './helpers.js';

const segArea = (p, q, b) => {
  if (!b) return 0;
  const c = Math.hypot(q.x - p.x, q.y - p.y), th = 4 * Math.atan(b), r = c / (2 * Math.sin(th / 2));
  return 0.5 * r * r * (th - Math.sin(th));
};
const area = pts => {
  let a = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += (p.x * q.y - q.x * p.y) / 2 + segArea(p, q, p.b); });
  return a;
};
const notch = (corner, u0, v0, u1, v1, r = 0) => ({ kind: 'notch', corner, u0, v0, u1, v1, r });

describe('контур детали', () => {
  it('без выемок это прямоугольник L×W против часовой', () => {
    const c = partContour(800, 500);
    expect(c.length).toBe(4);
    expect(area(c)).toBeCloseTo(400000, 6);
  });
  for (const [corner, args] of [['w1d1', [0, 0, 100, 50]], ['w2d1', [700, 0, 800, 50]], ['w2d2', [700, 450, 800, 500]], ['w1d2', [0, 450, 100, 500]]]) {
    it(`выемка в углу ${corner} вычитается из площади`, () => {
      const c = partContour(800, 500, [notch(corner, ...args)]);
      expect(area(c)).toBeCloseTo(400000 - 100 * 50, 6);
      expect(c.length).toBe(6);
    });
    it(`скруглённая выемка ${corner}: вычитается площадь минус скругление`, () => {
      const r = 10, c = partContour(800, 500, [notch(corner, ...args, r)]);
      expect(area(c)).toBeCloseTo(400000 - (100 * 50 - r * r * (1 - Math.PI / 4)), 3);
    });
  }
  it('несколько выемок в разных углах', () => {
    const c = partContour(800, 500, [notch('w1d1', 0, 0, 60, 40), notch('w2d2', 740, 460, 800, 500)]);
    expect(area(c)).toBeCloseTo(400000 - 2400 - 2400, 6);
  });
  it('скругление прямоугольника даёт четверть круга на угол', () => {
    const c = roundedRect(0, 0, 100, 60, [8, 8, 8, 8]);
    expect(area(c)).toBeCloseTo(6000 - 4 * 64 * (1 - Math.PI / 4), 3);
    expect(c.filter(p => p.b > 0).length).toBe(4);
  });
  it('радиус больше половины стороны ограничивается', () => {
    const c = roundedRect(0, 0, 40, 40, [100, 100, 100, 100]);
    expect(c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(area(c)).toBeCloseTo(Math.PI * 400, 2);
  });
});

const parsePolys = text => {
  const L = text.split(/\r?\n/), pairs = [];
  for (let i = 0; i + 1 < L.length; i += 2) pairs.push([L[i].trim(), L[i + 1]]);
  const polys = [];
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i][0] === '0' && pairs[i][1] === 'POLYLINE') {
      const pl = { layer: null, closed: false, thickness: null, v: [] }; let j = i + 1;
      for (; j < pairs.length && pairs[j][0] !== '0'; j++) { if (pairs[j][0] === '8') pl.layer = pairs[j][1]; if (pairs[j][0] === '70') pl.closed = pairs[j][1] === '1'; if (pairs[j][0] === '39') pl.thickness = +pairs[j][1]; }
      for (; j < pairs.length && pairs[j][1] === 'VERTEX'; ) { const v = { x: 0, y: 0, b: 0 }; j++; for (; j < pairs.length && pairs[j][0] !== '0'; j++) { if (pairs[j][0] === '10') v.x = +pairs[j][1]; if (pairs[j][0] === '20') v.y = +pairs[j][1]; if (pairs[j][0] === '42') v.b = +pairs[j][1]; } pl.v.push(v); }
      pl.end = pairs[j] && pairs[j][1];
      polys.push(pl);
    }
  }
  return { pairs, polys };
};
const read = spec => Buffer.from(toDXF(spec)).toString('latin1');

describe('DXF: контуры в файле', () => {
  it('у каждой детали замкнутый контур нужной площади и толщины', () => {
    const spec = buildSpec(makePreset('wardrobe')), G = groupParts(spec), { polys } = parsePolys(read(spec));
    const body = polys.filter(p => ['KORPUS', 'FASAD', 'HDF', 'STEKLO', 'ZERKALO', 'DETAL'].includes(p.layer));
    expect(body.length).toBe(G.length);
    G.forEach((g, i) => {
      const p = body[i];
      expect(p.closed).toBe(true); expect(p.end).toBe('SEQEND');
      expect(p.thickness).toBe(g.T);
      expect(Math.abs(area(p.v))).toBeCloseTo(g.L * g.W, 0);
    });
  });
  it('контур с выемкой в файле совпадает с расчётной площадью', () => {
    const P = makePreset('wardrobe');
    P.cutouts = [{ part: 'Задняя стенка', sec: 0, kind: 'notch', w: 100, h: 50, r: 6, corner: 'w2d1' }];
    const spec = buildSpec(P), g = groupParts(spec).find(x => x.name === 'Задняя стенка');
    const polys = parsePolys(read(spec)).polys.filter(p => p.layer === 'HDF');
    expect(polys.length).toBeGreaterThan(0);
    const hit = polys.find(p => p.v.length > 4);
    expect(hit).toBeTruthy();
    expect(Math.abs(area(hit.v))).toBeCloseTo(g.L * g.W - (100 * 50 - 36 * (1 - Math.PI / 4)), 0);
  });
  it('отверстия лежат внутри габарита своей детали', () => {
    const spec = buildSpec(makePreset('dresser')), text = read(spec);
    const { polys } = parsePolys(text), circles = [...text.matchAll(/\r\nCIRCLE\r\n8\r\n(\S+)\r\n10\r\n(-?[\d.]+)\r\n20\r\n(-?[\d.]+)/g)];
    expect(circles.length).toBeGreaterThan(20);
    const boxes = polys.filter(p => ['KORPUS', 'FASAD', 'HDF'].includes(p.layer)).map(p => ({ x0: Math.min(...p.v.map(v => v.x)), x1: Math.max(...p.v.map(v => v.x)), y0: Math.min(...p.v.map(v => v.y)), y1: Math.max(...p.v.map(v => v.y)) }));
    for (const [, , x, y] of circles) expect(boxes.some(b => +x >= b.x0 - 0.01 && +x <= b.x1 + 0.01 && +y >= b.y0 - 0.01 && +y <= b.y1 + 0.01), `${x},${y}`).toBe(true);
  });
  it('таблица слоёв содержит все слои сущностей, цвета заданы', () => {
    const text = read(buildSpec(makePreset('wardrobe')));
    const tbl = text.slice(text.indexOf('TABLES'), text.indexOf('ENTITIES'));
    const declared = new Set([...tbl.matchAll(/\r\nLAYER\r\n2\r\n(\S+)\r\n70\r\n0\r\n62\r\n(\d+)/g)].map(m => m[1]));
    const used = new Set(parsePolys(text).pairs.filter(([c]) => c === '8').map(([, v]) => v));
    for (const l of used) expect(declared.has(l), l).toBe(true);
    expect(declared.has('0')).toBe(true);
  });
  it('границы чертежа в заголовке охватывают все контуры', () => {
    const text = read(buildSpec(makePreset('wardrobe')));
    const m = /\$EXTMIN\r\n10\r\n(-?[\d.]+)\r\n20\r\n(-?[\d.]+)[\s\S]*\$EXTMAX\r\n10\r\n(-?[\d.]+)\r\n20\r\n(-?[\d.]+)/.exec(text);
    const [x0, y0, x1, y1] = m.slice(1).map(Number), { polys } = parsePolys(text);
    for (const p of polys) for (const v of p.v) { expect(v.x).toBeGreaterThanOrEqual(x0 - 0.01); expect(v.x).toBeLessThanOrEqual(x1 + 0.01); expect(v.y).toBeGreaterThanOrEqual(y0 - 0.01); expect(v.y).toBeLessThanOrEqual(y1 + 0.01); }
  });
  it('опции отключают кромку и подписи', () => {
    const spec = buildSpec(makePreset('wardrobe')), plain = Buffer.from(toDXF(spec, { edges: false, labels: false })).toString('latin1');
    expect(plain).not.toMatch(/KROMKA_/); expect(plain).not.toMatch(/PODPISI/);
    expect(read(spec)).toMatch(/KROMKA_/);
  });
  for (const seed of [2, 5, 9, 14, 21, 33]) it(`случайный проект ${seed}: все контуры замкнуты, площади положительны`, () => {
    const spec = buildSpec(randomProject(seed)), { polys } = parsePolys(read(spec));
    for (const p of polys) { expect(p.closed).toBe(true); expect(p.end).toBe('SEQEND'); expect(p.v.length).toBeGreaterThanOrEqual(4); expect(area(p.v)).toBeGreaterThan(0); }
  });
});
