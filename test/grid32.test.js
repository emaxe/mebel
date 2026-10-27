import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { randomProject } from './helpers.js';

const grid = (type = 'wardrobe', mod = () => {}) => { const P = makePreset(type); P.grid32 = true; mod(P); return normalize(P); };
const gh = p => p.holes.filter(h => h.note === 'сетка 32');
const errors = (sp, P) => checkBuild(sp, P, { skipKin: true }).filter(f => f.level === 'error');

describe('сквозная сетка 32 мм', () => {
  it('выключена по умолчанию: отверстий сетки нет', () => {
    const sp = buildSpec(makePreset('wardrobe'));
    expect(sp.parts.every(p => gh(p).length === 0)).toBe(true);
  });
  it('на боковинах и перегородках отверстия Ø5 с шагом 32 по двум рядам', () => {
    const P = grid(), sp = buildSpec(P), L = sp.parts.find(p => p.name === 'Боковина левая');
    const hs = gh(L); expect(hs.length).toBeGreaterThan(40);
    expect(hs.every(h => h.d === 5 && h.f === 'B')).toBe(true);
    const rows = [...new Set(hs.map(h => Math.round(h.v)))]; expect(rows.length).toBe(2);
    for (const r of rows) { const us = hs.filter(h => Math.round(h.v) === r).map(h => h.u).sort((a, b) => a - b); expect(us.length).toBeGreaterThan(20); for (let i = 1; i < us.length; i++) expect(us[i] - us[i - 1]).toBeGreaterThanOrEqual(32 - 1e-6); }
    const R = sp.parts.find(p => p.name === 'Боковина правая'); expect(gh(R).every(h => h.f === 'A')).toBe(true);
    const dv = sp.parts.find(p => p.name === 'Перегородка'); expect(new Set(gh(dv).map(h => h.f))).toEqual(new Set(['A', 'B']));
  });
  it('отверстия сетки не накладываются на другие отверстия той же пласти', () => {
    const sp = buildSpec(grid());
    for (const p of sp.parts) for (const h of gh(p)) for (const o of p.holes) if (o !== h && (o.f === 'A' || o.f === 'B') && o.f === h.f && o.note !== 'сетка 32') expect(Math.hypot(o.u - h.u, o.v - h.v), p.name).toBeGreaterThanOrEqual(9);
  });
  it('фаза сетки совпадает со съёмной полкой на шаге 32: свои отверстия не дублируются', () => {
    const P = grid('rack'), sp = buildSpec(P);
    const L = sp.parts.find(p => p.name === 'Боковина левая'), seen = new Set();
    for (const h of L.holes.filter(h => h.f === 'B')) { const k = `${Math.round(h.u)}:${Math.round(h.v)}`; expect(seen.has(k), k).toBe(false); seen.add(k); }
  });
  it('сборка без замечаний и ошибок проверки, включая сквозные отверстия, для разных типов', () => {
    for (const type of ['wardrobe', 'rack', 'dresser', 'tv', 'kbase', 'kwall']) {
      const P = grid(type), sp = buildSpec(P);
      expect(sp.warnings, type).toEqual([]); expect(errors(sp, P), type).toEqual([]);
    }
  });
  it('случайные проекты с сеткой собираются без ошибок', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const P = randomProject(seed); P.grid32 = true; normalize(P);
      const sp = buildSpec(P);
      expect(errors(sp, P).filter(f => f.code === 'hole-through' || f.code === 'hole'), `seed ${seed}`).toEqual([]);
    }
  });
});
