import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildProject, addModule } from '../web/project.js';
import { planView } from '../web/plan.js';
import { normalizeWorktop } from '../web/worktop.js';
import { groupParts, nest, edgeSummary } from '../web/export.js';
import { estimate } from '../web/estimate.js';
import { DEFAULT_CATALOG, sheetFor, isTextured } from '../web/catalog.js';

const kitchen = (wt, turn) => {
  const r = makePreset('kbase'); r.sections[0].width = 600;
  addModule(r, makePreset('kbase'), { name: 'Нижний 2' });
  if (turn) addModule(r, makePreset('kbase'), { name: 'Угловой ряд', turn });
  r.countertop = wt; return normalize(r);
};
const WT = { T: 38, front: 30, side: 0, cutouts: [] };

describe('бортик и фартук столешницы', () => {
  it('нормализация: малые и мусорные значения выключают, большие ограничиваются', () => {
    expect(normalizeWorktop({ ...WT, skirtH: 5, apron: 50 })).toMatchObject({ skirtH: 0, apron: 0 });
    expect(normalizeWorktop({ ...WT, skirtH: 999, apron: 99999 })).toMatchObject({ skirtH: 150, apron: 1000 });
    expect(normalizeWorktop({ ...WT, skirtH: 'x', apron: null })).toMatchObject({ skirtH: 0, apron: 0 });
  });
  it('без бортика и фартука деталей не прибавляется', () => {
    expect(buildProject(kitchen(WT)).spec.parts.filter(p => p.name === 'Бортик столешницы' || p.name === 'Фартук')).toEqual([]);
  });
  it('бортик лежит на столешнице у стены, фартук над ним', () => {
    const proj = buildProject(kitchen({ ...WT, skirtH: 60, apron: 600 })), sp = proj.spec;
    const top = sp.parts.find(p => p.name === 'Столешница'), sk = sp.parts.find(p => p.name === 'Бортик столешницы'), ap = sp.parts.find(p => p.name === 'Фартук');
    expect(sk.L).toBeCloseTo(top.L, 3); expect(sk.W).toBe(60);
    expect(sk.c[1] - 30).toBeCloseTo(top.c[1] + top.T / 2, 3);
    expect(ap.W).toBe(600); expect(ap.T).toBe(4); expect(ap.label).toBe('ХДФ');
    expect(ap.c[1] - 300).toBeCloseTo(sk.c[1] + 30, 3);
    const wallZ = Math.min(...proj.mods.map(m => m.z - m.D / 2));
    expect(sk.c[2]).toBeCloseTo(wallZ + 8, 3); expect(ap.c[2]).toBeGreaterThan(sk.c[2]);
    expect(top.c[2] - top.W / 2).toBeCloseTo(wallZ, 3);
  });
  it('бортик и фартук не меняют границы плана', () => {
    const a = planView(buildProject(kitchen(WT, 'L'))), b = planView(buildProject(kitchen({ ...WT, skirtH: 60, apron: 600 }, 'L')));
    expect(b.match(/viewBox="[^"]+"/)[0]).toBe(a.match(/viewBox="[^"]+"/)[0]);
    expect((b.match(/data-worktop/g) || []).length).toBe((a.match(/data-worktop/g) || []).length);
  });
  it('угловая кухня: бортик и фартук есть вдоль обеих стен', () => {
    const sp = buildProject(kitchen({ ...WT, skirtH: 50, apron: 500 }, 'L')).spec;
    const sks = sp.parts.filter(p => p.name === 'Бортик столешницы'), aps = sp.parts.filter(p => p.name === 'Фартук');
    expect(sks.length).toBe(2); expect(aps.length).toBe(2);
    expect(new Set(aps.map(a => a.plane))).toEqual(new Set(['xy', 'yz']));
  });
  it('длинный фартук делится на части по листу ХДФ и раскладывается', () => {
    const r = makePreset('kbase'); r.sections[0].width = 900;
    for (let i = 0; i < 3; i++) addModule(r, makePreset('kbase'), { name: 'М' + i }), r.modules[i].P.sections[0].width = 900;
    r.countertop = { ...WT, apron: 600 }; normalize(r);
    const sp = buildProject(r).spec, aps = sp.parts.filter(p => p.name === 'Фартук');
    expect(aps.length).toBeGreaterThan(1); expect(aps.every(a => a.L <= 2780)).toBe(true);
    const G = groupParts(sp), cat = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
    const N = nest(G, { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l) });
    expect(N.sheets.some(s => /^ХДФ/.test(s.mat) && s.pieces.some(pc => G.find(g => g.no === pc.no).name === 'Фартук'))).toBe(true);
  });
  it('в смете бортик считается по ширине от цены столешницы, фартук — как ХДФ', () => {
    const base = buildProject(kitchen(WT)).spec, withS = buildProject(kitchen({ ...WT, skirtH: 60, apron: 600 })).spec, cat = JSON.parse(JSON.stringify(DEFAULT_CATALOG));
    const est = sp => { const G = groupParts(sp), N = nest(G, { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l) }); return estimate(sp, G, N, edgeSummary(G), cat, {}); };
    const e0 = est(base), e1 = est(withS);
    const line = e1.sections.flatMap(s => s.lines).find(l => /Бортик/.test(l.name));
    expect(line.price).toBe(Math.round((cat.special.worktop * 60) / 600));
    expect(e1.total).toBeGreaterThan(e0.total);
  });
});
