import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { defaultHw, HW_DEFAULTS } from '../web/hwparams.js';
import { unverifiedList, unverifiedProject } from '../web/verify.js';
import { addModule } from '../web/project.js';

const dresser = slide => { const P = makePreset('dresser'); P.slide = slide; return normalize(P); };
const ids = P => unverifiedList(P).map(u => u.id);

describe('направляющие по подтверждённым данным', () => {
  it('зазоры: шариковые 26, MOVENTO и Quadro 42, TANDEM 49; ряд длин шариковых до 600', () => {
    expect(HW_DEFAULTS.slide.ball.gap).toBe(26); expect(HW_DEFAULTS.slide.hidden.gap).toBe(42);
    expect(HW_DEFAULTS.slide.quadro.gap).toBe(42); expect(HW_DEFAULTS.slide.tandem.gap).toBe(49);
    expect(Math.max(...HW_DEFAULTS.slide.ball.lens)).toBe(600); expect(Math.min(...HW_DEFAULTS.slide.ball.lens)).toBe(250);
  });
  it('любой тип собирается без ошибок проверки, зазор короба в проверке равен зазору типа', () => {
    for (const slide of ['ball', 'ballSoft', 'hidden', 'tandem', 'quadro', 'roller']) {
      const P = dresser(slide), sp = buildSpec(P);
      expect(P.slide).toBe(slide);
      expect(sp.warnings, slide).toEqual([]);
      expect(checkBuild(sp, P, { skipKin: true }).filter(f => f.level === 'error'), slide).toEqual([]);
      expect(defaultHw(P).slide.gap).toBe(HW_DEFAULTS.slide[slide].gap);
    }
  });
  it('короб на TANDEM уже, чем на MOVENTO, на 7 мм', () => {
    const w = slide => { const sp = buildSpec(dresser(slide)), d = sp.parts.find(p => p.name === 'Дно ящика'); return d.L; };
    expect(w('hidden') - w('tandem')).toBeCloseTo(7, 3);
    expect(w('ball') - w('hidden')).toBeCloseTo(16, 3);
  });
  it('неизвестный тип сбрасывается на шариковые', () => { const P = makePreset('dresser'); P.slide = 'x'; normalize(P); expect(P.slide).toBe('ball'); });
});

describe('список непроверенного', () => {
  it('стеллаж без дверей, ящиков и штанг: допущений нет', () => { expect(unverifiedList(makePreset('rack'))).toEqual([]); });
  it('ящики: отверстия и нагрузка всегда, доводчик и ролики по типу', () => {
    expect(ids(dresser('ball'))).toEqual(expect.arrayContaining(['slide.holes', 'slide.load']));
    expect(ids(dresser('ball'))).not.toContain('slide.soft');
    expect(ids(dresser('ballSoft'))).toContain('slide.soft'); expect(ids(dresser('roller'))).toContain('slide.roller');
    for (const s of ['hidden', 'tandem', 'quadro']) expect(ids(dresser(s))).toContain('slide.lens');
  });
  it('двери, откидные фасады, купе, аксессуары, штанги — каждый свою строку', () => {
    const w = makePreset('wardrobe'); expect(ids(w)).toEqual(expect.arrayContaining(['hinge.count', 'hinge.offset', 'hinge.load', 'hinge.half', 'rod', 'warp']));
    const k = makePreset('kwall'); k.sections[0].door = 'flapUp'; normalize(k); expect(ids(k)).toEqual(expect.arrayContaining(['hinge.flap', 'lift.calc']));
    const s = makePreset('wardrobe'); s.doorType = 'sliding'; normalize(s); expect(ids(s)).toContain('kupe'); expect(ids(s)).not.toContain('hinge.count');
    const a = makePreset('wardrobe'); a.sections[0].acc = ['pantograph']; normalize(a); expect(ids(a)).toContain('acc');
  });
  it('у проекта из модулей строки не повторяются, а перечисляют модули', () => {
    const r = makePreset('dresser'); addModule(r, makePreset('dresser'), { name: 'Второй' }); normalize(r);
    const list = unverifiedProject(r, ['Первый', 'Второй']), h = list.find(u => u.id === 'slide.holes');
    expect(h.modules).toEqual(['Первый', 'Второй']); expect(new Set(list.map(u => u.id)).size).toBe(list.length);
  });
});
