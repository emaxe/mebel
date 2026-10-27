import { describe, it, expect } from 'vitest';
import { makePreset, normalize, schemaOf, MAX_MODULES } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { buildProject, moduleList, addModule, duplicateModule, removeModule, moveModule, setModuleProps, cabinetOf, moduleCount, isMulti } from '../web/project.js';
import { kinProblems } from '../web/autofix.js';
import { solve } from '../web/kinematics.js';
import { groupParts } from '../web/export.js';

const clone = o => JSON.parse(JSON.stringify(o));
const two = (gap = 0) => { const r = makePreset('wardrobe'); addModule(r, makePreset('dresser'), { name: 'Комод', gap, y: 0 }); return r; };

describe('проект из одного корпуса', () => {
  it('общая спецификация — та же, что даёт buildSpec', () => {
    const P = makePreset('rack'), pr = buildProject(P);
    expect(pr.multi).toBe(false);
    expect(JSON.stringify(pr.spec)).toBe(JSON.stringify(buildSpec(P)));
    expect(isMulti(P)).toBe(false); expect(moduleCount(P)).toBe(1);
  });
});

describe('раскладка модулей', () => {
  it('число деталей и фурнитуры равно сумме по модулям', () => {
    const r = two(), pr = buildProject(r), a = buildSpec(r), b = buildSpec(r.modules[0].P);
    expect(pr.multi).toBe(true);
    expect(pr.spec.parts.length).toBe(a.parts.length + b.parts.length);
    expect(pr.spec.extras.length).toBe(a.extras.length + b.extras.length);
    const sum = new Map(); for (const s of [a, b]) for (const [k, q] of s.hw) sum.set(k, (sum.get(k) || 0) + q);
    expect(new Map(pr.spec.hw)).toEqual(sum);
  });
  it('модули стоят слева направо вплотную, ширина = сумма + зазор, центр в нуле', () => {
    const r = two(50), pr = buildProject(r), [m0, m1] = pr.mods;
    expect(pr.spec.meta.W).toBeCloseTo(m0.W + 50 + m1.W, 6);
    expect(m0.x - m0.W / 2).toBeCloseTo(-pr.spec.meta.W / 2, 6);
    expect(m1.x - m1.W / 2).toBeCloseTo(m0.x + m0.W / 2 + 50, 6);
    expect(m1.x + m1.W / 2).toBeCloseTo(pr.spec.meta.W / 2, 6);
  });
  it('задние плоскости модулей совпадают, глубина — наибольшая', () => {
    const r = two(), pr = buildProject(r), back = m => m.z - m.D / 2;
    expect(back(pr.mods[0])).toBeCloseTo(back(pr.mods[1]), 6);
    expect(pr.spec.meta.D).toBe(Math.max(pr.mods[0].D, pr.mods[1].D));
  });
  it('подъём над полом сдвигает модуль и увеличивает высоту проекта', () => {
    const r = makePreset('wardrobe'); addModule(r, makePreset('tv'), { name: 'Верх', y: 1500 });
    const pr = buildProject(r), top = pr.mods[1];
    expect(pr.spec.meta.H).toBeCloseTo(Math.max(pr.mods[0].H, 1500 + top.H), 6);
    const r2 = makePreset('tv'); addModule(r2, makePreset('tv'), { y: 1500 });
    expect(buildProject(r2).spec.meta.H).toBeCloseTo(1500 + buildProject(r2).mods[1].H, 6);
    const own = buildSpec(r.modules[0].P), i = own.parts.findIndex(p => p.name === 'Крышка');
    const merged = pr.spec.parts.filter(p => p.mod === 1)[i];
    expect(merged.c[1]).toBeCloseTo(own.parts[i].c[1] + 1500, 6);
  });
  it('координаты деталей модуля = собственные + смещение', () => {
    const r = two(30), pr = buildProject(r), m = pr.mods[1], own = buildSpec(r.modules[0].P), merged = pr.spec.parts.filter(p => p.mod === 1);
    expect(merged.length).toBe(own.parts.length);
    own.parts.forEach((p, k) => { for (let a = 0; a < 3; a++) expect(merged[k].c[a]).toBeCloseTo(p.c[a] + [m.x, m.y, m.z][a], 6); expect(merged[k].name).toBe(p.name); });
  });
  it('детали модулей не пересекаются по горизонтали при нулевом зазоре', () => {
    const pr = buildProject(two()), [m0, m1] = pr.mods;
    const ext = m => pr.spec.parts.filter(p => p.mod === m.i).map(p => p.c[0]);
    expect(Math.max(...ext(m0))).toBeLessThanOrEqual(m0.x + m0.W / 2 + 1e-6);
    expect(Math.min(...ext(m1))).toBeGreaterThanOrEqual(m1.x - m1.W / 2 - 1e-6);
  });
  it('объединение не меняет исходные спецификации и сам проект', () => {
    const r = two(), before = JSON.stringify(r);
    const pr = buildProject(r), snap = JSON.stringify(pr.mods.map(m => m.spec));
    buildProject(r);
    expect(JSON.stringify(r)).toBe(before);
    expect(JSON.stringify(pr.mods.map(m => m.spec))).toBe(snap);
  });
  it('деталь с индексом элемента сохраняет его после переноса', () => {
    const r = makePreset('rack'); addModule(r, makePreset('rack'), {});
    const items = buildProject(r).spec.parts.filter(p => p.mod === 1 && p.item !== undefined);
    expect(items.length).toBeGreaterThan(0);
    expect(Object.keys(items[0])).not.toContain('item');
  });
});

describe('группы анимации', () => {
  it('идентификаторы уникальны, follow и pivot согласованы', () => {
    const r = two(); addModule(r, makePreset('nightstand'), {});
    const pr = buildProject(r), groups = new Map();
    for (const o of [...pr.spec.parts, ...pr.spec.extras]) if (o.group) groups.set(o.group.id, o.group);
    const ids = [...groups.keys()];
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of groups.values()) if (g.follow) expect(groups.has(g.follow), g.follow).toBe(true);
    const sepIds = new Set(); for (const m of pr.mods) { const own = new Set(); for (const o of [...m.spec.parts, ...m.spec.extras]) if (o.group) own.add(o.group.id); own.forEach(id => sepIds.add((m.i ? `m${m.i}_` : '') + id)); }
    expect(new Set(ids)).toEqual(sepIds);
  });
  it('pivot двери смещён вместе с модулем', () => {
    const r = makePreset('wardrobe'); addModule(r, makePreset('wardrobe'), { gap: 20 });
    const pr = buildProject(r), m = pr.mods[1], own = buildSpec(r.modules[0].P);
    const og = own.parts.find(p => p.group && p.group.pivot).group, mg = pr.spec.parts.find(p => p.mod === 1 && p.group && p.group.id === `m1_${og.id}`).group;
    for (let a = 0; a < 3; a++) expect(mg.pivot[a]).toBeCloseTo(og.pivot[a] + [m.x, m.y, m.z][a], 6);
  });
  it('кинематика работает на общей спецификации', () => {
    const pr = buildProject(two());
    const s = solve(pr.spec, 1, {});
    expect(s.q.size).toBeGreaterThan(0);
    expect(Array.isArray(kinProblems(pr.spec))).toBe(true);
  });
});

describe('операции над модулями', () => {
  it('добавление, дублирование и имена', () => {
    const r = makePreset('wardrobe');
    expect(addModule(r, makePreset('dresser'), { name: 'Комод' })).toBe(1);
    expect(duplicateModule(r, 1)).toBe(2);
    expect(moduleList(r).map(m => m.name)).toEqual(['Корпус 1', 'Комод', 'Комод (копия)']);
    expect(duplicateModule(r, 1)).toBe(2);
    expect(new Set(moduleList(r).map(m => m.name)).size).toBe(4);
    expect(cabinetOf(r, 2).type).toBe('dresser');
  });
  it('копия независима от оригинала', () => {
    const r = makePreset('wardrobe'); addModule(r, makePreset('dresser'), {}); duplicateModule(r, 1);
    cabinetOf(r, 2).height = 700;
    expect(cabinetOf(r, 1).height).not.toBe(700);
  });
  it('удаление основного корпуса передаёт роль следующему', () => {
    const r = makePreset('wardrobe'); addModule(r, makePreset('dresser'), { name: 'Комод' });
    expect(removeModule(r, 0)).toBe(true);
    expect(r.type).toBe('dresser'); expect(r.modName).toBe('Комод'); expect(moduleCount(r)).toBe(1);
    expect(r.modules).toBeUndefined(); expect(schemaOf(r)).toBe(1);
    expect(removeModule(r, 0)).toBe(false);
  });
  it('перемещение меняет порядок и обнуляет зазор первого', () => {
    const r = makePreset('wardrobe'); addModule(r, makePreset('dresser'), { name: 'Комод', gap: 40 });
    expect(moveModule(r, 1, -1)).toBe(0);
    expect(moduleList(r).map(m => m.name)).toEqual(['Комод', 'Корпус 1']);
    expect(r.type).toBe('dresser');
    expect(moduleList(r)[1].gap).toBe(0);
    expect(moveModule(r, 0, -1)).toBe(0);
  });
  it('свойства модуля: имя, зазор, подъём ограничиваются', () => {
    const r = two();
    setModuleProps(r, 1, { name: '  Новый  ', gap: 99999, y: -5 });
    expect(r.modules[0]).toMatchObject({ name: 'Новый', gap: 2000, y: 0 });
    setModuleProps(r, 0, { name: 'Шкаф', y: 1200 });
    expect(r.modName).toBe('Шкаф'); expect(r.modY).toBe(1200);
  });
  it('число модулей ограничено', () => {
    const r = makePreset('rack');
    for (let i = 0; i < MAX_MODULES + 3; i++) addModule(r, makePreset('rack'), {});
    expect(moduleCount(r)).toBe(MAX_MODULES);
    expect(addModule(r, makePreset('rack'), {})).toBe(-1);
  });
  it('схема 2 ставится проекту с модулями и сохраняется при JSON-обороте', () => {
    const r = two();
    expect(r.schema).toBe(2);
    const back = normalize(clone(r));
    expect(back.schema).toBe(2); expect(back.modules.length).toBe(1);
    expect(JSON.stringify(normalize(clone(back)))).toBe(JSON.stringify(back));
  });
  it('нормализация чистит мусор в модулях', () => {
    const r = makePreset('wardrobe');
    r.modules = [null, { P: 5 }, { name: 7, gap: 'x', y: null, P: { ...makePreset('tv'), modules: [{ P: makePreset('tv') }] } }];
    normalize(r);
    expect(r.modules.length).toBe(1);
    expect(r.modules[0]).toMatchObject({ name: 'Модуль', gap: 0, y: 0 });
    expect(r.modules[0].P.modules).toBeUndefined();
  });
});

describe('документы из общей спецификации', () => {
  it('одинаковые детали разных модулей группируются, количество суммируется', () => {
    const r = makePreset('rack'); addModule(r, clone(makePreset('rack')), {});
    const single = groupParts(buildSpec(r)), merged = groupParts(buildProject(r).spec);
    const qty = g => g.reduce((a, x) => a + x.qty, 0);
    expect(qty(merged)).toBe(qty(single) * 2);
    expect(merged.length).toBe(single.length);
  });
});

import { toCSV, toDXF, nest } from '../web/export.js';
import { toCutCSV, toDrillJSON } from '../web/export-cut.js';
import { build3DProject } from '../web/build3d.js';
import { renderProduction } from '../web/production-view.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';
import * as THREE from '../web/vendor/three/build/three.module.js';

describe('документы проекта из нескольких модулей', () => {
  const root = () => { const r = makePreset('wardrobe'); addModule(r, makePreset('dresser'), { name: 'Комод', gap: 20 }); return r; };
  const parseCSV = t => t.replace(/^﻿/, '').split('\r\n').map(l => l.split(';').map(c => c.replace(/^"|"$/g, '')));

  it('метка секции показывает модуль и секцию', () => {
    const G = groupParts(buildProject(root()).spec);
    expect(G.some(g => /М1·\d/.test(g.secLabel))).toBe(true);
    expect(G.some(g => /М2·\d/.test(g.secLabel))).toBe(true);
    expect(groupParts(buildSpec(makePreset('wardrobe'))).every(g => !/М\d/.test(g.secLabel))).toBe(true);
  });
  it('CSV, DXF, раскрой и JSON содержат детали всех модулей', () => {
    const r = root(), spec = buildProject(r).spec, G = groupParts(spec), total = G.reduce((a, g) => a + g.qty, 0);
    expect(total).toBe(buildSpec(r).parts.length + buildSpec(r.modules[0].P).parts.length);
    expect(toCSV(spec, 'Т').split('\r\n').length).toBeGreaterThan(G.length);
    expect(Buffer.from(toDXF(spec)).toString('latin1').match(/POLYLINE\r\n8\r\n(KORPUS|FASAD|HDF|STEKLO|ZERKALO)/g).length).toBeGreaterThanOrEqual(G.length);
    const N = nest(G); expect(N.sheets.reduce((a, s) => a + s.pieces.length, 0) + N.over.length).toBe(G.filter(g => g.mat !== 'glass' && g.mat !== 'mirror').reduce((a, g) => a + g.qty, 0));
    expect(parseCSV(toCutCSV(G)).length - 1).toBe(G.filter(g => g.mat !== 'glass' && g.mat !== 'mirror').length);
    expect(JSON.parse(toDrillJSON(G)).parts.length).toBe(G.length);
  });
  it('3D проекта: по группе на модуль, модули сдвинуты, у мешей есть номер модуля', () => {
    const r = root(), pr = buildProject(r), grp = build3DProject(THREE, pr, r);
    expect(grp.children.length).toBe(2);
    expect(grp.children[1].position.x).toBeCloseTo(pr.mods[1].x / 1000, 6);
    const mods = new Set(); grp.traverse(o => { if (o.isMesh) mods.add(o.userData.mod); });
    expect([...mods].sort()).toEqual([0, 1]);
    expect(build3DProject(THREE, buildProject(makePreset('rack')), makePreset('rack')).isGroup).toBe(true);
  });
  it('страница задания: общие количества, модули в шапке, инструкция сборки по каждому модулю', () => {
    const P = root();
    const { html, spec } = renderProduction({ P, cat: JSON.parse(JSON.stringify(DEFAULT_CATALOG)), projName: 'Т', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' });
    expect(html).not.toMatch(/NaN|undefined/);
    expect(html).toMatch(/Проект из 2 модулей/);
    expect(html).toContain('<span>Комод</span>');
    expect(html).toMatch(/Инструкция по сборке: Комод/);
    expect(html).toMatch(/Инструкция по сборке: Корпус 1/);
    expect(html).toMatch(/М2·\d/);
    expect(spec.parts.length).toBe(buildProject(P).spec.parts.length);
  });
  it('одиночный проект: страница задания не меняется (одна инструкция без названия модуля)', () => {
    const { html } = renderProduction({ P: makePreset('wardrobe'), cat: JSON.parse(JSON.stringify(DEFAULT_CATALOG)), projName: 'Т', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' });
    expect(html).toMatch(/<h1>Инструкция по сборке<\/h1>/);
    expect(html).not.toMatch(/Проект из \d+ модул/);
  });
});
