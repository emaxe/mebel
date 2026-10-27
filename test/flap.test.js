import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';

const errs = (spec, P) => [...new Set(checkBuild(spec, P).filter(f => f.level === 'error').map(f => `${f.code}: ${f.text}`))];
const flapProject = (door, keep = {}) => { const P = makePreset('tv', keep); P.sections[0].door = door; P.sections[0].width = 700; return P; };

describe('откидные и подъёмные фасады', () => {
  for (const door of ['flapDown', 'flapUp']) for (const base of ['legs', 'plinth', 'none']) {
    it(`${door} · ${base}: планки и стабилизаторы размечены, ошибок нет`, () => {
      const P = flapProject(door, { base }), spec = buildSpec(P);
      const flap = spec.parts.find(p => p.name === 'Фасад откидной');
      expect(flap, 'фасад есть').toBeTruthy();
      expect(flap.notes.join(' ')).not.toMatch(/по месту/);
      const cups = flap.holes.filter(h => h.note === 'чашка петли').length;
      const plates = spec.parts.flatMap(p => p.holes).filter(h => h.note === 'планка петли откидного').length;
      expect(plates).toBe(2 * cups);
      const stays = spec.parts.flatMap(p => p.holes).filter(h => /крепление (стабилизатора|газлифта)/.test(h.note)).length;
      expect(stays).toBe(4);
      expect(errs(spec, P)).toEqual([]);
    });
  }
  it('откидной фасад шириннее 900 мм получает три петли и шесть отверстий планок', () => {
    const P = flapProject('flapDown'); P.sections[0].width = 1000;
    const spec = buildSpec(P), flap = spec.parts.find(p => p.name === 'Фасад откидной');
    expect(flap.holes.filter(h => h.note === 'чашка петли').length).toBe(3);
    expect(spec.parts.flatMap(p => p.holes).filter(h => h.note === 'планка петли откидного').length).toBe(6);
    expect(errs(spec, P)).toEqual([]);
  });
  it('пропавшее отверстие планки — ошибка', () => {
    const P = flapProject('flapDown'), spec = buildSpec(P);
    const owner = spec.parts.find(p => p.holes.some(h => h.note === 'планка петли откидного'));
    owner.holes.splice(owner.holes.findIndex(h => h.note === 'планка петли откидного'), 1);
    expect(errs(spec, P).join('\n')).toMatch(/flap-plate/);
  });
});
