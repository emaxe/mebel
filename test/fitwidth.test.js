import { describe, it, expect } from 'vitest';
import { makePreset, rulesOf, fitWidth, totalWidth, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';

describe('вписать в нишу по ширине', () => {
  for (const type of ['wardrobe', 'rack', 'dresser', 'tv', 'nightstand']) {
    it(`${type}: общая ширина совпадает с целью, секции в допустимых пределах`, () => {
      const P = makePreset(type), [lo, hi] = rulesOf(P).secW, n = P.sections.length, t = P.thickness;
      for (const W of [n * lo + (n + 1) * t + 7, Math.round((n * (lo + hi)) / 2) + (n + 1) * t + 3, n * hi + (n + 1) * t - 11]) {
        const got = fitWidth(P, W);
        expect(got).toBe(W);
        expect(totalWidth(P)).toBe(W);
        expect(buildSpec(normalize(P)).meta.W).toBe(W);
        for (const s of P.sections) { expect(s.width).toBeGreaterThanOrEqual(lo); expect(s.width).toBeLessThanOrEqual(hi); expect(Number.isInteger(s.width)).toBe(true); }
      }
    });
  }
  it('пропорции секций сохраняются при масштабировании', () => {
    const P = makePreset('wardrobe'); P.sections[0].width = 400; P.sections[1].width = 800; P.sections[2].width = 400;
    fitWidth(P, 1600 + 4 * P.thickness);
    expect(P.sections[1].width).toBeGreaterThan(P.sections[0].width);
    expect(Math.abs(P.sections[1].width - 2 * P.sections[0].width)).toBeLessThanOrEqual(2);
  });
  it('недостижимая ширина прижимается к ближайшей возможной', () => {
    const P = makePreset('wardrobe'), [lo, hi] = rulesOf(P).secW, n = P.sections.length, t = P.thickness;
    expect(fitWidth(P, 100)).toBe(n * lo + (n + 1) * t);
    expect(fitWidth(P, 99999)).toBe(n * hi + (n + 1) * t);
  });
  it('секция с упором в предел отдаёт остаток остальным', () => {
    const P = makePreset('wardrobe'), [lo] = rulesOf(P).secW, t = P.thickness;
    P.sections[0].width = lo; P.sections[1].width = 900; P.sections[2].width = 900;
    fitWidth(P, 2000 + 4 * t);
    expect(P.sections.reduce((a, s) => a + s.width, 0)).toBe(2000);
    expect(P.sections[0].width).toBeGreaterThanOrEqual(lo);
  });
});

import { sectionOfMessage } from '../web/rules.js';
describe('секция из текста замечания', () => {
  it('находит номер секции в разных формулировках', () => {
    expect(sectionOfMessage('Секция 2: ящик 90 мм слишком низкий', 3)).toBe(1);
    expect(sectionOfMessage('! «Фасад двери» (секция 3): дверь шире', 3)).toBe(2);
    expect(sectionOfMessage('✕ Детали пересекаются: «Полка» (секция 1) и «Штанга» (секция 1) (×2)', 3)).toBe(0);
  });
  it('возвращает null без номера или при выходе за число секций', () => {
    expect(sectionOfMessage('Задняя стенка разбита на 2 части', 3)).toBeNull();
    expect(sectionOfMessage('Секция 7: что-то', 3)).toBeNull();
    expect(sectionOfMessage('Секция 0: что-то', 3)).toBeNull();
  });
});
