import { describe, it, expect } from 'vitest';
import { shelfDeflection, maxShelfSpan, SAG_DIV } from '../web/norms.js';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';

describe('прогиб полки', () => {
  it('совпадает с ручным расчётом: 800×300×18, 80 кг/м², E=2800 МПа → 3,08 мм', () => {
    expect(shelfDeflection({ L: 800, depth: 300, T: 18 })).toBeCloseTo(3.075, 2);
  });
  it('растёт как пролёт⁴, падает как толщина³, пропорционален нагрузке, от глубины не зависит', () => {
    const base = shelfDeflection({ L: 600, depth: 300, T: 18 });
    expect(shelfDeflection({ L: 1200, depth: 300, T: 18 })).toBeCloseTo(base * 16, 6);
    expect(shelfDeflection({ L: 600, depth: 300, T: 36 })).toBeCloseTo(base / 8, 6);
    expect(shelfDeflection({ L: 600, depth: 300, T: 18, load: 160 })).toBeCloseTo(base * 2, 6);
    expect(shelfDeflection({ L: 600, depth: 600, T: 18 })).toBeCloseTo(base, 6);
  });
  it('предельный пролёт даёт прогиб ровно пролёт/250 и растёт с толщиной', () => {
    for (const T of [16, 18, 22, 25]) { const L = maxShelfSpan(T); expect(shelfDeflection({ L, depth: 400, T })).toBeCloseTo(L / SAG_DIV, 6); }
    expect(maxShelfSpan(16)).toBeLessThan(maxShelfSpan(18)); expect(maxShelfSpan(18)).toBeLessThan(maxShelfSpan(22));
  });
  it('при нагрузке по умолчанию пределы близки к прежним нормам: ~800 мм для 18, ~1000 для 22', () => {
    expect(maxShelfSpan(18)).toBeGreaterThan(780); expect(maxShelfSpan(18)).toBeLessThan(840);
    expect(maxShelfSpan(22)).toBeGreaterThan(960); expect(maxShelfSpan(22)).toBeLessThan(1020);
  });
});

describe('проверка прогиба в проекте', () => {
  const wide = (w, extra = {}) => { const P = makePreset('rack', extra); P.sections = [{ ...P.sections[0], width: w }]; return normalize(P); };
  const sag = P => checkBuild(buildSpec(P), P, { skipKin: true }).filter(f => f.code === 'sag');
  it('узкие полки не флагуются, широкие — с цифрами в сообщении', () => {
    expect(sag(wide(700))).toEqual([]);
    const s = sag(wide(1000));
    expect(s.length).toBeGreaterThan(0);
    expect(s[0].text).toMatch(/прогнётся на \d+,\d мм при нагрузке 80 кг\/м²/); expect(s[0].text).toMatch(/допустимо \d+,\d мм/); expect(s[0].text).toMatch(/предел пролёта \d+ мм/);
  });
  it('нагрузка проекта меняет результат: лёгкая снимает замечание, тяжёлая добавляет', () => {
    expect(sag(wide(900, { shelfLoad: 30 }))).toEqual([]);
    expect(sag(wide(700, { shelfLoad: 250 })).length).toBeGreaterThan(0);
  });
  it('толщина 22 мм снимает замечание для полки 950 мм', () => {
    expect(sag(wide(950)).length).toBeGreaterThan(0);
    expect(sag(wide(950, { thickness: 22 }))).toEqual([]);
  });
  it('нагрузка ограничивается нормализацией', () => {
    const P = makePreset('rack'); P.shelfLoad = 5; normalize(P); expect(P.shelfLoad).toBe(20);
    P.shelfLoad = 'x'; normalize(P); expect(P.shelfLoad).toBe(80); P.shelfLoad = 9999; normalize(P); expect(P.shelfLoad).toBe(250);
  });
});
