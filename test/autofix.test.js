import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild, panelIssues } from '../web/check.js';
import { autoFix, kinProblems } from '../web/autofix.js';
import { randomProject } from './helpers.js';

const issues = P => panelIssues(checkBuild(buildSpec(P), P, { skipKin: true }));

describe('автоисправление замечаний проверки', () => {
  it('нет крепления к стене → включается', () => {
    const P = makePreset('wardrobe', { wallFix: false });
    expect(issues(P).some(f => f.code === 'tip')).toBe(true);
    const r = autoFix(P);
    expect(P.wallFix).toBe(true);
    expect(r.log.join(' ')).toMatch(/стене/);
    expect(issues(P)).toEqual([]);
  });
  it('узкий рамочный фасад → гладкий', () => {
    const P = makePreset('wardrobe'); P.sections[0].width = 300; P.sections[0].door = 'double'; P.sections[0].frontStyle = 'shaker';
    expect(issues(P).some(f => f.code === 'frame')).toBe(true);
    autoFix(P);
    expect(P.sections[0].frontStyle).toBe('flat');
    expect(issues(P).some(f => f.code === 'frame')).toBe(false);
  });
  it('петли 165° упираются в соседей → 110°', () => {
    const P = makePreset('wardrobe', { hinge: 'wide' });
    expect(kinProblems(buildSpec(P)).length).toBeGreaterThan(0);
    const r = autoFix(P);
    expect(P.hinge).toBe('soft');
    expect(kinProblems(buildSpec(P))).toEqual([]);
    expect(r.log.join(' ')).toMatch(/110°/);
  });
  it('тяжёлая широкая зеркальная дверь → две створки или гладкий фасад', () => {
    const P = makePreset('wardrobe'); P.sections = [P.sections[1]]; P.sections[0].width = 1000; P.sections[0].door = 'left'; P.sections[0].frontStyle = 'mirror';
    expect(issues(P).some(f => f.code === 'wide-door' || f.code === 'door-weight')).toBe(true);
    autoFix(P);
    expect(issues(P).filter(f => f.code === 'wide-door' || f.code === 'door-weight')).toEqual([]);
  });
  it('стеклянная полка с большим пролётом → ЛДСП', () => {
    const P = makePreset('rack', { wallFix: true }); P.sections[0].width = 800; P.sections[0].items = [{ type: 'glass', y: 300 }];
    expect(issues(P).some(f => f.code === 'sag')).toBe(true);
    autoFix(P);
    expect(P.sections[0].items.some(i => i.type === 'glass')).toBe(false);
    expect(issues(P).some(f => f.code === 'sag')).toBe(false);
  });
  it('автоисправление не ухудшает случайные проекты', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const P = randomProject(seed), n = s => buildSpec(P).warnings.length + kinProblems(buildSpec(P)).length + issues(P).length;
      const before = n();
      autoFix(P);
      expect(n(), `seed ${seed}`).toBeLessThanOrEqual(before);
    }
  });
});
