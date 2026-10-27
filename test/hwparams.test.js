import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { resolveHw } from '../web/fittings.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';
import { defaultHw, mergeParams } from '../web/hwparams.js';

const clone = o => JSON.parse(JSON.stringify(o));
const errs = (spec, P, hw) => [...new Set(checkBuild(spec, P, { hw }).filter(f => f.level === 'error').map(f => `${f.code}: ${f.text}`))];
const withParams = (id, params) => { const c = clone(DEFAULT_CATALOG); c.fittings.find(f => f.id === id).params = params; return c; };

describe('параметры моделей', () => {
  it('без правок resolveHw даёт значения по умолчанию', () => {
    const P = makePreset('wardrobe');
    expect(resolveHw(DEFAULT_CATALOG, P)).toEqual(defaultHw(P));
  });
  it('mergeParams берёт только известные поля, числа и список длин', () => {
    const d = defaultHw({ slide: 'ball' });
    const s = mergeParams(d.slide, { gap: '30', lens: '300, 400,abc,500', rail: 'x', name: 'x', foo: 1, tr: '' }, 'slide');
    expect(s.gap).toBe(30); expect(s.lens).toEqual([300, 400, 500]); expect(s.rail).toBe('three'); expect(s.name).toBe('шариковые'); expect(s.tr).toBe(0.75);
  });
  it('петля: центр чашки и отступ планки из модели меняют присадку, ошибок нет', () => {
    const P = makePreset('wardrobe'), hw = resolveHw(withParams('hinge-soft', { cupEdge: 22.5, plateSetback: 45 }), P);
    const spec = buildSpec(P, { hw }), door = spec.parts.find(p => p.name === 'Фасад двери');
    const cup = door.holes.find(h => h.note === 'чашка петли');
    expect(Math.min(cup.u, door.L - cup.u)).toBe(22.5);
    expect(spec.parts.flatMap(p => p.holes).filter(h => h.note === 'планка петли').length).toBeGreaterThan(0);
    expect(errs(spec, P, hw)).toEqual([]);
    // с параметрами по умолчанию та же проверка видит расхождение
    expect(errs(spec, P).join('\n')).toMatch(/hinge-cup|hinge-plate/);
  });
  it('направляющие: список длин и зазор из модели', () => {
    const P = makePreset('dresser'), hw = resolveHw(withParams('slide-ball', { lens: '300,400', gap: 30 }), P);
    const spec = buildSpec(P, { hw }), side = spec.parts.find(p => p.name === 'Боковина ящика');
    expect([300, 400]).toContain(side.W);
    expect(errs(spec, P, hw)).toEqual([]);
    const def = buildSpec(P), bk = p => spec.parts.find(x => x.name === 'Задняя стенка ящика').L - def.parts.find(x => x.name === 'Задняя стенка ящика').L;
    expect(bk()).toBe(-4); // зазор 30 вместо 26: короб уже на 4 мм
  });
  it('полкодержатели: отступ и шаг из модели', () => {
    const P = makePreset('rack'), hw = resolveHw(withParams('pin', { offset: 50, pitch: 64 }), P);
    const spec = buildSpec(P, { hw }), pins = spec.parts.flatMap(p => p.holes).filter(h => h.note === 'полкодержатель');
    expect(pins.length).toBeGreaterThan(0);
    expect(errs(spec, P, hw)).toEqual([]);
  });
});

describe('фасады и стекло в проверке', () => {
  it('узкий рамочный фасад — ошибка', () => {
    const P = makePreset('wardrobe'); P.sections[0].width = 300; P.sections[0].door = 'double'; P.sections[0].frontStyle = 'shaker';
    expect(errs(buildSpec(P), P).join('\n')).toMatch(/frame/);
  });
  it('зазор между фасадами: тесно — ошибка, широко — замечание', () => {
    const P = makePreset('wardrobe'); P.sections = [P.sections[1]]; P.sections[0].door = 'double';
    const spec = buildSpec(P), [a, b] = spec.parts.filter(p => p.name === 'Фасад двери');
    const gap = Math.abs(a.c[0] - b.c[0]) - a.L;
    expect(gap).toBeCloseTo(3, 1);
    b.c[0] -= 2.5; // зазор 0,5 мм
    expect(errs(spec, P).join('\n')).toMatch(/front-gap/);
    b.c[0] += 2.5 + 4; // зазор 7 мм
    const w = checkBuild(spec, P).find(f => f.code === 'front-gap');
    expect(w && w.level).toBe('warn');
  });
  it('тяжёлая зеркальная дверь: замечание, а при слабых петлях — ошибка', () => {
    const P = makePreset('wardrobe'); P.sections = [P.sections[1]]; P.sections[0].door = 'left'; P.sections[0].width = 800; P.sections[0].frontStyle = 'mirror';
    const spec = buildSpec(P), hw = defaultHw(P);
    hw.hinge.loadKg = 6; // 4 петли = 24 кг; дверь около 31 кг
    expect(checkBuild(spec, P, { hw }).find(f => f.code === 'door-weight').level).toBe('warn');
    hw.hinge.loadKg = 3;
    expect(errs(spec, P, hw).join('\n')).toMatch(/door-weight/);
  });
  it('купе: слишком тяжёлое полотно — замечание', () => {
    const P = makePreset('wardrobe', { doorType: 'sliding', slidingStyle: 'mirror' }), spec = buildSpec(P), hw = defaultHw(P);
    hw.kupe.loadKg = 5;
    expect(checkBuild(spec, P, { hw }).some(f => f.code === 'kupe-weight')).toBe(true);
  });
  it('стеклянная полка с пролётом больше 600 мм', () => {
    const P = makePreset('rack'); P.sections[0].items = [{ type: 'glass', y: 300 }];
    expect(checkBuild(buildSpec(P), P).some(f => f.code === 'sag' && /стекло/.test(f.text))).toBe(false); // 600 мм: на границе
    P.sections[0].width = 800;
    expect(checkBuild(buildSpec(P), P).some(f => f.code === 'sag' && /стекло/.test(f.text))).toBe(true);
  });
  it('широкий ящик на роликовых направляющих', () => {
    const P = makePreset('dresser', { slide: 'roller' }); P.sections[0].width = 1000;
    expect(checkBuild(buildSpec(P), P).some(f => f.code === 'drawer-load')).toBe(true);
  });
});
