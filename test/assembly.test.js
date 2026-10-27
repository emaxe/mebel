import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec, STAGES } from '../web/model.js';
import { groupParts, partKey } from '../web/export.js';
import { assemblySteps } from '../web/assembly.js';
import { axoView } from '../web/axo.js';
import { randomProject } from './helpers.js';

const make = P => { const spec = buildSpec(P), G = groupParts(spec); return { spec, G, steps: assemblySteps(spec, G, P) }; };

describe('инструкция по сборке', () => {
  const cases = [['wardrobe', {}], ['wardrobe', { doorType: 'sliding' }], ['wardrobe', { joint: 'minifix', wallFix: true }], ['dresser', {}], ['tv', {}], ['rack', { joint: 'dowel' }], ['nightstand', {}]];
  for (const [type, keep] of cases) {
    it(`${type} ${JSON.stringify(keep)}: каждая деталь в одном шаге, вся фурнитура распределена`, () => {
      const P = makePreset(type, keep), { spec, G, steps } = make(P);
      // детали: суммарно столько же, сколько в спецификации, у каждого номера — в своём этапе
      const total = steps.reduce((a, s) => a + s.parts.reduce((b, x) => b + x.qty, 0), 0);
      expect(total).toBe(spec.parts.length);
      const seen = new Map();
      for (const s of steps) for (const x of s.parts) { expect(seen.has(`${x.no}|${s.stage}`)).toBe(false); seen.set(`${x.no}|${s.stage}`, 1); }
      // фурнитура: суммы совпадают
      const hwSteps = steps.reduce((a, s) => a + s.hw.reduce((b, x) => b + x.qty, 0), 0);
      expect(hwSteps).toBe(spec.hw.reduce((a, [, q]) => a + q, 0));
      // этапы идут в порядке STAGES, номера 1..N
      expect(steps.map(s => STAGES.indexOf(s.stage))).toEqual([...steps.map(s => STAGES.indexOf(s.stage))].sort((a, b) => a - b));
      expect(steps.map(s => s.no)).toEqual(steps.map((_, i) => i + 1));
      for (const s of steps) { expect(s.text.length, s.stage).toBeGreaterThan(0); expect(s.text.join(' ')).not.toMatch(/undefined|NaN/); }
      void G;
    });
  }

  it('номера деталей в шагах совпадают со спецификацией', () => {
    const P = makePreset('wardrobe'), { spec, G, steps } = make(P);
    for (const s of steps) for (const ref of s.partRefs) expect(G.find(g => partKey(g) === partKey(ref)).no).toBeDefined();
  });

  it('порядок: задняя стенка в паз — до крышки, перегородки — до полок', () => {
    const { steps } = make(makePreset('wardrobe'));
    const ix = k => steps.findIndex(s => s.stage === k);
    expect(ix('back')).toBeGreaterThan(-1);
    expect(ix('back')).toBeLessThan(ix('top'));
    expect(ix('dividers')).toBeLessThan(ix('shelves'));
    expect(ix('carcass')).toBeLessThan(ix('dividers'));
  });

  it('случайные проекты: инструкция строится, схемы не пустые', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const P = randomProject(seed), { spec, G, steps } = make(P), numbers = new Map(spec.parts.map(p => [p, G.find(g => partKey(g) === partKey(p)).no]));
      const done = new Set();
      for (const s of steps) {
        done.add(s.stage);
        const svg = axoView(spec, { shown: new Set(done), highlight: s.stage, numbers });
        expect(svg.startsWith('<svg')).toBe(true);
        expect(svg).not.toMatch(/NaN|undefined/);
        if (s.parts.length) expect(svg).toContain('<polygon');
      }
    }
  });
});
