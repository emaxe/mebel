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

describe('вырезы на столешницах второго и третьего ряда', () => {
  const hob = (run, o = {}) => ({ kind: 'hob', w: 560, h: 490, x: 40, y: 50, r: 8, ...(run ? { run } : {}), ...o });
  const plates = (turn, cuts) => { const r = ukitchen(turn); r.countertop = { ...r.countertop, cutouts: cuts }; return buildProject(normalize(r)).spec.parts.filter(p => p.name === 'Столешница'); };
  for (const turn of ['L', 'R']) for (const run of [0, 1, 2]) {
    it(`${turn}: вырез на плите ${run + 1} только на ней, по краям и на расстоянии y от лицевой кромки`, () => {
      const ps = plates(turn, [hob(run)]);
      ps.forEach((p, i) => expect((p.cutouts || []).length).toBe(i === run ? 1 : 0));
      const p = ps[run], c = p.cutouts[0], x0 = p.c[0] - p.L / 2, z0 = p.c[2] - p.W / 2;
      expect(c.u0).toBeGreaterThanOrEqual(0); expect(c.u1).toBeLessThanOrEqual(p.L + 1e-6);
      expect(c.v0).toBeGreaterThanOrEqual(0); expect(c.v1).toBeLessThanOrEqual(p.W + 1e-6);
      const back = p.back, depth = back[0] ? p.L : p.W, h = back[0] ? c.u1 - c.u0 : c.v1 - c.v0;
      const fromBack = back[0] ? (back[0] < 0 ? c.u0 : p.L - c.u1) : (back[1] < 0 ? c.v0 : p.W - c.v1);
      expect(depth - fromBack - h).toBeCloseTo(50, 6);
      expect(x0 + c.u0).toBeDefined(); expect(z0 + c.v0).toBeDefined();
    });
  }
  it('вытяжка над варкой в повёрнутом ряду: расстояние проверяется', () => {
    const run = y => {
      const r = ukitchen('L', true), list = moduleList(r), b1 = list.find(m => m.name === 'B1');
      const h = makePreset('kwall'); h.appliance = 'hood'; h.sections[0].width = 600;
      addModule(r, h, { name: 'Вытяжка', over: true, y, after: b1.i });
      r.countertop = { ...r.countertop, cutouts: [hob(1)] };
      return buildProject(normalize(r)).warnings.filter(w => /^Вытяжка/.test(w));
    };
    expect(run(1550)).toEqual([]);
    expect(run(1000).join('|')).toMatch(/меньше 650/);
  });
  it('смеситель мойки стоит у стены своей плиты', () => {
    for (const turn of ['L', 'R']) for (const run of [0, 1, 2]) {
      const r = ukitchen(turn); r.countertop = { ...r.countertop, cutouts: [{ kind: 'sink', w: 500, h: 400, x: 40, y: 60, r: 20, ...(run ? { run } : {}) }] };
      const pr = buildProject(normalize(r)), p = pr.spec.parts.filter(q => q.name === 'Столешница')[run], f = pr.fixtures.extras.find(e => e.kind === 'cyl' && e.r === 16);
      const [bx, bz] = p.back, dist = bx ? Math.abs(f.c[0] - (p.c[0] + bx * p.L / 2)) : Math.abs(f.c[2] - (p.c[2] + bz * p.W / 2));
      expect(dist, `${turn}${run}`).toBeLessThan(200);
    }
  });
});
