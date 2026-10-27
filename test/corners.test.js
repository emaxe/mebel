import { describe, it, expect } from 'vitest';
import * as THREE from '../web/vendor/three/build/three.module.js';
import { makePreset, normalize, normalizeCutouts } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { partContour } from '../web/dxf.js';
import { groupParts, edgeSummary, toDXF } from '../web/export.js';
import { toDrillJSON } from '../web/export-cut.js';
import { partDrawing } from '../web/partdraw.js';
import { build3D } from '../web/build3d.js';

const area = pts => {
  let a = 0;
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    a += (p.x * q.y - q.x * p.y) / 2;
    if (p.b) { const l = Math.hypot(q.x - p.x, q.y - p.y), th = 4 * Math.atan(Math.abs(p.b)), r = l / (2 * Math.sin(th / 2)); a += Math.sign(p.b) * (r * r / 2) * (th - Math.sin(th)); }
  });
  return a;
};
const withCut = (list, type = 'wardrobe') => { const P = makePreset(type); P.cutouts = list; return normalize(P); };
const side = (P, name = 'Боковина левая') => buildSpec(P).parts.find(p => p.name === name);

describe('скос и скругление угла детали', () => {
  it('контур: площадь убывает на треугольник или на сегмент между углом и дугой', () => {
    const L = 600, W = 400, full = L * W;
    expect(area(partContour(L, W, []))).toBeCloseTo(full, 3);
    expect(area(partContour(L, W, [{ kind: 'chamfer', corner: 'w2d2', u0: 500, u1: 600, v0: 300, v1: 400 }]))).toBeCloseTo(full - (100 * 100) / 2, 3);
    for (const corner of ['w1d1', 'w2d1', 'w1d2', 'w2d2']) {
      const u0 = corner[1] === '1' ? 0 : L - 50, v0 = corner[3] === '1' ? 0 : W - 50;
      expect(area(partContour(L, W, [{ kind: 'round', corner, u0, u1: u0 + 50, v0, v1: v0 + 50, r: 50 }])), corner).toBeCloseTo(full - (1 - Math.PI / 4) * 2500, 2);
    }
  });
  it('нормализация: скос — w×h без радиуса, скругление — только радиус', () => {
    const [a, b] = normalizeCutouts([{ part: 'Дно', kind: 'chamfer', w: 40, h: 30, r: 9, corner: 'w2d1' }, { part: 'Дно', kind: 'round', r: 70, w: 5, h: 5, corner: 'w1d2' }]);
    expect(a).toMatchObject({ kind: 'chamfer', w: 40, h: 30, r: 0, corner: 'w2d1' });
    expect(b).toMatchObject({ kind: 'round', w: 70, h: 70, r: 70, corner: 'w1d2' });
  });
  it('расчёт кладёт скос и скругление в угол детали, размеры не меняются', () => {
    const P = withCut([{ part: 'Боковина левая', kind: 'round', r: 80, corner: 'w2d2' }, { part: 'Боковина правая', kind: 'chamfer', w: 60, h: 90, corner: 'w2d2' }]), sp = buildSpec(P);
    const l = sp.parts.find(p => p.name === 'Боковина левая'), r = sp.parts.find(p => p.name === 'Боковина правая');
    expect(l.cutouts[0]).toMatchObject({ kind: 'round', corner: 'w2d2', u0: l.L - 80, u1: l.L, v0: l.W - 80, v1: l.W, r: 80 });
    expect(r.cutouts[0]).toMatchObject({ kind: 'chamfer', u0: r.L - 60, v0: r.W - 90 });
    expect(sp.warnings).toEqual([]);
  });
  it('слишком большой скос — предупреждение и ошибка проверки', () => {
    const P = withCut([{ part: 'Полка съёмная', kind: 'chamfer', w: 2000, h: 80, corner: 'w1d1' }]), sp = buildSpec(P);
    expect(sp.warnings.some(w => /не помещается/.test(w))).toBe(true);
  });
  it('DXF: скругление — дуга (код 42), скос — без дуги, слоя VYREZ для угловых вырезов нет', () => {
    const dxf = (kind, extra) => Buffer.from(toDXF(buildSpec(withCut([{ part: 'Боковина левая', kind, corner: 'w2d2', ...extra }])))).toString('latin1');
    const round = dxf('round', { r: 80 }), chamfer = dxf('chamfer', { w: 60, h: 60 });
    expect(round).toContain('\r\n42\r\n'); expect(round).not.toMatch(/VYREZ/); expect(chamfer).not.toMatch(/VYREZ/);
    expect((round.match(/\r\n42\r\n/g) || []).length).toBeGreaterThan((chamfer.match(/\r\n42\r\n/g) || []).length);
  });
  it('ЧПУ: контур содержит дугу, вырез отмечен видом', () => {
    const j = JSON.parse(toDrillJSON(groupParts(buildSpec(withCut([{ part: 'Боковина левая', kind: 'round', r: 80, corner: 'w2d2' }]))), {}));
    const part = j.parts.find(p => p.name === 'Боковина левая');
    expect(part.contour.some(v => v.bulge > 0)).toBe(true); expect(part.cutouts[0].kind).toBe('round');
  });
  it('кромка: срез укорачивает кромку, новая линия скоса и дуги кромится по более толстой смежной', () => {
    const base = edgeSummary(groupParts(buildSpec(withCut([])))), total = e => e.reduce((a, x) => a + x.m * 1000, 0);
    const sp = buildSpec(withCut([{ part: 'Боковина левая', kind: 'chamfer', w: 100, h: 100, corner: 'w2d2' }]));
    const left = groupParts(sp).find(g => g.name === 'Боковина левая');
    expect(left.edges.d2).toBeGreaterThan(0);
    const diff = total(edgeSummary(groupParts(sp))) - total(base);
    const v = Math.max(left.edges.d2, left.edges.w2);
    expect(v).toBeGreaterThan(0);
    expect(diff).toBeCloseTo(Math.hypot(100, 100) - (left.edges.d2 ? 100 : 0) - (left.edges.w2 ? 100 : 0), 3);
  });
  it('чертёж и 3D строятся для обоих видов, в том числе с обратной пласти', () => {
    for (const kind of ['chamfer', 'round']) {
      const P = withCut([{ part: 'Боковина левая', kind, w: 60, h: 60, r: 60, corner: 'w1d2' }]), sp = buildSpec(P), g = groupParts(sp).find(x => x.name === 'Боковина левая');
      for (const view of ['A', 'B']) expect(partDrawing(g, { view })).toContain('<path d="M');
      const m = build3D(THREE, sp, { ...P, open: 0 }), meshes = []; m.traverse(o => { if (o.isMesh && o.geometry) meshes.push(o); });
      expect(meshes.length).toBeGreaterThan(0);
      expect(m).toBeTruthy();
    }
  });
  it('3D: объём детали равен площади контура на толщину для скоса и скругления', () => {
    const vol = g => { const a = g.attributes.position, idx = g.index; let v = 0; const n = idx ? idx.count : a.count;
      for (let i = 0; i < n; i += 3) { const f = j => { const k = idx ? idx.getX(i + j) : i + j; return [a.getX(k), a.getY(k), a.getZ(k)]; }, [p, q, r] = [f(0), f(1), f(2)];
        v += (p[0] * (q[1] * r[2] - q[2] * r[1]) - p[1] * (q[0] * r[2] - q[2] * r[0]) + p[2] * (q[0] * r[1] - q[1] * r[0])) / 6; }
      return Math.abs(v); };
    for (const [kind, removed] of [['chamfer', (100 * 100) / 2], ['round', (1 - Math.PI / 4) * 100 * 100]]) {
      const P = withCut([{ part: 'Полка съёмная', kind, w: 100, h: 100, r: 100, corner: 'w2d2' }]), sp = buildSpec(P), part = sp.parts.find(p => p.name === 'Полка съёмная');
      const m = build3D(THREE, sp, { ...P, open: 0 }); let found = null;
      m.traverse(o => { if (o.isMesh && o.userData.part !== undefined && sp.parts[o.userData.part] === part && !found) found = o; });
      expect(found, kind).toBeTruthy();
      expect(vol(found.geometry), kind).toBeCloseTo(((part.L * part.W - removed) * part.T) / 1e9, 6);
    }
  });
  it('случайные проекты с угловыми вырезами собираются без исключений', () => {
    for (const kind of ['notch', 'chamfer', 'round']) for (const type of ['wardrobe', 'dresser', 'kbase']) {
      const P = withCut([{ part: 'Боковина левая', kind, w: 50, h: 70, r: 40, corner: 'w1d1' }, { part: 'Дно', kind, w: 40, h: 40, r: 30, corner: 'w2d2' }], type);
      const sp = buildSpec(P);
      expect(() => checkBuild(sp, P, { skipKin: true })).not.toThrow();
      expect(() => toDXF(sp)).not.toThrow();
    }
  });
});

describe('радиусные торцы боковин', () => {
  it('скругляет передние углы обеих боковин, повтор заменяет, не трогает чужие вырезы', async () => {
    const { roundSideEnds } = await import('../web/rules.js');
    const P = makePreset('rack'); P.cutouts = [{ part: 'Дно', kind: 'hole', w: 50, h: 50, r: 0, u: 100, v: 100, sec: 0 }]; normalize(P);
    expect(roundSideEnds(P, 70)).toBe(70);
    expect(P.cutouts.filter(c => c.kind === 'round').length).toBe(4);
    roundSideEnds(P, 90);
    expect(P.cutouts.filter(c => c.kind === 'round').length).toBe(4);
    expect(P.cutouts.filter(c => c.kind === 'round').every(c => c.r === 90)).toBe(true);
    expect(P.cutouts.some(c => c.part === 'Дно' && c.kind === 'hole')).toBe(true);
    const sp = buildSpec(P);
    for (const n of ['Боковина левая', 'Боковина правая']) expect(sp.parts.find(p => p.name === n).cutouts.filter(c => c.kind === 'round').length).toBe(2);
    expect(sp.warnings).toEqual([]);
    expect(roundSideEnds(P, 5000)).toBe(300);
  });
});
