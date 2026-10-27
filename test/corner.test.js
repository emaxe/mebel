import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { buildProject, addModule } from '../web/project.js';
import { groupParts, nest, toDXF, toCSV } from '../web/export.js';
import { partContour } from '../web/dxf.js';
import { toDrillJSON } from '../web/export-cut.js';
import { renderProduction } from '../web/production-view.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';
import { planView } from '../web/plan.js';
import { assemblySteps } from '../web/assembly.js';
import { footprint } from '../web/plan.js';

const clone = o => JSON.parse(JSON.stringify(o));
const corner = (extra = {}, side = 'left') => { const P = makePreset('kcorner'); Object.assign(P, extra); P.cornerSide = side; return normalize(P); };
const seg = (a, c, b) => ((c - a) * (b[1] - a[1]) - (b[0] - a[0]) * 0);
const segArea = (p, q, b) => { if (!b) return 0; const c = Math.hypot(q.x - p.x, q.y - p.y), th = 4 * Math.atan(b), r = c / (2 * Math.sin(th / 2)); return 0.5 * r * r * (th - Math.sin(th)); };
const area = pts => { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += (p.x * q.y - q.x * p.y) / 2 + segArea(p, q, p.b); }); return Math.abs(a); };
const byName = (s, n) => s.parts.filter(p => p.name === n);

// мировая точка отверстия на пласти (f = A|B) или на торце (f = w1|w2|d1|d2)
function world(p, h) {
  const [cx, cy, cz] = p.c;
  if (p.plane === 'yz') return [cx + (h.f === 'A' ? -1 : 1) * p.T / 2, cy - p.L / 2 + h.u, cz - p.W / 2 + h.v];
  if (p.plane === 'xy') return [cx - p.L / 2 + h.u, cy - p.W / 2 + h.v, cz + (h.f === 'A' ? 1 : -1) * p.T / 2];
  if (h.f === 'w1' || h.f === 'w2') return [cx + (h.f === 'w2' ? 1 : -1) * p.L / 2, cy, cz - p.W / 2 + h.v];
  if (h.f === 'd1' || h.f === 'd2') return [cx - p.L / 2 + h.u, cy, cz + (h.f === 'd2' ? 1 : -1) * p.W / 2];
  return [cx - p.L / 2 + h.u, cy + (h.f === 'A' ? 1 : -1) * p.T / 2, cz - p.W / 2 + h.v];
}

describe('угловой модуль «Г»', () => {
  const P = corner(), spec = buildSpec(P), A = P.sections[0].width, B = P.wingB, D = P.depth, t = P.thickness;
  it('габарит модуля — охватывающий прямоугольник крыльев', () => {
    expect(spec.meta.W).toBe(A); expect(spec.meta.D).toBe(B); expect(spec.meta.H).toBe(P.height);
    expect(spec.warnings).toEqual([]);
  });
  it('дно и крышка — Г-образные с выемкой у фасадного угла, площадь контура верна', () => {
    for (const nm of ['Дно Г-образное', 'Крышка Г-образная']) {
      const [p] = byName(spec, nm), c = p.cutouts[0];
      expect(c.kind).toBe('notch'); expect(c.corner).toBe('w2d2');
      const full = p.L * p.W, cut = (c.u1 - c.u0) * (c.v1 - c.v0);
      expect(area(partContour(p.L, p.W, p.cutouts))).toBeCloseTo(full - cut, 3);
      expect(c.u0).toBe(D - 4); expect(c.v0).toBe(D - 4);
    }
  });
  it('конфирматы: каждое торцевое отверстие дна и крышки соосно сквозному отверстию боковины', () => {
    const sideA = byName(spec, 'Боковина крыла A')[0], sideB = byName(spec, 'Боковина крыла B')[0];
    for (const nm of ['Дно Г-образное', 'Крышка Г-образная']) {
      const [p] = byName(spec, nm);
      for (const h of p.holes.filter(x => x.f === 'w2')) {
        const w = world(p, h), m = sideA.holes.filter(x => x.f === 'B' && x.h === 'скв.').map(x => world(sideA, x)).find(q => Math.abs(q[1] - w[1]) < 0.15 && Math.abs(q[2] - w[2]) < 0.15);
        expect(m, `${nm} w2 ${h.v}`).toBeTruthy();
      }
      for (const h of p.holes.filter(x => x.f === 'd2')) {
        const w = world(p, h), m = sideB.holes.filter(x => x.f === 'A' && x.h === 'скв.').map(x => world(sideB, x)).find(q => Math.abs(q[0] - w[0]) < 0.15 && Math.abs(q[1] - w[1]) < 0.15);
        expect(m, `${nm} d2 ${h.u}`).toBeTruthy();
      }
    }
    const conf = Object.fromEntries(spec.hw)['Конфирмат 7×50'];
    expect([sideA, sideB].flatMap(s => s.holes).filter(h => h.h === 'скв.').length).toBe(conf);
    const edgeHoles = ['Дно Г-образное', 'Крышка Г-образная'].flatMap(n => byName(spec, n)[0].holes).length;
    expect(edgeHoles).toBe(conf);
  });
  it('двери: размеры, петли по высоте, чашки и планки', () => {
    const dA = byName(spec, 'Фасад двери крыла A')[0], dB = byName(spec, 'Фасад двери крыла B')[0];
    expect(dA.L).toBeCloseTo(A - 1.5 - D - 1, 6); expect(dB.W).toBeCloseTo(B - 1.5 - (D + 1 + P.frontT + 2), 6);
    expect(dA.W).toBeCloseTo(P.height - P.plinth - 4, 6); expect(dB.L).toBeCloseTo(dA.W, 6);
    const hinges = Object.entries(Object.fromEntries(spec.hw)).find(([k]) => /^Петля/.test(k))[1];
    expect(hinges).toBe(4); // по две на каждую дверь
    expect(dA.holes.filter(h => h.note === 'чашка петли').length).toBe(2); expect(dB.holes.filter(h => h.note === 'чашка петли').length).toBe(2);
    const plates = ['Боковина крыла A', 'Боковина крыла B'].map(n => byName(spec, n)[0].holes.filter(h => h.note === 'планка петли').length);
    expect(plates).toEqual([4, 4]);
  });
  it('нет пересечений между боковинами, задними стенками и дверями (кроме Г-деталей)', () => {
    const solid = spec.parts.filter(p => !/Г-образн/.test(p.name) && !/Цокольн/.test(p.name));
    const ext = p => { const [cx, cy, cz] = p.c, d = p.plane === 'yz' ? [p.T, p.L, p.W] : p.plane === 'xy' ? [p.L, p.W, p.T] : [p.L, p.T, p.W]; return [[cx - d[0] / 2, cx + d[0] / 2], [cy - d[1] / 2, cy + d[1] / 2], [cz - d[2] / 2, cz + d[2] / 2]]; };
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = ext(solid[i]), b = ext(solid[j]);
      const ov = [0, 1, 2].every(k => Math.min(a[k][1], b[k][1]) - Math.max(a[k][0], b[k][0]) > 0.5);
      expect(ov, `${solid[i].name} × ${solid[j].name}`).toBe(false);
    }
  });
  it('все координаты и размеры конечны, детали в пределах габарита', () => {
    for (const p of spec.parts) { expect(p.c.every(Number.isFinite)).toBe(true); expect(p.L).toBeGreaterThan(0); expect(p.W).toBeGreaterThan(0); expect(Math.abs(p.c[0])).toBeLessThanOrEqual(A / 2 + 1); expect(Math.abs(p.c[2])).toBeLessThanOrEqual(B / 2 + 1); }
  });
});

describe('угол справа — зеркальное отражение', () => {
  const L = buildSpec(corner()), R = buildSpec(corner({}, 'right'));
  it('те же детали и размеры, центры зеркальны по x', () => {
    expect(R.parts.length).toBe(L.parts.length);
    L.parts.forEach((p, i) => { expect(R.parts[i].name).toBe(p.name); expect(R.parts[i].L).toBe(p.L); expect(R.parts[i].c[0]).toBeCloseTo(-p.c[0], 6); expect(R.parts[i].c[2]).toBeCloseTo(p.c[2], 6); });
  });
  it('выемка и кромка зеркальны, грани боковин поменялись, оси отверстий по-прежнему совпадают', () => {
    const [bt] = byName(R, 'Дно Г-образное'); expect(bt.cutouts[0].corner).toBe('w1d2');
    expect(area(partContour(bt.L, bt.W, bt.cutouts))).toBeCloseTo(area(partContour(byName(L, 'Дно Г-образное')[0].L, bt.W, byName(L, 'Дно Г-образное')[0].cutouts)), 3);
    const sideA = byName(R, 'Боковина крыла A')[0];
    for (const h of byName(R, 'Дно Г-образное')[0].holes.filter(x => x.f === 'w1')) {
      const w = world(bt, h), m = sideA.holes.filter(x => x.f === 'A' && x.h === 'скв.').map(x => world(sideA, x)).find(q => Math.abs(q[1] - w[1]) < 0.15 && Math.abs(q[2] - w[2]) < 0.15);
      expect(m).toBeTruthy();
    }
  });
});

describe('документы углового модуля', () => {
  const P = corner(), spec = buildSpec(P), G = groupParts(spec), cat = clone(DEFAULT_CATALOG);
  it('раскрой, CSV, DXF с контуром Г и JSON', () => {
    expect(nest(G).over).toEqual([]);
    expect(toCSV(spec, 'К')).not.toMatch(/NaN|undefined/);
    const dxf = Buffer.from(toDXF(spec)).toString('latin1');
    expect(dxf).toMatch(/POLYLINE/); expect(dxf).not.toMatch(/NaN|undefined/);
    const j = JSON.parse(toDrillJSON(G)), bt = j.parts.find(p => p.name === 'Дно Г-образное');
    expect(bt.contour.length).toBeGreaterThanOrEqual(6);
  });
  it('страница задания и инструкция по сборке без ошибок', () => {
    expect(() => assemblySteps(spec, G, P)).not.toThrow();
    const html = renderProduction({ P, cat, projName: 'К', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' }).html;
    expect(html).not.toMatch(/NaN|undefined/); expect(html).toMatch(/Дно Г-образное/);
  });
});

describe('угловой модуль в раскладке', () => {
  it('в ряду слева: второй ряд идёт вдоль стены B от конца крыла B, ряды не пересекаются', () => {
    const r = corner(); addModule(r, makePreset('kbase'), { name: 'Низ A' }); addModule(r, makePreset('kbase'), { name: 'Низ B', turn: 'L' });
    const pr = buildProject(r), [c, a, b] = pr.mods;
    expect(c.D).toBe(r.wingB);
    const fc = footprint(c), fa = footprint(a), fb = footprint(b);
    const hit = (p, q) => p[0] < q[1] - 1e-6 && q[0] < p[1] - 1e-6 && p[2] < q[3] - 1e-6 && q[2] < p[3] - 1e-6;
    expect(hit(fc, fa)).toBe(false); expect(hit(fc, fb)).toBe(false); expect(hit(fa, fb)).toBe(false);
    expect(fb[2]).toBeCloseTo(fc[3], 6);
    expect(planView(pr)).not.toMatch(/NaN/);
  });
});

import { worktopRuns } from '../web/worktop.js';
describe('столешница углового модуля', () => {
  const tops = pr => pr.spec.parts.filter(p => p.name === 'Столешница');
  const fp = p => [p.c[0] - p.L / 2, p.c[0] + p.L / 2, p.c[2] - p.W / 2, p.c[2] + p.W / 2];
  const hit = (p, q) => p[0] < q[1] - 1e-6 && q[0] < p[1] - 1e-6 && p[2] < q[3] - 1e-6 && q[2] < p[3] - 1e-6;
  for (const side of ['left', 'right']) it(`угол ${side}: одна угловая — две плиты встык, вместе покрывают Г без наложения`, () => {
    const r = corner({}, side); r.countertop = {}; normalize(r);
    const pr = buildProject(r), [a, b] = tops(pr), D = r.depth + 30, A = r.sections[0].width, B = r.wingB;
    expect(tops(pr).length).toBe(2);
    expect(hit(fp(a), fp(b))).toBe(false);
    expect(a.L * a.W + b.L * b.W).toBeCloseTo(A * D + D * (B - D), 3);
    expect(b.c[2] - b.W / 2).toBeCloseTo(a.c[2] + a.W / 2, 6);
    const wall = side === 'left' ? pr.mods[0].x - A / 2 : pr.mods[0].x + A / 2;
    expect(side === 'left' ? fp(b)[0] : fp(b)[1]).toBeCloseTo(wall, 6);
  });
  it('с соседями справа и вторым рядом: крыло B накрывает плита второго ряда, лишней плиты нет', () => {
    const r = corner(); addModule(r, makePreset('kbase'), { name: 'Низ A' }); addModule(r, makePreset('kbase'), { name: 'Низ B', turn: 'L' }); r.countertop = {}; normalize(r);
    const pr = buildProject(r), t = tops(pr);
    expect(t.length).toBe(2);
    const [a, b] = t;
    expect(hit(fp(a), fp(b))).toBe(false);
    expect(Math.max(...pr.mods.filter(m => m.run === 1).map(m => m.z + m.W / 2))).toBeCloseTo(fp(b)[3], 6);
    expect(fp(b)[2]).toBeCloseTo(fp(a)[3], 6);
    expect(pr.warnings.some(w => /развернитесь/.test(w))).toBe(false);
  });
  it('угол и поворот ряда с разных сторон — предупреждение', () => {
    const r = corner({}, 'right'); addModule(r, makePreset('kbase'), { turn: 'L' }); normalize(r);
    expect(buildProject(r).spec.warnings.some(w => /развернитесь/.test(w))).toBe(true);
  });
  it('угловой модуль входит в группу столешницы наравне с нижними', () => {
    const r = makePreset('kbase'); addModule(r, corner(), { name: 'Угол' });
    expect(worktopRuns(buildProject(r).mods).map(g => g.map(m => m.name))).toEqual([['Корпус 1', 'Угол']]);
  });
});
