import { describe, it, expect } from 'vitest';
import * as THREE from '../web/vendor/three/build/three.module.js';
import { makePreset, normalizeCutouts } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { groupParts, toCSV, toDXF } from '../web/export.js';
import { orientLines, machiningRows } from '../web/partinfo.js';
import { resolveHw } from '../web/fittings.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';
import { build3D } from '../web/build3d.js';

const errs = (spec, P, hw) => [...new Set(checkBuild(spec, P, { hw }).filter(f => f.level === 'error').map(f => `${f.code}: ${f.text}`))];
const dxf = spec => Buffer.from(toDXF(spec)).toString('latin1');
const withCut = (P, ...c) => { P.cutouts = normalizeCutouts(c); return P; };
const hole = o => ({ part: 'Задняя стенка', kind: 'hole', w: 60, h: 40, r: 8, u: 400, v: 300, ...o });

describe('вырезы', () => {
  it('нормализация: границы, радиус, мусор', () => {
    const l = normalizeCutouts([{ part: 'Дно', w: 1, h: 99999, r: 500, u: 'x', kind: 'q', corner: 'zz' }, null, 5]);
    expect(l.length).toBe(1);
    expect(l[0]).toMatchObject({ part: 'Дно', kind: 'hole', w: 5, h: 3000, u: 0, corner: 'w1d1' });
    expect(l[0].r).toBeLessThanOrEqual(2.5);
    expect(normalizeCutouts(undefined)).toEqual([]);
    expect(normalizeCutouts(new Array(40).fill({})).length).toBe(20);
  });
  it('вырез ложится на деталь в её координатах', () => {
    const P = withCut(makePreset('wardrobe'), hole()), spec = buildSpec(P), back = spec.parts.find(p => p.name === 'Задняя стенка');
    expect(back.cutouts).toEqual([{ kind: 'hole', u0: 370, v0: 280, u1: 430, v1: 320, r: 8 }]);
    expect(spec.warnings).toEqual([]);
    expect(errs(spec, P)).toEqual([]);
  });
  it('выемка в углу: координаты от нужного угла', () => {
    const P = withCut(makePreset('wardrobe'), { part: 'Задняя стенка', kind: 'notch', w: 100, h: 50, r: 5, corner: 'w2d2' }), spec = buildSpec(P), b = spec.parts.find(p => p.name === 'Задняя стенка');
    expect(b.cutouts[0]).toMatchObject({ kind: 'notch', u1: b.L, v1: b.W, corner: 'w2d2' });
    expect(Math.round(b.cutouts[0].u1 - b.cutouts[0].u0)).toBe(100);
    expect(errs(spec, P)).toEqual([]);
  });
  it('нет такой детали → предупреждение расчёта', () => {
    const spec = buildSpec(withCut(makePreset('wardrobe'), hole({ part: 'Нет такой' })));
    expect(spec.warnings.join('\n')).toMatch(/не найдена/);
  });
  it('секция ограничивает вырез', () => {
    const P = withCut(makePreset('rack'), hole({ part: 'Полка съёмная', sec: 1, u: 300, v: 150 })), spec = buildSpec(P);
    const sh = spec.parts.filter(p => p.name === 'Полка съёмная');
    expect(sh.filter(p => p.cutouts).every(p => p.sec === 1)).toBe(true);
    expect(sh.some(p => p.sec !== 1 && !p.cutouts)).toBe(true);
    // одинаковые полки с вырезом и без не сливаются в одну позицию спецификации
    const g = groupParts(spec).filter(x => x.name === 'Полка съёмная');
    expect(g.some(x => x.cutouts) && g.some(x => !x.cutouts)).toBe(true);
  });
  it('проверка: слишком близко к краю, съеденная деталь, пересечение, присадка', () => {
    const run = c => { const P = withCut(makePreset('wardrobe'), ...c); return errs(buildSpec(P), P).join('\n'); };
    expect(run([hole({ u: 20, v: 300 })])).toMatch(/cutout/);
    expect(run([{ part: 'Задняя стенка', kind: 'notch', w: 5000, h: 40, corner: 'w1d1' }])).toMatch(/cutout/);
    expect(run([hole(), hole({ u: 410 })])).toMatch(/пересекаются/);
    // вырез поверх конфирматов боковины
    const P = makePreset('wardrobe'), spec = buildSpec(P), side = spec.parts.find(p => p.name === 'Боковина левая'), h0 = side.holes.find(h => h.note === 'конфирмат');
    const P2 = withCut(makePreset('wardrobe'), { part: 'Боковина левая', kind: 'hole', w: 40, h: 40, r: 0, u: h0.u, v: h0.v });
    expect(errs(buildSpec(P2), P2).join('\n')).toMatch(/задевает отверстие/);
  });
  it('DXF, CSV и таблица обработки содержат вырезы', () => {
    const P = withCut(makePreset('wardrobe'), hole(), { part: 'Задняя стенка', kind: 'notch', w: 100, h: 50, r: 6, corner: 'w2d1' }), spec = buildSpec(P);
    const d = dxf(spec);
    expect(d).toMatch(/VYREZ/); expect(d).toMatch(/\nPOLYLINE\r?\n/); expect(d).toMatch(/\r?\n42\r?\n-?0\.\d+/);
    expect(toCSV(spec, 'т')).toMatch(/Фрезеровка и вырезы/);
    const rows = machiningRows(groupParts(spec).find(g => g.name === 'Задняя стенка'));
    expect(rows.map(r => r.title)).toEqual(['Вырез', 'Выемка в углу']);
    expect(d).not.toMatch(/NaN|undefined/);
  });
  it('3D: деталь с вырезами строится как выдавленный контур, без NaN', () => {
    const P = withCut(makePreset('wardrobe'), hole(), { part: 'Задняя стенка', kind: 'notch', w: 100, h: 50, r: 6, corner: 'w1d2' }), spec = buildSpec(P);
    const root = build3D(THREE, spec, P), mesh = root.children.find(m => /zadnyaya_stenka/.test(m.name));
    expect(mesh).toBeTruthy();
    expect(mesh.geometry.type).toBe('ExtrudeGeometry');
    const pos = mesh.geometry.attributes.position.array;
    expect([...pos].every(Number.isFinite)).toBe(true);
    mesh.geometry.computeBoundingBox();
    const b = mesh.geometry.boundingBox, back = spec.parts.find(p => p.name === 'Задняя стенка');
    expect(Math.round((b.max.x - b.min.x) * 1000)).toBe(Math.round(back.L)); // xy: длина вдоль x
    expect(Math.round((b.max.y - b.min.y) * 1000)).toBe(Math.round(back.W));
  });
});

describe('фрезеровка фасадов', () => {
  const door = (style, w = 524) => { const P = makePreset('wardrobe'); P.sections[0].frontStyle = style; P.sections[0].width = w; return P; };
  it('по умолчанию окно и четверть как раньше (рамка 70, стекло меньше фасада на 130)', () => {
    const spec = buildSpec(door('glass')), d = spec.parts.find(p => p.name === 'Фасад двери'), g = spec.parts.find(p => p.name === 'Стекло фасада');
    expect(d.mill).toMatchObject({ kind: 'glass', frameW: 70 });
    expect(d.mill.window).toEqual([d.L - 140, d.W - 140]);
    expect(g.L).toBe(d.L - 130); expect(g.W).toBe(d.W - 130);
    expect(d.notes.join(' ')).toMatch(/рамка 70 мм/);
  });
  it('рамка из справочника меняет окно, стекло, примечание и ничего не ломает', () => {
    const cat = JSON.parse(JSON.stringify(DEFAULT_CATALOG)); cat.milling.frameW = 90; cat.milling.glassChamfer = 1; cat.milling.glassCornerR = 4;
    const P = door('glass'), hw = resolveHw(cat, P), spec = buildSpec(P, { hw }), d = spec.parts.find(p => p.name === 'Фасад двери'), g = spec.parts.find(p => p.name === 'Стекло фасада');
    expect(d.mill.window).toEqual([d.L - 180, d.W - 180]);
    expect(g.L).toBe(d.L - 2 * (90 - 5));
    expect(g.notes.join(' ')).toMatch(/фаска 1×45°.*углы R4/);
    expect(errs(spec, P, hw)).toEqual([]);
    const rows = machiningRows(groupParts(spec).find(x => x.name === 'Фасад двери'));
    expect(rows.map(r => r.title)).toEqual(['Окно под стекло, насквозь', 'Четверть под стекло']);
  });
  it('рамочный фасад: утопление и слой DXF', () => {
    const spec = buildSpec(door('shaker')), d = spec.parts.find(p => p.name === 'Фасад двери');
    expect(d.mill).toMatchObject({ kind: 'shaker', depth: 8, face: 'A' });
    expect(dxf(spec)).toMatch(/FREZA_RAMKA_8/);
  });
  it('широкая рамка на узкой двери — ошибка', () => {
    const cat = JSON.parse(JSON.stringify(DEFAULT_CATALOG)); cat.milling.frameW = 110;
    const P = door('shaker', 300); P.sections[0].door = 'double'; cat.milling.frameW = 100; const hw = resolveHw(cat, P), spec = buildSpec(P, { hw }); // створка 156 мм, окно отрицательное
    expect(errs(spec, P, hw).join('\n')).toMatch(/frame/);
  });
});

describe('положение детали и ручки-профиля', () => {
  it('петли слева или справа, у откидного — внизу', () => {
    const P = makePreset('wardrobe'), spec = buildSpec(P), G = groupParts(spec);
    const left = G.find(g => g.name === 'Фасад двери' && g.secLabel === '1'), right = G.find(g => g.name === 'Фасад двери' && g.secLabel === '3');
    expect(orientLines(left).join(' ')).toMatch(/Петли слева/);
    expect(orientLines(right).join(' ')).toMatch(/Петли справа/);
    const t = makePreset('tv'); t.sections[0].door = 'flapDown'; t.sections[0].width = 700;
    const fl = groupParts(buildSpec(t)).find(g => g.name === 'Фасад откидной');
    expect(orientLines(fl).join(' ')).toMatch(/Д1 \(внизу\)/);
  });
  it('у каждой детали описаны стороны и пласти', () => {
    for (const g of groupParts(buildSpec(makePreset('wardrobe')))) expect(orientLines(g)[0]).toMatch(/Ш1 — .*Д1 — .*Пласть A/);
  });
  it('ручка-профиль: два отверстия под саморезы и координаты в примечании', () => {
    const spec = buildSpec(makePreset('tv')), f = spec.parts.find(p => p.holes.some(h => h.note === 'ручка-профиль: саморез'));
    expect(f).toBeTruthy();
    const sc = f.holes.filter(h => h.note === 'ручка-профиль: саморез');
    expect(sc.length).toBe(2); expect(sc.every(h => h.f === 'B' && h.d === 3)).toBe(true);
    expect(f.notes.join(' ')).toMatch(/ручка-профиль \d+ мм: центр [\d,]+\/[\d,]+ мм/);
  });
});
