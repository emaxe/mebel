import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { screwLayers, warpLimit, hangerDepth, HANGER_MIN_DEPTH } from '../web/norms.js';

const chk = (P, code) => checkBuild(buildSpec(P), P, { skipKin: true }).filter(f => f.code === code);

describe('длина саморезов', () => {
  it('назначение определяет толщину слоёв, неизвестное пропускается', () => {
    const P = makePreset('wardrobe');
    expect(screwLayers('планка петли', P)).toEqual([18]); expect(screwLayers('карниз', P)).toEqual([18, 18]); expect(screwLayers('что-то', P)).toBeNull();
  });
  it('типовые изделия без замечаний: 3,5×16 в плиту 16 и 18 мм проходят', () => {
    for (const th of [16, 18, 22]) { const P = makePreset('wardrobe', { thickness: th }); expect(chk(P, 'screw-len'), String(th)).toEqual([]); }
  });
  it('сработка: слишком длинный саморез против тонкого слоя', () => {
    const P = makePreset('wardrobe'), sp = buildSpec(P);
    sp.hw.push(['Саморез 4×30 (планка петли)', 4]);
    const w = checkBuild(sp, P, { skipKin: true }).filter(f => f.code === 'screw-len');
    expect(w.length).toBe(1); expect(w[0].text).toMatch(/длиннее, чем толщина 18 мм/);
  });
});

describe('коробление высоких фасадов', () => {
  it('предел зависит от материала', () => { expect(warpLimit('ЛДСП Белый')).toBe(150); expect(warpLimit('МДФ Дуб, рамка')).toBe(190); });
  it('типовой шкаф без замечания, очень высокая дверь из ЛДСП 16 мм — с замечанием', () => {
    expect(chk(makePreset('wardrobe'), 'warp')).toEqual([]);
    const P = makePreset('wardrobe', { frontT: 16 }); P.height = 2800; P.sections[0].door = 'left'; normalize(P);
    const w = chk(P, 'warp'); expect(w.length).toBe(1); expect(w[0].text).toMatch(/возможно коробление/);
  });
  it('толстый фасад и рамка из МДФ допускают большую высоту', () => {
    const P = makePreset('wardrobe', { frontT: 22 }); P.height = 2800; P.sections[0].door = 'left'; normalize(P);
    expect(chk(P, 'warp')).toEqual([]);
  });
});

describe('глубина под плечики', () => {
  it('считается от глубины корпуса, задней стенки и дверей', () => {
    const P = makePreset('wardrobe'); P.backType = 'groove';
    expect(hangerDepth(P)).toBe(P.depth - 20 - (P.frontT + 3));
    P.backType = 'none'; P.sections.forEach(s => { s.door = 'none'; });
    expect(hangerDepth(P)).toBe(P.depth);
  });
  it('шкаф глубиной 600 со штангой без замечания, глубиной 450 — с замечанием по секциям со штангой', () => {
    expect(chk(makePreset('wardrobe'), 'hanger-depth')).toEqual([]);
    const P = makePreset('wardrobe'); P.depth = 450; normalize(P);
    const w = chk(P, 'hanger-depth'); expect(w.length).toBe(P.sections.filter(s => s.items.some(i => i.type === 'rod')).length);
    expect(w[0].text).toContain(String(HANGER_MIN_DEPTH));
  });
  it('без штанг замечаний нет', () => { const P = makePreset('rack'); P.depth = 250; normalize(P); expect(chk(P, 'hanger-depth')).toEqual([]); });
});

import { rodDeflection, maxRodSpan, DEFAULT_ROD_LOAD } from '../web/norms.js';
describe('прогиб штанги', () => {
  it('формула балки: прогиб растёт с четвёртой степенью пролёта и линейно с нагрузкой', () => {
    const a = rodDeflection({ L: 1000 }), b = rodDeflection({ L: 2000 });
    expect(b / a).toBeCloseTo(16, 6);
    expect(rodDeflection({ L: 1000, load: 40 }) / rodDeflection({ L: 1000, load: 20 })).toBeCloseTo(2, 6);
    expect(a).toBeGreaterThan(0.5); expect(a).toBeLessThan(5);
  });
  it('предельный пролёт даёт прогиб ровно пролёт/250', () => {
    const L = maxRodSpan(DEFAULT_ROD_LOAD); expect(rodDeflection({ L })).toBeCloseTo(L / 250, 6);
    expect(maxRodSpan(40)).toBeLessThan(maxRodSpan(10));
  });
  it('штанга в узкой секции без замечания, в широкой при большой нагрузке — с замечанием', () => {
    const P = makePreset('wardrobe'); expect(chk(P, 'rod-sag')).toEqual([]);
    const Q = makePreset('wardrobe'); Q.rodLoad = 60; Q.sections[1].width = 1200; normalize(Q);
    const w = chk(Q, 'rod-sag'); expect(w.length).toBeGreaterThan(0); expect(w[0].text).toMatch(/прогнётся на [\d,]+ мм/);
  });
  it('нагрузка нормализуется', () => { const P = makePreset('wardrobe'); P.rodLoad = 999; normalize(P); expect(P.rodLoad).toBe(60); P.rodLoad = 'x'; normalize(P); expect(P.rodLoad).toBe(20); });
});
