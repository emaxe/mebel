import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildProject, addModule, duplicateModule, moduleList } from '../web/project.js';
import { footprint, planView } from '../web/plan.js';
import { normalizeRoom, roomFrame, roomWarnings } from '../web/room.js';

const base = w => { const P = makePreset('kbase'); P.sections[0].width = w; return normalize(P); };
const ukitchen = (turn = 'L', wt = true) => {
  const r = base(600);
  addModule(r, base(600), { name: 'A2' });
  addModule(r, base(700), { name: 'B1', turn });
  addModule(r, base(500), { name: 'B2' });
  addModule(r, base(600), { name: 'C1', turn });
  addModule(r, base(800), { name: 'C2' });
  if (wt) r.countertop = { T: 38, front: 30, side: 0, cutouts: [] };
  return normalize(r);
};
const overlap = (a, b) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > 0.5 && Math.min(a[3], b[3]) - Math.max(a[2], b[2]) > 0.5;

describe('П-образная кухня: третий ряд', () => {
  it('два поворота в одну сторону дают ряды 0, 1 и 2, третий лицом к основному', () => {
    const p = buildProject(ukitchen('L'));
    expect(p.mods.map(m => m.run)).toEqual([0, 0, 1, 1, 2, 2]);
    const c = p.mods.filter(m => m.run === 2);
    expect(c.every(m => Math.abs(m.rot - Math.PI) < 1e-9)).toBe(true);
    expect(c[1].x).toBeGreaterThan(c[0].x);
  });
  it('шкафы не пересекаются на плане ни при повороте влево, ни вправо', () => {
    for (const t of ['L', 'R']) {
      const p = buildProject(ukitchen(t)), boxes = p.mods.map(footprint);
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `${t}: ${p.mods[i].name} × ${p.mods[j].name}`).toBe(false);
    }
  });
  it('задние стенки ряда C упираются в одну плоскость у дальней стены', () => {
    const p = buildProject(ukitchen('L')), c = p.mods.filter(m => m.run === 2), back = m => m.z + m.D / 2;
    expect(back(c[0])).toBeCloseTo(back(c[1]), 3);
    const b = p.mods.filter(m => m.run === 1), endB = Math.max(...b.map(m => m.z + m.W / 2));
    expect(back(c[0])).toBeCloseTo(endB, 3);
  });
  it('третья столешница стоит у дальней стены и не пересекает вторую', () => {
    const p = buildProject(ukitchen('L')), tops = p.spec.parts.filter(q => q.name === 'Столешница');
    expect(tops.length).toBe(3);
    const rect = q => [q.c[0] - q.L / 2, q.c[0] + q.L / 2, q.c[2] - q.W / 2, q.c[2] + q.W / 2];
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(overlap(rect(tops[i]), rect(tops[j])), `${i}×${j}`).toBe(false);
    const far = tops[2], c = p.mods.filter(m => m.run === 2);
    expect(far.c[2] + far.W / 2).toBeCloseTo(c[0].z + c[0].D / 2, 3);
  });
  it('нормализация: третий поворот и поворот в другую сторону сбрасываются', () => {
    const r = ukitchen('L'); addModule(r, base(600), { name: 'X', turn: 'L' }); normalize(r);
    expect(moduleList(r).filter(m => m.turn).length).toBe(2);
    const r2 = ukitchen('L'); r2.modules[3].turn = 'R'; normalize(r2);
    expect(moduleList(r2).filter(m => m.turn).length).toBe(1);
  });
  it('копия модуля с поворотом не начинает новый ряд', () => {
    const r = base(600); addModule(r, base(600), { name: 'B1', turn: 'L' }); duplicateModule(r, 1);
    expect(moduleList(r).filter(m => m.turn).length).toBe(1);
  });
  it('план и помещение: стена C, проём и выход за неё', () => {
    const r = ukitchen('L'), p0 = buildProject(r), w = Math.max(...p0.mods.map(m => footprint(m)[1])) - Math.min(...p0.mods.map(m => footprint(m)[0]));
    r.room = { w: Math.round(w) + 400, d: 5000, h: 2700, openings: [{ kind: 'window', wall: 'C', x: 100, w: 1000, y: 900, h: 1200 }] }; normalize(r);
    const p = buildProject(r), svg = planView(p);
    expect(p.frame.hasC).toBe(true); expect(svg).toContain('data-opening="window"');
    expect(p.warnings.filter(x => /стен/.test(x))).toEqual([]);
    r.room.d = 1200; normalize(r);
    expect(buildProject(r).warnings.some(x => /выходит за стену [BC]/.test(x))).toBe(true);
    const tight = normalizeRoom({ w: 3000, d: 5000, h: 2700, openings: [{ kind: 'door', wall: 'Z', x: 0, w: 900 }, { kind: 'window', wall: 'C', x: 0, w: 900, y: 900, h: 300 }] });
    expect(tight.openings.map(o => o.wall)).toEqual(['A', 'C']);
  });
  it('без второго поворота раскладка и комната прежние', () => {
    const r = base(600); addModule(r, base(600), { name: 'B1', turn: 'L' });
    const p = buildProject(r); expect(p.mods.map(m => m.run)).toEqual([0, 1]);
    expect(roomFrame(p, normalizeRoom({ w: 3000, d: 3000, h: 2700 })).hasC).toBe(false);
  });
});
