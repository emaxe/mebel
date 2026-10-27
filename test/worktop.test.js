import { describe, it, expect } from 'vitest';
import * as THREE from '../web/vendor/three/build/three.module.js';
import { makePreset, normalize } from '../web/rules.js';
import { addModule, buildProject } from '../web/project.js';
import { normalizeWorktop, worktopRuns, SPLIT_GAP } from '../web/worktop.js';
import { groupParts, nest, edgeSummary, toDXF } from '../web/export.js';
import { toCutCSV, toDrillJSON } from '../web/export-cut.js';
import { estimate } from '../web/estimate.js';
import { DEFAULT_CATALOG, sheetFor, isTextured } from '../web/catalog.js';
import { build3DProject } from '../web/build3d.js';
import { renderProduction } from '../web/production-view.js';

const clone = o => JSON.parse(JSON.stringify(o));
const kitchen = (extra = {}) => { const r = makePreset('kbase'); addModule(r, makePreset('kbase'), { name: 'Низ 2' }); r.countertop = { T: 38, front: 30, side: 10, cutouts: [], ...extra }; return normalize(r); };
const top = pr => pr.spec.parts.filter(p => p.name === 'Столешница');

describe('описание столешницы', () => {
  it('значения ограничиваются, мусор отбрасывается', () => {
    expect(normalizeWorktop(null)).toBeUndefined(); expect(normalizeWorktop([])).toBeUndefined(); expect(normalizeWorktop('x')).toBeUndefined();
    const w = normalizeWorktop({ T: 5, front: 999, side: -4, cutouts: [null, { kind: 'zzz', w: 1, h: 99999, x: -3, y: 'a', r: 1e6 }, ...Array(30).fill({})] });
    expect(w.T).toBe(16); expect(w.front).toBe(100); expect(w.side).toBe(0);
    expect(w.cutouts.length).toBe(12); expect(w.cutouts[0]).toMatchObject({ kind: 'free', w: 20, h: 1000, x: 0, y: 30, r: 100 });
  });
  it('пустой объект даёт столешницу по умолчанию', () => { expect(normalizeWorktop({})).toMatchObject({ T: 38, front: 30, side: 0, cutouts: [] }); });
  it('сохраняется нормализацией проекта; у дополнительных модулей отбрасывается', () => {
    const r = kitchen(); r.modules[0].P.countertop = { T: 20 };
    normalize(r);
    expect(r.countertop.T).toBe(38); expect(r.modules[0].P.countertop).toBeUndefined();
    expect(normalize(clone(r)).countertop).toEqual(r.countertop);
  });
});

describe('группы модулей под столешницей', () => {
  const runsOf = r => worktopRuns(buildProject(r).mods).map(g => g.map(m => m.name));
  it('соседние нижние модули — одна столешница', () => { expect(runsOf(kitchen())).toEqual([['Корпус 1', 'Низ 2']]); });
  it('пенал разрывает столешницу, верхние и приподнятые модули не считаются', () => {
    const r = makePreset('kbase'); addModule(r, makePreset('ktall'), { name: 'Пенал' }); addModule(r, makePreset('kbase'), { name: 'Низ 3' }); addModule(r, makePreset('kwall'), { name: 'Верх', y: 1400, over: true });
    expect(runsOf(r)).toEqual([['Корпус 1'], ['Низ 3']]);
  });
  it('большой зазор начинает новую столешницу, малый нет', () => {
    const a = makePreset('kbase'); addModule(a, makePreset('kbase'), { gap: SPLIT_GAP - 1 }); expect(runsOf(a).length).toBe(1);
    const b = makePreset('kbase'); addModule(b, makePreset('kbase'), { gap: SPLIT_GAP }); expect(runsOf(b).length).toBe(2);
  });
  it('без нижних модулей столешницы нет', () => {
    const r = makePreset('ktall'); r.countertop = {}; normalize(r);
    expect(top(buildProject(r)).length).toBe(0);
  });
});

describe('деталь «Столешница»', () => {
  it('размеры и положение: длина по модулям и боковым свесам, глубина со свесом, на верхе корпусов', () => {
    const r = kitchen(), pr = buildProject(r), [t] = top(pr), [a, b] = pr.mods;
    expect(t.L).toBeCloseTo(a.W + b.W + 20, 6); expect(t.W).toBeCloseTo(Math.max(a.D, b.D) + 30, 6); expect(t.T).toBe(38);
    expect(t.c[1]).toBeCloseTo(a.H + 19, 6);
    expect(t.c[0]).toBeCloseTo(0, 6);
    expect(t.c[2] - t.W / 2).toBeCloseTo(a.z - a.D / 2, 6);
    expect(t.mat).toBe('top');
  });
  it('в общей спецификации есть, в спецификациях модулей нет, меta проекта не меняется', () => {
    const r = kitchen(), pr = buildProject(r), without = buildProject(Object.assign(clone(r), { countertop: undefined }));
    expect(top(pr).length).toBe(1); expect(pr.mods.every(m => !m.spec.parts.some(p => p.name === 'Столешница'))).toBe(true);
    expect(pr.spec.parts.length).toBe(without.spec.parts.length + 1);
    expect(pr.spec.meta.W).toBeCloseTo(without.spec.meta.W, 6);
  });
  it('проект из одного нижнего модуля тоже получает столешницу', () => {
    const r = makePreset('kbase'); r.countertop = {}; normalize(r);
    const pr = buildProject(r);
    expect(pr.multi).toBe(false); expect(top(pr).length).toBe(1);
    expect(pr.mods[0].spec.parts.some(p => p.name === 'Столешница')).toBe(false);
  });
  it('вырез: координаты от левого и переднего края, радиус, примечание', () => {
    const r = kitchen({ cutouts: [{ kind: 'sink', w: 500, h: 400, x: 100, y: 60, r: 20 }] }), [t] = top(buildProject(r));
    expect(t.cutouts.length).toBe(1);
    const c = t.cutouts[0];
    expect(c.u0).toBe(100); expect(c.u1).toBe(600); expect(c.v1).toBeCloseTo(t.W - 60, 6); expect(c.v0).toBeCloseTo(t.W - 460, 6); expect(c.r).toBe(20);
    expect(t.notes.join(' ')).toMatch(/Мойка/);
  });
  it('вырез за краем обрезается, слишком мелкий отбрасывается', () => {
    const r = kitchen({ cutouts: [{ kind: 'free', w: 3000, h: 300, x: 5900, y: 10, r: 0 }, { kind: 'free', w: 20, h: 20, x: 6000, y: 0, r: 0 }] });
    const [t] = top(buildProject(r));
    for (const c of t.cutouts) { expect(c.u0).toBeGreaterThanOrEqual(0); expect(c.u1).toBeLessThanOrEqual(t.L + 1e-6); expect(c.v0).toBeGreaterThanOrEqual(0); expect(c.v1).toBeLessThanOrEqual(t.W + 1e-6); }
  });
});

describe('документы со столешницей', () => {
  const setup = () => { const r = kitchen({ cutouts: [{ kind: 'sink', w: 500, h: 400, x: 100, y: 60, r: 20 }, { kind: 'hob', w: 560, h: 490, x: 700, y: 50, r: 8 }] }), pr = buildProject(r), G = groupParts(pr.spec), cat = clone(DEFAULT_CATALOG); return { r, pr, G, cat }; };
  it('в спецификации есть, на листы не раскладывается и в CSV сервисов не попадает', () => {
    const { G } = setup(), g = G.find(x => x.mat === 'top');
    expect(g).toBeTruthy(); expect(g.qty).toBe(1);
    expect(nest(G).sheets.every(s => s.mat !== 'Столешница 38 мм, 38 мм' && !/Столешница/.test(s.mat))).toBe(true);
    expect(nest(G).over.every(o => !/Столешница/.test(o.mat))).toBe(true);
    expect(toCutCSV(G)).not.toMatch(/Столешница/);
  });
  it('в JSON операций ЧПУ и DXF есть столешница и вырезы', () => {
    const { pr, G } = setup(), j = JSON.parse(toDrillJSON(G)), p = j.parts.find(x => x.name === 'Столешница');
    expect(p.cutouts.length).toBe(2); expect(p.material).toMatch(/Столешница 38/);
    const dxf = Buffer.from(toDXF(pr.spec)).toString('latin1');
    expect(dxf).toMatch(/POLYLINE\r\n8\r\nVYREZ/);
  });
  it('смета: погонные метры и вырезы, цена из справочника, нет цены — предупреждение', () => {
    const { pr, G, cat } = setup(), N = nest(G), est = estimate(pr.spec, G, N, edgeSummary(G), cat, pr.mods[0].P);
    const lines = est.sections.flatMap(s => s.lines), wl = lines.find(l => /Столешница/.test(l.name));
    expect(wl.unit).toBe('пог. м'); expect(wl.qty).toBeCloseTo(G.find(x => x.mat === 'top').L / 1000, 2); expect(wl.sum).toBeCloseTo((G.find(x => x.mat === 'top').L / 1000) * cat.special.worktop, 0);
    const cl = lines.find(l => /Вырезы в столешнице/.test(l.name));
    expect(cl.qty).toBe(2); expect(cl.sum).toBe(2 * cat.works.cutout);
    const c2 = clone(cat); c2.special.worktop = 0;
    expect(estimate(pr.spec, G, N, edgeSummary(G), c2, pr.mods[0].P).missing).toContain('столешница');
  });
  it('без вырезов строки про вырезы нет', () => {
    const r = kitchen(), pr = buildProject(r), G = groupParts(pr.spec), cat = clone(DEFAULT_CATALOG);
    expect(estimate(pr.spec, G, nest(G), edgeSummary(G), cat, r).sections.flatMap(s => s.lines).some(l => /Вырезы в столешнице/.test(l.name))).toBe(false);
  });
  it('3D: столешница отдельным узлом, не выбирается как модуль', () => {
    const { r, pr } = setup(), grp = build3DProject(THREE, pr, r), tops = [];
    grp.traverse(o => { if (o.isMesh && o.material.name === 'stoleshnitsa') tops.push(o); });
    expect(tops.length).toBeGreaterThan(0); expect(tops.every(m => m.userData.mod === -1)).toBe(true);
    expect(grp.children.length).toBe(3);
  });
  it('страница задания: в таблицах, смете и чертежах; без NaN', () => {
    const { r, cat } = setup();
    const { html } = renderProduction({ P: r, cat, projName: 'К', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' });
    expect(html).toMatch(/Столешница 38 мм/); expect(html).toMatch(/Вырезы в столешнице/); expect(html).toMatch(/вырез «Мойка»/);
    expect(html).not.toMatch(/NaN|undefined/);
  });
});

import { worktopWarnings } from '../web/worktop.js';
describe('предупреждения по столешнице', () => {
  it('перекрывающиеся вырезы и вырезы у края', () => {
    const r = kitchen({ cutouts: [{ kind: 'sink', w: 500, h: 400, x: 100, y: 60, r: 0 }, { kind: 'hob', w: 560, h: 490, x: 250, y: 50, r: 0 }, { kind: 'free', w: 100, h: 100, x: 0, y: 200, r: 0 }] });
    const w = buildProject(r).warnings;
    expect(w.some(x => /вырезы 1 и 2 перекрываются/.test(x))).toBe(true);
    expect(w.some(x => /вырез 3 ближе 30 мм к краю/.test(x))).toBe(true);
  });
  it('разнесённые вырезы без замечаний; предупреждения попадают в общую спецификацию', () => {
    const r = kitchen({ cutouts: [{ kind: 'sink', w: 400, h: 400, x: 100, y: 80, r: 0 }, { kind: 'hob', w: 400, h: 400, x: 600, y: 80, r: 0 }] });
    const pr = buildProject(r);
    expect(pr.warnings).toEqual([]);
    const bad = kitchen({ cutouts: [{ kind: 'sink', w: 500, h: 400, x: 100, y: 60, r: 0 }, { kind: 'hob', w: 560, h: 490, x: 250, y: 50, r: 0 }] });
    expect(buildProject(bad).spec.warnings.some(x => /перекрываются/.test(x))).toBe(true);
    const single = makePreset('kbase'); single.countertop = { cutouts: [{ kind: 'sink', w: 300, h: 300, x: 0, y: 0, r: 0 }] }; normalize(single);
    expect(buildProject(single).spec.warnings.some(x => /ближе 30 мм/.test(x))).toBe(true);
  });
  it('без столешницы предупреждений нет', () => { expect(worktopWarnings([])).toEqual([]); });
});
