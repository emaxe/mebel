import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { addModule, buildProject } from '../web/project.js';
import { planView, footprint } from '../web/plan.js';
import { renderProduction } from '../web/production-view.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';

const clone = o => JSON.parse(JSON.stringify(o));
const kitchen = (turn = '') => { const r = makePreset('kbase'); addModule(r, makePreset('kbase'), {}); if (turn) { addModule(r, makePreset('kbase'), { name: 'У1', turn }); addModule(r, makePreset('kbase'), { name: 'У2' }); } addModule(r, makePreset('kwall'), { name: 'Верх', y: 1400, over: true, after: 0 }); r.countertop = {}; return normalize(r); };

describe('план-схема', () => {
  it('прямоугольник на каждый модуль, столешница штрихом, без NaN', () => {
    const pr = buildProject(kitchen()), svg = planView(pr);
    expect((svg.match(/data-mod="/g) || []).length).toBe(pr.mods.length);
    expect((svg.match(/data-worktop/g) || []).length).toBe(pr.worktops.length);
    expect(svg).not.toMatch(/NaN|undefined/);
  });
  it('габариты и цепочка: подписи равны ширинам модулей на полу', () => {
    const pr = buildProject(kitchen()), svg = planView(pr), segs = [...svg.matchAll(/data-seg="([^"]+)"/g)].map(m => m[1]);
    const expected = pr.mods.filter(m => !m.over).map(m => String(Math.round(m.W)));
    for (const e of expected) expect(segs).toContain(e);
    expect(svg).toContain(`>${Math.round(pr.spec.meta.W)}</text>`);
  });
  for (const turn of ['R', 'L']) it(`угловая кухня ${turn}: у повёрнутых модулей размеры поменяны местами, стена второго ряда нарисована`, () => {
    const pr = buildProject(kitchen(turn)), svg = planView(pr);
    for (const m of pr.mods) { const f = footprint(m); expect(f[1] - f[0]).toBeCloseTo(m.run === 1 ? m.D : m.W, 6); expect(f[3] - f[2]).toBeCloseTo(m.run === 1 ? m.W : m.D, 6); }
    expect((svg.match(/stroke-width="3" opacity=".55"/g) || []).length).toBe(2);
  });
  it('модуль над другим рисуется пунктиром без заливки', () => {
    const svg = planView(buildProject(kitchen()));
    expect(svg).toMatch(/fill="none" stroke="#1f1e1b" stroke-width="1" stroke-dasharray="3 3" data-mod="1"/);
  });
  it('проект из одного модуля рисуется без ошибок', () => {
    expect(planView(buildProject(makePreset('wardrobe')))).toMatch(/data-plan/);
  });
  it('страница задания содержит план для нескольких модулей и не содержит для одного шкафа', () => {
    const cat = clone(DEFAULT_CATALOG), common = { cat, projName: 'К', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' };
    expect(renderProduction({ P: kitchen('R'), ...common }).html).toMatch(/<h2>План<\/h2>/);
    expect(renderProduction({ P: makePreset('wardrobe'), ...common }).html).not.toMatch(/<h2>План<\/h2>/);
  });
});
