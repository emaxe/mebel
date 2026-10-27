import { describe, it, expect } from 'vitest';
import { loadCatalog, sanitizeCatalog, DEFAULT_CATALOG } from '../web/catalog.js';
import { estimate } from '../web/estimate.js';
import { shoppingList } from '../web/fittings.js';
import { buildSpec } from '../web/model.js';
import { makePreset } from '../web/rules.js';

const store = v => ({ getItem: () => (v === undefined ? null : JSON.stringify(v)) });

describe('справочник из ненадёжного источника', () => {
  it('мусор вместо справочника → значения по умолчанию', () => {
    for (const bad of [null, 5, 'x', [], { fittings: 'a', sheets: {}, decors: 3, hardware: null, edge: 5, works: [], cut: 'q', special: null }]) {
      const c = loadCatalog(store(bad));
      expect(Array.isArray(c.fittings) && c.fittings.length > 20).toBe(true);
      expect(Array.isArray(c.sheets) && c.sheets.length > 0).toBe(true);
      expect(c.cut.minOffcut.length).toBe(2);
      expect(typeof c.works.cut).toBe('number');
    }
  });
  it('строки вместо чисел и чужие типы в записях', () => {
    const c = sanitizeCatalog({ sheets: [{ mat: 5, T: 'x', L: '2800', W: null, price: 'abc' }, 7, null], fittings: [{ id: 3, kind: {}, price: '12', pack: 0, params: 'z' }], decors: [{ name: 1, color: 'javascript:1' }], markup: 'a' });
    expect(c.sheets).toEqual([{ mat: 'ЛДСП', T: 18, L: 2800, W: 2070, price: 0 }]);
    expect(c.fittings[0]).toMatchObject({ id: '', kind: '', price: 12, pack: 1, params: {} });
    expect(c.decors[0].color).toBe('#cccccc');
    expect(c.markup).toBe(DEFAULT_CATALOG.markup);
  });
  it('испорченный справочник не ломает смету и список покупок', () => {
    const c = sanitizeCatalog({ fittings: [{ kind: 'hinge', price: 'x' }], sheets: 'q', hardware: [{ match: 7 }] }), P = makePreset('wardrobe'), spec = buildSpec(P);
    expect(() => shoppingList(spec, c, P)).not.toThrow();
    expect(shoppingList(spec, c, P).every(l => Number.isFinite(l.sum))).toBe(true);
    void estimate;
  });
  it('нормальный справочник не меняется', () => {
    expect(sanitizeCatalog(JSON.parse(JSON.stringify(DEFAULT_CATALOG)))).toEqual(DEFAULT_CATALOG);
  });
});

import { sheetFor as sheetForNearest, DEFAULT_CATALOG as DC } from '../web/catalog.js';
describe('sheetFor: ближайшая толщина', () => {
  it('ЛДСП 19 берёт 18, а не первый лист списка', () => {
    expect(sheetForNearest(DC, 'ЛДСП Белый', 19).T).toBe(18);
  });
  it('точная толщина выбирается как есть', () => {
    expect(sheetForNearest(DC, 'МДФ Дуб, рамка', 19).T).toBe(19);
    expect(sheetForNearest(DC, 'ЛДСП Белый', 22).T).toBe(22);
  });
});
