import { it, expect } from 'vitest';
import { buildSpec } from '../web/model.js';
import { randomProject } from './helpers.js';

const clash = spec => {
  const out = [];
  for (const p of spec.parts) {
    const hs = p.holes.filter(h => h.f === 'A' || h.f === 'B');
    for (let i = 0; i < hs.length; i++) for (let j = 0; j < hs.length; j++) {
      const a = hs[i], b = hs[j];
      if (i === j || a.h !== 'скв.' || a.d < 7) continue;
      if (b.h === 'скв.' && j < i) continue;
      if (Math.hypot(a.u - b.u, a.v - b.v) < (a.d + b.d) / 2 - 0.5) out.push(`${p.name}: ${a.note}(${a.f}) × ${b.note}(${b.f}) @${a.u},${a.v}`);
    }
  }
  return out;
};
it('сквозные отверстия не пересекаются с другими', () => {
  const all = new Map();
  for (let seed = 1; seed <= 60; seed++) for (const c of clash(buildSpec(randomProject(seed)))) all.set(c.replace(/@.*/, ''), (all.get(c.replace(/@.*/, '')) || 0) + 1);
  expect([...all.entries()]).toEqual([]);
});

it('проставки под направляющие не заходят на планки петель', () => {
  const bad = new Set();
  for (let seed = 1; seed <= 80; seed++) {
    const spec = buildSpec(randomProject(seed));
    for (const sp of spec.parts.filter(p => p.name === 'Проставка под направляющие')) {
      const z0 = sp.c[2] - sp.W / 2, z1 = sp.c[2] + sp.W / 2, y0 = sp.c[1] - sp.L / 2, y1 = sp.c[1] + sp.L / 2;
      for (const pl of spec.extras.filter(e => e.name === 'Планка петли' && e.sec === sp.sec)) {
        if (Math.abs(pl.c[0] - sp.c[0]) > sp.T + 3 || pl.c[1] < y0 - 21 || pl.c[1] > y1 + 21) continue;
        const pz0 = pl.c[2] - pl.s[2] / 2, pz1 = pl.c[2] + pl.s[2] / 2;
        if (Math.min(z1, pz1) - Math.max(z0, pz0) > 0.5) bad.add(`seed ${seed} sec ${sp.sec}`);
      }
    }
  }
  expect([...bad]).toEqual([]);
});
