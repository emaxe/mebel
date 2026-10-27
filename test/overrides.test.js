import { describe, it, expect } from 'vitest';
import * as THREE from '../web/vendor/three/build/three.module.js';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { build3D } from '../web/build3d.js';
import { groupParts, nest, edgeSummary } from '../web/export.js';
import { estimate } from '../web/estimate.js';
import { DEFAULT_CATALOG, sheetFor, isTextured } from '../web/catalog.js';

const clone = o => JSON.parse(JSON.stringify(o));
const withOv = (type, list) => { const P = makePreset(type); P.overrides = list; return normalize(P); };

describe('декор отдельных деталей', () => {
  it('правило по имени меняет метку только у совпавших деталей', () => {
    const P = withOv('wardrobe', [{ part: 'Боковина левая', decor: 'Дуб', color: '#c49a6c' }]), spec = buildSpec(P);
    const l = spec.parts.find(p => p.name === 'Боковина левая'), r = spec.parts.find(p => p.name === 'Боковина правая');
    expect(l.label).toBe('ЛДСП Дуб'); expect(l.color).toBe('#c49a6c'); expect(l.notes.join(' ')).toMatch(/декор «Дуб»/);
    expect(r.label).toBe(`ЛДСП ${P.bodyName}`); expect(r.color).toBeUndefined();
  });
  it('фильтр по секции: подменяется только деталь нужной секции', () => {
    const P = withOv('wardrobe', [{ part: 'Фасад двери', sec: 2, decor: 'Графит', color: '#333333' }]);
    const doors = buildSpec(P).parts.filter(p => p.name === 'Фасад двери');
    expect(doors.some(d => d.sec === 2 && d.label === 'ЛДСП Графит')).toBe(true);
    expect(doors.filter(d => d.sec !== 2).every(d => d.label !== 'ЛДСП Графит')).toBe(true);
  });
  it('не затрагивает МДФ-фасады и стекло', () => {
    const P = makePreset('wardrobe'); P.sections[0].frontStyle = 'shaker'; P.overrides = [{ part: 'Фасад двери', decor: 'Графит', color: '#333' }]; normalize(P);
    const d = buildSpec(P).parts.filter(p => p.name === 'Фасад двери');
    expect(d.filter(x => x.sec === 1).every(x => /^МДФ/.test(x.label))).toBe(true);
  });
  it('геометрия и количество деталей не меняются', () => {
    const base = buildSpec(makePreset('dresser')), P = withOv('dresser', [{ part: 'Боковина левая', decor: 'Дуб', color: '#c49a6c' }]), ov = buildSpec(P);
    expect(ov.parts.length).toBe(base.parts.length);
    expect(JSON.stringify(ov.parts.map(p => [p.name, p.L, p.W, p.c]))).toBe(JSON.stringify(base.parts.map(p => [p.name, p.L, p.W, p.c])));
  });
  it('группируется отдельно, идёт в раскрой своим материалом и в смету своей строкой', () => {
    const P = withOv('wardrobe', [{ part: 'Боковина левая', decor: 'Дуб', color: '#c49a6c' }]), spec = buildSpec(P), G = groupParts(spec), cat = clone(DEFAULT_CATALOG);
    expect(G.some(g => g.name === 'Боковина левая' && g.label === 'ЛДСП Дуб')).toBe(true);
    const N = nest(G, { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l) });
    expect(N.sheets.some(s => /ЛДСП Дуб/.test(s.mat) && s.pieces.some(p => G.find(g => g.no === p.no).name === 'Боковина левая'))).toBe(true);
    const est = estimate(spec, G, N, edgeSummary(G), cat, P);
    expect(est.sections[0].lines.some(l => /ЛДСП Дуб, 18 мм/.test(l.name))).toBe(true);
  });
  it('текстурный декор получает фиксированное направление волокон в раскрое', () => {
    const P = withOv('wardrobe', [{ part: 'Боковина левая', decor: 'Дуб', color: '#c49a6c' }]), G = groupParts(buildSpec(P)), cat = clone(DEFAULT_CATALOG);
    const N = nest(G, { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l) });
    expect(isTextured(cat, 'ЛДСП Дуб')).toBe(true);
    expect(N.over).toEqual([]);
  });
  it('3D: цвет детали берётся из правила, остальные не затронуты', () => {
    const P = withOv('wardrobe', [{ part: 'Боковина левая', decor: 'Графит', color: '#202020' }]), root = build3D(THREE, buildSpec(P), P);
    const side = root.children.find(m => /bokovina_levaya/.test(m.name)), other = root.children.find(m => /bokovina_pravaya/.test(m.name));
    expect(side.material.color.getHexString()).toBe('202020'); expect(other.material.color.getHexString()).not.toBe('202020');
  });
  it('нормализация: мусор отбрасывается, пустой список удаляется, количество ограничено', () => {
    const P = makePreset('rack'); P.overrides = [null, { part: '', decor: 'Дуб' }, { part: 'Полка съёмная', decor: 'Дуб', sec: 'x', color: 'red' }, ...Array(40).fill({ part: 'Дно', decor: 'Дуб' })]; normalize(P);
    expect(P.overrides.length).toBe(30); expect(P.overrides[0]).toEqual({ part: 'Полка съёмная', sec: 0, decor: 'Дуб', color: '#cccccc' });
    P.overrides = [null]; normalize(P); expect(P.overrides).toBeUndefined();
    expect(normalize(clone(withOv('rack', [{ part: 'Дно', decor: 'Дуб', color: '#aabbcc' }]))).overrides[0].decor).toBe('Дуб');
  });
});
