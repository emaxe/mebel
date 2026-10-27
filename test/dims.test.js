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

import { buildProject, addModule } from '../web/project.js';
describe('размеры в проекте из нескольких модулей', () => {
  const r = makePreset('wardrobe'); addModule(r, makePreset('dresser'), { gap: 40, y: 0 });
  const pr = buildProject(r), m = pr.mods[1];
  it('точки сдвигаются вместе с модулем', () => {
    const own = dimensions(m.spec, m.P, 0), shifted = dimensions(m.spec, m.P, 0, { off: [m.x, m.y, m.z] });
    own.forEach((d, i) => { for (let k = 0; k < 3; k++) { expect(shifted[i].a[k]).toBeCloseTo(d.a[k] + [m.x, m.y, m.z][k], 6); expect(shifted[i].b[k]).toBeCloseTo(d.b[k] + [m.x, m.y, m.z][k], 6); } expect(shifted[i].value).toBe(d.value); });
  });
  it('общая ширина проекта добавляется отдельной нередактируемой линией', () => {
    const d = dimensions(m.spec, m.P, 0, { total: pr.spec.meta }), pw = d.find(x => x.id === 'PW');
    expect(pw.value).toBe(Math.round(pr.spec.meta.W)); expect(pw.edit).toBeNull();
    expect(pw.a[0]).toBeCloseTo(-pr.spec.meta.W / 2, 6);
    expect(dimensions(m.spec, m.P, 0).some(x => x.id === 'PW')).toBe(false);
  });
});

describe('размеры повёрнутого модуля', () => {
  it('точки поворачиваются вокруг вертикали, вектор сдвига линии тоже', () => {
    const r = makePreset('kbase'), spec = buildSpec(r), rot = Math.PI / 2, off = [100, 50, -30];
    const base = dimensions(spec, r, 0), tr = dimensions(spec, r, 0, { off, rot });
    const R = v => [v[0] * Math.cos(rot) + v[2] * Math.sin(rot), v[1], -v[0] * Math.sin(rot) + v[2] * Math.cos(rot)];
    base.forEach((d, i) => { const a = R(d.a); for (let k = 0; k < 3; k++) { expect(tr[i].a[k]).toBeCloseTo(a[k] + off[k], 6); expect(tr[i].off[k]).toBeCloseTo(R(d.off)[k], 6); } expect(tr[i].value).toBe(d.value); });
  });
  it('без поворота результат прежний', () => {
    const r = makePreset('kbase'), spec = buildSpec(r);
    expect(JSON.stringify(dimensions(spec, r, 0, { rot: 0 }))).toBe(JSON.stringify(dimensions(spec, r, 0)));
  });
});
