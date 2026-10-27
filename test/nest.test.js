import { describe, it, expect } from 'vitest';
import { nest, offcutsOf } from '../web/nest.js';
import { groupParts } from '../web/export.js';
import { buildSpec } from '../web/model.js';
import { makePreset } from '../web/rules.js';

const g = (no, L, W, qty = 1, label = 'ЛДСП Белый', T = 18) => ({ no, name: 'д' + no, mat: 'body', label, T, L, W, qty, saw: { L, W }, plane: 'xz', edges: {} });
const OPT = { trim: 0, kerf: 4, sheetFor: () => ({ L: 2000, W: 1000 }) };

describe('деловые остатки', () => {
  it('деталь в углу даёт два непересекающихся остатка с учётом пропила', () => {
    const o = offcutsOf([{ x: 0, y: 0, l: 400, w: 300 }], 1000, 500, 4, [100, 100]);
    expect(o.length).toBe(2);
    expect(o[0]).toEqual({ x: 404, y: 0, l: 596, w: 500 });
    expect(o[1]).toEqual({ x: 0, y: 304, l: 404, w: 196 });
  });
  it('остатки не пересекаются между собой и с деталями', () => {
    const pcs = [{ x: 0, y: 0, l: 600, w: 400 }, { x: 604, y: 0, l: 300, w: 200 }, { x: 0, y: 404, l: 500, w: 300 }];
    const o = offcutsOf(pcs, 1000, 800, 4, [100, 100]);
    const hit = (a, b, k = 0) => a.x < b.x + b.l + k && b.x < a.x + a.l + k && a.y < b.y + b.w + k && b.y < a.y + a.w + k;
    o.forEach((a, i) => { o.slice(i + 1).forEach(b => expect(hit(a, b)).toBe(false)); pcs.forEach(p => expect(hit(a, p, 3.9)).toBe(false)); });
    expect(o.length).toBeGreaterThan(0);
  });
  it('мелкие остатки меньше порога не попадают', () => {
    expect(offcutsOf([{ x: 0, y: 0, l: 950, w: 450 }], 1000, 500, 4, [300, 100])).toEqual([]);
  });
  it('пустой лист — один остаток на весь лист', () => {
    expect(offcutsOf([], 1000, 500, 4, [300, 100])).toEqual([{ x: 0, y: 0, l: 1000, w: 500 }]);
  });
});

describe('порядок резов', () => {
  it('резы лежат внутри листа, имеют длину и нумерованы по порядку', () => {
    const N = nest([g(1, 700, 400, 6), g(2, 500, 300, 5), g(3, 300, 200, 4)], OPT);
    for (const sh of N.sheets) {
      expect(sh.cuts.length).toBeGreaterThan(0);
      sh.cuts.forEach((c, i) => {
        expect(c.n).toBe(i + 1);
        expect(['H', 'V']).toContain(c.dir);
        const max = c.dir === 'H' ? sh.W : sh.L, maxAlong = c.dir === 'H' ? sh.L : sh.W;
        expect(c.pos).toBeGreaterThan(0); expect(c.pos).toBeLessThanOrEqual(max);
        expect(c.from).toBeGreaterThanOrEqual(0); expect(c.to).toBeLessThanOrEqual(maxAlong + 1e-9); expect(c.len).toBeGreaterThan(0);
      });
      expect(sh.cutLen).toBeCloseTo(sh.cuts.reduce((a, c) => a + c.len, 0), 6);
    }
  });
  it('каждый рез идёт по участку, не пересечённому предыдущими резами', () => {
    const N = nest([g(1, 700, 400, 6), g(2, 500, 300, 5), g(3, 300, 200, 4)], OPT);
    for (const sh of N.sheets) sh.cuts.forEach((c, i) => {
      for (const p of sh.cuts.slice(0, i)) {
        if (p.dir === c.dir) continue;
        const crosses = c.pos > p.from && c.pos < p.to && p.pos > c.from && p.pos < c.to;
        if (crosses) expect(false, `рез ${c.n} пересекает более ранний ${p.n}`).toBe(true);
      }
    });
  });
});

describe('складские остатки', () => {
  const stock = [{ label: 'ЛДСП Белый', T: 18, L: 800, W: 600, qty: 2 }];
  it('детали сначала ложатся на остатки, целых листов меньше', () => {
    const parts = [g(1, 700, 500, 2), g(2, 600, 900, 3)];
    const base = nest(parts, OPT), withStock = nest(parts, { ...OPT, stock });
    expect(withStock.sheets.filter(s => s.stock).length).toBe(2);
    expect(withStock.sheets.filter(s => !s.stock).length).toBeLessThanOrEqual(base.sheets.length - 1);
    for (const s of withStock.sheets.filter(s => s.stock)) { expect(s.trim).toBe(0); expect([s.L, s.W]).toEqual([800, 600]); }
  });
  it('остаток, в который ничего не помещается, не расходуется', () => {
    const N = nest([g(1, 1500, 900)], { ...OPT, stock });
    expect(N.sheets.every(s => !s.stock)).toBe(true);
  });
  it('остаток другого материала или толщины игнорируется', () => {
    const N = nest([g(1, 300, 300)], { ...OPT, stock: [{ label: 'ЛДСП Дуб', T: 18, L: 800, W: 600, qty: 1 }, { label: 'ЛДСП Белый', T: 16, L: 800, W: 600, qty: 1 }] });
    expect(N.sheets.every(s => !s.stock)).toBe(true);
  });
  it('количество остатков ограничено qty', () => {
    const N = nest([g(1, 700, 500, 5)], { ...OPT, stock: [{ label: 'ЛДСП Белый', T: 18, L: 800, W: 600, qty: 1 }] });
    expect(N.sheets.filter(s => s.stock).length).toBe(1);
    expect(N.sheets.reduce((a, s) => a + s.pieces.length, 0)).toBe(5);
  });
});

describe('общие свойства', () => {
  it('результат детерминирован', () => {
    const G = groupParts(buildSpec(makePreset('wardrobe')));
    expect(JSON.stringify(nest(G))).toBe(JSON.stringify(nest(G)));
  });
  it('деталь больше листа попадает в over, остальные раскладываются', () => {
    const N = nest([g(1, 3000, 1500), g(2, 500, 400)], OPT);
    expect(N.over.length).toBe(1); expect(N.sheets.reduce((a, s) => a + s.pieces.length, 0)).toBe(1);
  });
});
