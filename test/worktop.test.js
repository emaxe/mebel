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

describe('столешница угловой кухни', () => {
  const lk = turn => { const r = makePreset('kbase'); addModule(r, makePreset('kbase'), {}); addModule(r, makePreset('kbase'), { name: 'У1', turn }); addModule(r, makePreset('kbase'), { name: 'У2' }); r.countertop = { T: 38, front: 30, side: 0, cutouts: [] }; return normalize(r); };
  const tops2 = pr => pr.spec.parts.filter(p => p.name === 'Столешница');
  const foot = p => [p.c[0] - p.L / 2, p.c[0] + p.L / 2, p.c[2] - p.W / 2, p.c[2] + p.W / 2];
  const hit = (a, b) => a[0] < b[1] - 1e-6 && b[0] < a[1] - 1e-6 && a[2] < b[3] - 1e-6 && b[2] < a[3] - 1e-6;
  for (const turn of ['R', 'L']) {
    it(`поворот ${turn}: две столешницы, не накладываются, стык встык`, () => {
      const pr = buildProject(lk(turn)), [a, b] = tops2(pr);
      expect(tops2(pr).length).toBe(2);
      expect(hit(foot(a), foot(b))).toBe(false);
      expect(b.c[2] - b.W / 2).toBeCloseTo(a.c[2] + a.W / 2, 6);
    });
    it(`поворот ${turn}: вторая столешница вдоль соседней стены на высоте корпусов`, () => {
      const pr = buildProject(lk(turn)), [a, b] = tops2(pr), runB = pr.mods.filter(m => m.run === 1);
      const Dmax = Math.max(...runB.map(m => m.D));
      expect(b.L).toBeCloseTo(Dmax + 30, 6);
      expect(b.W).toBeCloseTo(Math.max(...runB.map(m => m.z + m.W / 2)) - (a.c[2] + a.W / 2), 6);
      expect(b.c[1]).toBeCloseTo(a.c[1], 6);
      const wall = turn === 'R' ? Math.max(...runB.map(m => m.x + m.D / 2)) : Math.min(...runB.map(m => m.x - m.D / 2));
      expect(turn === 'R' ? b.c[0] + b.L / 2 : b.c[0] - b.L / 2).toBeCloseTo(wall, 6);
    });
  }
  it('общая смета и документы учитывают обе столешницы', () => {
    const pr = buildProject(lk('R')), G = groupParts(pr.spec), cat = clone(DEFAULT_CATALOG);
    expect(G.filter(g => g.mat === 'top').reduce((a, g) => a + g.qty, 0)).toBe(2);
    const est = estimate(pr.spec, G, nest(G), edgeSummary(G), cat, pr.mods[0].P);
    const wl = est.sections.flatMap(s => s.lines).filter(l => /Столешница/.test(l.name));
    expect(wl.reduce((a, l) => a + l.qty, 0)).toBeCloseTo(G.filter(g => g.mat === 'top').reduce((a, g) => a + g.L * g.qty, 0) / 1000, 1);
  });
  it('3D: второй ряд повёрнут, столешница нет', () => {
    const r = lk('R'), pr = buildProject(r), grp = build3DProject(THREE, pr, r);
    const rots = grp.children.filter(c => c.userData.modRoot !== undefined).map(c => c.rotation.y);
    expect(rots.length).toBe(4);
    expect(rots.slice(0, 2).every(v => v === 0)).toBe(true); expect(rots.slice(2).every(v => Math.abs(v + Math.PI / 2) < 1e-9)).toBe(true);
  });
});

describe('мойка и варочная панель как объекты', () => {
  const cuts = [{ kind: 'sink', w: 500, h: 400, x: 100, y: 60, r: 20 }, { kind: 'hob', w: 560, h: 490, x: 700, y: 50, r: 8 }];
  const setup = () => { const r = kitchen({ cutouts: cuts }); return { r, pr: buildProject(r) }; };
  it('вид выреза сохраняется в детали', () => {
    const [t] = top(setup().pr);
    expect(t.cutouts.map(c => c.fixture)).toEqual(['sink', 'hob']);
  });
  it('приборы идут в фурнитуру проекта с категорией «техника»', () => {
    const { pr } = setup(), names = pr.spec.hwx.filter(e => e.kind === 'appliance').map(e => e.name);
    expect(names.length).toBe(2);
    expect(names.some(n => /^Мойка/.test(n))).toBe(true);
    expect(names.some(n => /^Варочная панель/.test(n))).toBe(true);
    expect(pr.spec.hw.some(([k]) => /^Мойка/.test(k))).toBe(true);
  });
  it('свободный вырез прибором не считается', () => {
    const r = kitchen({ cutouts: [{ kind: 'free', w: 100, h: 100, x: 100, y: 60, r: 0 }] });
    expect(buildProject(r).fixtures.hwx).toEqual([]);
  });
  it('в 3D чаша мойки и плита варки лежат в пределах столешницы', () => {
    const { r, pr } = setup(), grp = build3DProject(THREE, pr, r), names = [];
    grp.traverse(o => { if (o.isMesh && o.userData.mod === -1) names.push(o.material.name); });
    expect(names).toContain('nerzhaveyka');
    expect(names).toContain('cherny');
  });
  it('на плане вырезы видны с подписями', async () => {
    const { planView } = await import('../web/plan.js');
    const svg = planView(setup().pr);
    expect(svg).toMatch(/data-cutout="sink"/);
    expect(svg).toMatch(/data-cutout="hob"/);
    expect(svg).toMatch(/Мойка/);
  });
  it('цвет столешницы нормализуется и попадает в материал', () => {
    expect(normalizeWorktop({ color: '#aabbcc' }).color).toBe('#aabbcc');
    expect(normalizeWorktop({ color: 'red' }).color).toBeUndefined();
    const r = kitchen({ cutouts: [], color: '#aa0000' }), grp = build3DProject(THREE, buildProject(r), r);
    let col = null; grp.traverse(o => { if (o.isMesh && o.userData.mod === -1 && o.material.name === 'stoleshnitsa') col = o.material.color.getHexString(); });
    expect(col).toBe('aa0000');
  });
  it('в списке покупок есть техника', async () => {
    const { shoppingList } = await import('../web/fittings.js');
    const lines = shoppingList(setup().pr.spec, clone(DEFAULT_CATALOG), {});
    expect(lines.filter(l => l.kind === 'appliance').length).toBe(2);
  });
});
