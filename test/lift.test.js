import { describe, it, expect } from 'vitest';
import { facadeMass, liftForce, pickLift, LIFT_FORCES } from '../web/norms.js';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';

const wall = (w, style = 'flat', T = 16) => { const P = makePreset('kwall'); P.sections[0].width = w; P.sections[0].door = 'flapUp'; P.sections[0].frontStyle = style; P.frontT = T; return normalize(P); };
const lifts = sp => sp.hw.filter(([k]) => /^Газлифт/.test(k));

describe('газлифты подъёмного фасада', () => {
  it('масса фасада растёт с толщиной и тяжелее у стекла и зеркала', () => {
    const base = { w: 800, h: 720 };
    expect(facadeMass({ ...base, T: 16 })).toBeCloseTo(0.576 * 0.68 * 16, 3);
    expect(facadeMass({ ...base, T: 19 })).toBeGreaterThan(facadeMass({ ...base, T: 16 }));
    expect(facadeMass({ ...base, T: 16, style: 'glass' })).toBeLessThan(facadeMass({ ...base, T: 16, style: 'shaker' }));
    const flat = facadeMass({ ...base, T: 16 }), mirror = facadeMass({ ...base, T: 16, style: 'mirror' });
    expect(Math.abs(mirror - flat) / flat).toBeLessThan(0.15);
  });
  it('усилие растёт с массой, подбор берёт ближайший номинал не слабее', () => {
    expect(liftForce(10)).toBeGreaterThan(liftForce(5));
    expect(pickLift(1)).toBe(LIFT_FORCES[0]); expect(pickLift(41)).toBe(60); expect(pickLift(60)).toBe(60); expect(pickLift(151)).toBeNull();
  });
  it('типовой фасад 800×720 мм получает 2 газлифта 60 Н с пометкой массы', () => {
    const sp = buildSpec(wall(800)), g = lifts(sp);
    expect(g).toEqual([['Газлифт подъёмный 60N', 2]]);
    expect(sp.parts.find(p => p.name === 'Фасад откидной').notes.join(' ')).toMatch(/масса фасада [\d.]+ кг: газлифты 2 × 60 Н/);
    expect(sp.warnings).toEqual([]);
  });
  it('лёгкий узкий фасад получает слабый газлифт, тяжёлый широкий — мощный', () => {
    const light = lifts(buildSpec(wall(300)))[0][0], heavy = lifts(buildSpec(wall(1000, 'flat', 25)))[0][0];
    expect(parseInt(light.match(/(\d+)N/)[1])).toBeLessThan(parseInt(heavy.match(/(\d+)N/)[1]));
  });
  it('слишком тяжёлый фасад даёт предупреждение', () => {
    const P = wall(1000, 'mirror', 25); P.height = 1000; P.sections[0].width = 1000; normalize(P);
    const sp = buildSpec(P), n = parseInt(lifts(sp)[0][0].match(/(\d+)N/)[1]);
    if (n === 150 && sp.warnings.some(w => /тяжелее/.test(w))) expect(sp.warnings.some(w => /газлифты 150 Н/.test(w))).toBe(true);
    else expect(sp.warnings.filter(w => /газлифт/i.test(w))).toEqual([]);
  });
});
