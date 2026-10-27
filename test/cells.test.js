import { describe, it, expect } from 'vitest';
import { makePreset, normalize, schemaOf, SCHEMA } from '../web/rules.js';
import { asCell, zonesOf } from '../web/cells.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';

const errors = (sp, P) => checkBuild(sp, P, { skipKin: true }).filter(f => f.level === 'error');
const zoned = nested => {
  const P = makePreset('wardrobe');
  const inner = nested ? { items: [], zone: { pos: 'top', h: 300, split: 150, left: [{ type: 'shelf', y: 100 }], right: [{ type: 'shelf', y: 150 }] } } : [{ type: 'shelf', y: 200 }];
  P.sections[1].zone = { pos: 'bottom', h: 700, split: 380, left: inner, right: [{ type: 'shelf', y: 300 }] };
  return normalize(P);
};

describe('дерево ячеек: зона как рекурсивная ячейка', () => {
  it('массив полок колонки читается как ячейка и даёт тот же расчёт', () => {
    const a = zoned(false), b = JSON.parse(JSON.stringify(a));
    b.sections[1].zone.left = { items: [{ type: 'shelf', y: 200 }] };
    expect(normalize(b).sections[1].zone.left).toEqual({ items: [{ type: 'shelf', y: 200 }] });
    expect(buildSpec(b)).toEqual(buildSpec(a));
    expect(asCell([{ type: 'shelf', y: 1 }])).toEqual({ items: [{ type: 'shelf', y: 1 }] });
  });
  it('вложенная зона даёт вторую полуперегородку и вторую полку-границу без замечаний', () => {
    const P = zoned(true), sp = buildSpec(P), count = n => sp.parts.filter(p => p.name === n).length;
    expect(zonesOf(P.sections[1]).map(z => z.depth)).toEqual([0, 1]);
    expect(count('Полуперегородка')).toBe(2);
    expect(count('Полка зоны')).toBe(2);
    expect(sp.warnings).toEqual([]);
    expect(errors(sp, P)).toEqual([]);
  });
  it('вложенная зона упирается в полку внешней зоны и крепится к ней', () => {
    const P = zoned(true), sp = buildSpec(P);
    const halves = sp.parts.filter(p => p.name === 'Полуперегородка').sort((a, b) => a.L - b.L);
    expect(halves.map(h => Math.round(h.L))).toEqual([300, 700]);
    const inner = halves[0], outer = halves[1], shelf = sp.parts.find(p => p.name === 'Полка зоны' && Math.abs(p.c[1] - (sp.meta.yB + 700 + p.T / 2)) < 1);
    expect(shelf).toBeTruthy();
    expect(inner.c[1] + inner.L / 2).toBeCloseTo(shelf.c[1] - shelf.T / 2, 3);
    expect(inner.holes.length).toBeGreaterThan(0);
    expect(outer.holes.length).toBeGreaterThan(0);
  });
  it('схема 3 только у проектов с зонами', () => {
    expect(SCHEMA).toBe(3);
    expect(schemaOf(makePreset('wardrobe'))).toBe(1);
    expect(schemaOf(zoned(false))).toBe(3);
    const P = zoned(true); expect(schemaOf(normalize(JSON.parse(JSON.stringify(P))))).toBe(3);
  });
  it('в узкой колонке вложенная зона отключается, глубина ограничена', () => {
    const P = zoned(true); P.sections[1].zone.split = 100; normalize(P);
    expect(P.sections[1].zone.left.zone).toBeUndefined();
    const Q = makePreset('wardrobe'); Q.height = 2800; Q.sections[1].width = 1200;
    let cell = { items: [] }; Q.sections[1].zone = { pos: 'bottom', h: 1900, split: 600, left: cell, right: [] };
    for (let i = 0; i < 6; i++) { cell.zone = { pos: i % 2 ? 'bottom' : 'top', h: 1500 - i * 150, split: 400, left: { items: [] }, right: [] }; cell = cell.zone.left; }
    normalize(Q);
    expect(Math.max(...zonesOf(Q.sections[1]).map(z => z.depth))).toBeLessThanOrEqual(3);
    expect(errors(buildSpec(Q), Q)).toEqual([]);
  });
  it('случайные вложенные зоны собираются без ошибок проверки', () => {
    for (const pos of [['top', 'top'], ['top', 'bottom'], ['bottom', 'top'], ['bottom', 'bottom']]) {
      const P = makePreset('wardrobe');
      P.sections[1].zone = { pos: pos[0], h: 800, split: 380, left: { items: [{ type: 'shelf', y: 100 }], zone: { pos: pos[1], h: 400, split: 150, left: [{ type: 'shelf', y: 100 }], right: [] } }, right: [] };
      normalize(P);
      const sp = buildSpec(P);
      expect(sp.warnings, pos.join()).toEqual([]);
      expect(errors(sp, P), pos.join()).toEqual([]);
    }
  });
});

describe('дерево ячеек: смена высоты', () => {
  it('масштабирует вложенные зоны вместе с внешней', async () => {
    const { fitSections, innerH } = await import('../web/rules.js');
    const P = zoned(true), oldIh = innerH(P);
    P.height += 200; fitSections(P, oldIh, innerH(P), 'prop'); normalize(P);
    const [outer, inner] = zonesOf(P.sections[1]).map(x => x.z);
    expect(outer.h).toBeGreaterThan(700); expect(inner.h).toBeGreaterThan(300);
    const sp = buildSpec(P); expect(sp.warnings).toEqual([]); expect(errors(sp, P)).toEqual([]);
  });
});
