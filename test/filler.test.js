import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { addModule, buildProject } from '../web/project.js';
import { groupParts, nest } from '../web/export.js';
import { renderProduction } from '../web/production-view.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';
import { planView } from '../web/plan.js';

const clone = o => JSON.parse(JSON.stringify(o));
const run = (fillW = 50) => { const r = makePreset('kbase'); const f = makePreset('kfill'); f.sections[0].width = fillW; addModule(r, f, { name: 'Добор' }); addModule(r, makePreset('kbase'), { name: 'Низ 2' }); r.countertop = {}; return normalize(r); };

describe('фальшпанель', () => {
  it('одна деталь из фасадного материала нужной ширины и высоты, крепёж в списке', () => {
    const P = makePreset('kfill'); P.sections[0].width = 80; normalize(P);
    const s = buildSpec(P), [p] = s.parts;
    expect(s.parts.length).toBe(1); expect(p.name).toBe('Фальшпанель'); expect(p.mat).toBe('front');
    expect(p.L).toBe(80); expect(p.W).toBe(P.height); expect(p.T).toBe(P.frontT); expect(p.label).toBe(`ЛДСП ${P.frontName}`);
    expect(Object.values(p.edges).every(v => v === P.edgeFront)).toBe(true);
    expect(s.meta.W).toBe(80); expect(s.meta.H).toBe(P.height);
    expect(Object.fromEntries(s.hw)['Саморез 4×30 (фальшпанель)']).toBe(4);
    expect(checkBuild(s, P)).toEqual([]);
  });
  it('ширина ограничивается правилами типа', () => {
    const P = makePreset('kfill'); P.sections[0].width = 5; normalize(P); expect(P.sections[0].width).toBe(20);
    P.sections[0].width = 5000; normalize(P); expect(P.sections[0].width).toBe(600);
  });
  it('в ряду: лицом вровень с соседями, зазора нет, ширина проекта включает панель', () => {
    const pr = buildProject(run(50)), [a, f, b] = pr.mods;
    expect(f.z + f.D / 2).toBeCloseTo(a.z + a.D / 2, 6);
    expect(f.x - f.W / 2).toBeCloseTo(a.x + a.W / 2, 6); expect(b.x - b.W / 2).toBeCloseTo(f.x + f.W / 2, 6);
    expect(pr.spec.meta.W).toBeCloseTo(a.W + f.W + b.W, 6);
  });
  it('столешница не рвётся на фальшпанели и покрывает её; одна фальшпанель столешницу не создаёт', () => {
    const pr = buildProject(run(50)), tops = pr.spec.parts.filter(p => p.name === 'Столешница');
    expect(tops.length).toBe(1); expect(tops[0].L).toBeCloseTo(pr.spec.meta.W, 6);
    const only = makePreset('kfill'); only.countertop = {}; normalize(only);
    expect(buildProject(only).spec.parts.filter(p => p.name === 'Столешница').length).toBe(0);
  });
  it('в угловом ряду фальшпанель встаёт вровень с фасадами второго ряда', () => {
    for (const turn of ['R', 'L']) {
      const r = makePreset('kbase'); addModule(r, makePreset('kbase'), { name: 'У1', turn }); const f = makePreset('kfill'); addModule(r, f, { name: 'Добор' });
      const pr = buildProject(r), [, c, d] = pr.mods, front = turn === 'R' ? c.x - c.D / 2 : c.x + c.D / 2;
      expect(turn === 'R' ? d.x - d.D / 2 : d.x + d.D / 2).toBeCloseTo(front, 6);
    }
  });
  it('документы: деталь в спецификации и раскрое, страница задания без ошибок, план рисуется', () => {
    const pr = buildProject(run(70)), G = groupParts(pr.spec), cat = clone(DEFAULT_CATALOG);
    expect(G.some(g => g.name === 'Фальшпанель')).toBe(true);
    expect(nest(G).sheets.some(s => s.pieces.some(p => G.find(g => g.no === p.no).name === 'Фальшпанель'))).toBe(true);
    const html = renderProduction({ P: run(70), cat, projName: 'К', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' }).html;
    expect(html).not.toMatch(/NaN|undefined/); expect(html).toMatch(/Фальшпанель/);
    expect(planView(pr)).not.toMatch(/NaN/);
  });
});
