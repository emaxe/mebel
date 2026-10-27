import { describe, it, expect } from 'vitest';
import { makePreset, normalize, TYPE_RULES, innerH } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { groupParts, nest } from '../web/export.js';

const KITCHEN = ['kbase', 'kwall', 'ktall'];
const errors = P => checkBuild(buildSpec(P), P, { skipKin: true }).filter(f => f.level === 'error').map(f => f.text);

describe('кухонные модули', () => {
  for (const type of KITCHEN) {
    it(`${type}: пресет собирается без ошибок проверки и предупреждений ядра`, () => {
      const P = makePreset(type), spec = buildSpec(P);
      expect(errors(P)).toEqual([]);
      expect(spec.warnings).toEqual([]);
      expect(spec.parts.length).toBeGreaterThanOrEqual(8);
      expect(nest(groupParts(spec)).over).toEqual([]);
    });
    it(`${type}: размеры в пределах правил, внутренняя высота положительна`, () => {
      const P = makePreset(type), R = TYPE_RULES[type];
      expect(P.height).toBeGreaterThanOrEqual(R.height[0]); expect(P.height).toBeLessThanOrEqual(R.height[1]);
      expect(P.depth).toBeGreaterThanOrEqual(R.depth[0]); expect(innerH(P)).toBeGreaterThan(150);
    });
  }
  it('нижний модуль: две царги вместо крышки, ширина и положение по правилам', () => {
    const P = makePreset('kbase'), spec = buildSpec(P), names = spec.parts.map(p => p.name);
    expect(names).not.toContain('Крышка');
    const rear = spec.parts.find(p => p.name === 'Царга задняя'), front = spec.parts.find(p => p.name === 'Царга передняя');
    expect(rear.W).toBe(P.railW); expect(front.W).toBe(P.railW);
    expect(rear.L).toBeCloseTo(spec.meta.W - 2 * P.thickness, 6);
    const Dc = P.backType === 'overlay' ? spec.meta.D - 4 : spec.meta.D;
    expect(front.c[2] - rear.c[2]).toBeCloseTo(Dc - P.railW, 6);
    expect(rear.c[1]).toBeCloseTo(P.height - P.thickness / 2, 6);
  });
  it('царги соединены с боковинами и перегородками парными отверстиями', () => {
    const P = makePreset('kbase');
    P.sections = [{ ...P.sections[0] }, { ...P.sections[0] }];
    normalize(P);
    const spec = buildSpec(P);
    expect(errors(P)).toEqual([]);
    for (const nm of ['Царга задняя', 'Царга передняя']) {
      const rail = spec.parts.find(p => p.name === nm);
      expect(rail.holes.filter(h => h.f === 'w1').length).toBeGreaterThan(0);
      expect(rail.holes.filter(h => h.f === 'w2').length).toBeGreaterThan(0);
      expect(rail.holes.filter(h => h.f === 'A').length).toBeGreaterThan(0);
    }
  });
  it('царги работают со всеми видами крепежа', () => {
    for (const joint of ['confirmat', 'minifix', 'dowel']) { const P = makePreset('kbase', { joint }); expect(errors(P), joint).toEqual([]); }
  });
  it('царги доступны только нижнему модулю, остальным заменяются крышкой', () => {
    for (const type of ['wardrobe', 'kwall', 'ktall', 'dresser']) { const P = makePreset(type); P.topType = 'rails'; normalize(P); expect(P.topType, type).not.toBe('rails'); }
    const P = makePreset('kbase'); P.topType = 'rails'; normalize(P); expect(P.topType).toBe('rails');
  });
  it('ширина царги ограничивается', () => {
    const P = makePreset('kbase'); P.railW = 5; normalize(P); expect(P.railW).toBe(60);
    P.railW = 999; normalize(P); expect(P.railW).toBe(200);
  });
  it('верхний модуль на навесах, без анкерных уголков', () => {
    const hw = Object.fromEntries(buildSpec(makePreset('kwall')).hw);
    expect(hw['Навес кухонный регулируемый (комплект)']).toBe(2);
    expect(Object.keys(hw).some(k => /^Анкерный уголок/.test(k))).toBe(false);
    const hw2 = Object.fromEntries(buildSpec(makePreset('kbase')).hw);
    expect(Object.keys(hw2).some(k => /^Анкерный уголок/.test(k))).toBe(true);
  });
  it('нижний модуль на ножках с двумя дверьми и полкой, верхний без основания', () => {
    const b = buildSpec(makePreset('kbase')), w = buildSpec(makePreset('kwall'));
    expect(b.extras.filter(e => e.name === 'Ножка').length).toBeGreaterThanOrEqual(4);
    expect(w.parts.some(p => /Цоколь/.test(p.name))).toBe(false);
    expect(b.parts.filter(p => p.name === 'Фасад двери').length).toBe(2);
  });
  it('подъёмный фасад у верхнего модуля и ящики у нижнего допустимы', () => {
    const w = makePreset('kwall'); w.sections[0].door = 'flapUp'; normalize(w);
    expect(w.sections[0].door).toBe('flapUp'); expect(errors(w)).toEqual([]);
    const k = makePreset('kbase', {}); k.sections[0].door = 'none'; k.sections[0].items = [{ type: 'drawer', y: 0, h: 200 }, { type: 'drawer', y: 200, h: 200 }, { type: 'drawer', y: 400, h: 200 }]; normalize(k);
    expect(errors(k)).toEqual([]);
  });
  it('в проекте нижний и верхний модули стоят вместе, верхний поднят', async () => {
    const { addModule, buildProject } = await import('../web/project.js');
    const r = makePreset('kbase'); addModule(r, makePreset('kwall'), { name: 'Верх', y: 1400 });
    const pr = buildProject(r);
    expect(pr.mods[1].y).toBe(1400);
    expect(pr.spec.meta.H).toBeGreaterThanOrEqual(1400 + pr.mods[1].H - 1e-6);
  });
});
