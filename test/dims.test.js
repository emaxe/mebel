import { describe, it, expect } from 'vitest';
import { makePreset, rulesOf } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { dimensions, shelfGaps } from '../web/dims.js';

describe('размерные линии', () => {
  for (const type of ['wardrobe', 'rack', 'nightstand', 'dresser', 'tv']) it(`${type}: габариты и секции совпадают с моделью`, () => {
    const P = makePreset(type), spec = buildSpec(P), d = dimensions(spec, P, 0), by = id => d.find(x => x.id === id);
    expect(by('W').value).toBe(Math.round(spec.meta.W));
    expect(by('D').value).toBe(Math.round(spec.meta.D));
    expect(by('H').value).toBe(Math.round(spec.meta.H));
    expect(d.filter(x => x.kind === 'sec').map(x => x.value)).toEqual(P.sections.map(s => Math.round(s.width)));
    for (const x of d) { expect(x.a.every(Number.isFinite)).toBe(true); expect(x.b.every(Number.isFinite)).toBe(true); expect(x.value).toBeGreaterThan(0); }
  });
  it('просветы и толщины полок в сумме дают внутреннюю высоту секции', () => {
    const P = makePreset('rack'), spec = buildSpec(P);
    P.sections.forEach((_, i) => {
      const gaps = shelfGaps(spec, i), shelves = spec.parts.filter(p => p.plane === 'xz' && !p.group && p.sec === i + 1 && p.L >= 0.8 * spec.meta.sections[i].w);
      const total = gaps.reduce((a, [lo, hi]) => a + hi - lo, 0) + shelves.reduce((a, p) => a + p.T, 0);
      expect(total).toBeCloseTo(spec.meta.ih, 3);
      expect(gaps.length).toBe(shelves.length + 1);
    });
  });
  it('просветы показываются только для выбранной секции и могут быть отключены', () => {
    const P = makePreset('rack'), spec = buildSpec(P);
    expect(dimensions(spec, P, 1).filter(x => x.kind === 'gap').length).toBeGreaterThan(0);
    expect(dimensions(spec, P, 1, { gaps: false }).some(x => x.kind === 'gap')).toBe(false);
  });
  it('редактируются габариты и секции, просветы — нет', () => {
    const P = makePreset('wardrobe'), d = dimensions(buildSpec(P), P, 0);
    expect(d.filter(x => x.kind !== 'gap').every(x => x.edit)).toBe(true);
    expect(d.filter(x => x.kind === 'gap').every(x => x.edit === null)).toBe(true);
  });
  it('высота учитывает карниз', () => {
    const P = makePreset('wardrobe'); P.cornice = true;
    const spec = buildSpec(P);
    expect(dimensions(spec, P, 0).find(x => x.id === 'H').value).toBe(Math.round(spec.meta.H));
  });
});
