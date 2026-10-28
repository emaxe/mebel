// Снимок buildSpec при параметрах по умолчанию: новые поля ядра не должны менять геометрию, присадку и фурнитуру.
// Обновить снимок осознанно: npx vitest run -u
import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';

const strip = spec => ({
  parts: spec.parts.map(p => ({ name: p.name, mat: p.mat, label: p.label, T: p.T, L: p.L, W: p.W, c: p.c, edges: p.edges, holes: p.holes, grooves: p.grooves, notes: p.notes, sec: p.sec, group: p.group && p.group.id })),
  extras: spec.extras.map(e => ({ kind: e.kind, name: e.name, mat: e.mat, c: e.c, s: e.s, r: e.r, len: e.len, axis: e.axis, a: e.a, b: e.b, nc: e.nc, group: e.group && e.group.id })),
  hw: spec.hw,
  warnings: spec.warnings,
  meta: spec.meta,
});

const TYPES = ['wardrobe', 'rack', 'nightstand', 'dresser', 'tv'];
for (const type of TYPES) for (const joint of ['confirmat', 'minifix', 'dowel']) {
  const variants = [{ name: 'hinged', keep: {} }];
  if (type === 'wardrobe') variants.push({ name: 'sliding', keep: { doorType: 'sliding' } });
  for (const v of variants) {
    it(`${type} · ${joint} · ${v.name}`, () => {
      const P = makePreset(type, { joint, ...v.keep });
      expect(strip(buildSpec(P))).toMatchSnapshot();
    });
  }
}

const KITCHEN = [
  ['kbase', {}], ['kwall', {}], ['ktall', {}], ['kcorner', {}], ['kfill', {}],
  ['kbase', { appliance: 'oven' }], ['kbase', { appliance: 'dishwasher' }], ['ktall', { appliance: 'fridge' }], ['kwall', { appliance: 'hood' }],
  ['kcorner', { cornerKit: 'carousel' }], ['kcorner', { cornerKit: 'magic' }],
];
for (const [type, keep] of KITCHEN) {
  it(`${type} · ${JSON.stringify(keep)}`, () => {
    const P = makePreset(type, keep);
    expect(strip(buildSpec(normalize(P)))).toMatchSnapshot();
  });
}
