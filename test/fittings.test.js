import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { shoppingList, cutStock, chooseModel } from '../web/fittings.js';
import { DEFAULT_CATALOG, sheetFor, isTextured } from '../web/catalog.js';
import { groupParts, nest, edgeSummary } from '../web/export.js';
import { estimate } from '../web/estimate.js';
import { randomProject } from './helpers.js';

const cat = JSON.parse(JSON.stringify(DEFAULT_CATALOG));

describe('раскрой хлыстов', () => {
  it('отрезки помещаются с учётом реза', () => {
    const bins = cutStock([1200, 1200, 800, 800, 500, 300], 3000, 3);
    for (const b of bins) expect(b.cuts.reduce((a, c) => a + c, 0) + 3 * (b.cuts.length - 1)).toBeLessThanOrEqual(3000);
    expect(bins.flatMap(b => b.cuts).sort()).toEqual([300, 500, 800, 800, 1200, 1200].sort());
    expect(bins.length).toBe(2);
  });
  it('отрезок длиннее хлыста — отдельный хлыст с пометкой', () => {
    const bins = cutStock([3500, 1000], 3000);
    expect(bins.length).toBe(2);
    expect(bins.find(b => b.cuts[0] === 3500).over).toBe(true);
  });
});

describe('список покупок', () => {
  const projects = [['wardrobe', {}], ['wardrobe', { doorType: 'sliding' }], ['wardrobe', { slide: 'hidden', hinge: 'wide', wallFix: true }], ['dresser', { handle: 'none', push: true }], ['tv', { handle: 'profile' }], ['nightstand', { slide: 'roller' }]];
  for (const [type, keep] of projects) {
    it(`${type} ${JSON.stringify(keep)}: купить не меньше, чем нужно`, () => {
      const P = makePreset(type, keep), spec = buildSpec(P), list = shoppingList(spec, cat, P);
      // всё из spec.hw попало в список
      const total = spec.hw.reduce((a, [, q]) => a + q, 0), need = list.reduce((a, l) => a + (l.kind === 'rod' || l.kind === 'kupeRail' || l.kind === 'kupeProfile' ? l.need : l.need), 0);
      expect(need).toBe(total);
      for (const l of list) {
        expect(l.packs).toBeGreaterThanOrEqual(1);
        if (!['rod', 'kupeRail', 'kupeProfile'].includes(l.kind)) expect(l.buy).toBeGreaterThanOrEqual(l.need + l.reserve);
        expect(l.price, `нет цены: ${l.title}`).not.toBeNull();
        expect(l.sum).toBeCloseTo(l.packs * l.price, 2);
      }
    });
  }

  it('мелкий крепёж берётся с запасом и округляется до упаковки', () => {
    const P = makePreset('wardrobe'), list = shoppingList(buildSpec(P), cat, P), c = list.find(l => l.kind === 'confirmat');
    expect(c.reserve).toBeGreaterThanOrEqual(2);
    expect(c.buy % c.pack).toBe(0);
    expect(c.buy).toBeGreaterThanOrEqual(c.need + c.reserve);
  });

  it('штанги режутся из хлыстов', () => {
    const P = makePreset('wardrobe'), list = shoppingList(buildSpec(P), cat, P), r = list.find(l => l.kind === 'rod');
    expect(r.unit).toBe('хлыст');
    expect(r.packs).toBeLessThanOrEqual(r.need);
    expect(r.note).toMatch(/×/);
  });

  it('выбранная модель попадает в список', () => {
    const c2 = JSON.parse(JSON.stringify(cat));
    c2.fittings.push({ id: 'hinge-brand', kind: 'hinge', variant: 'soft', brand: 'Brand', name: 'Петля X', art: 'X-1', price: 300, pack: 1, stockLen: 0, url: 'https://example.com/x' });
    const P = makePreset('wardrobe');
    expect(chooseModel(c2, P, 'hinge', 'soft').id).toBe('hinge-soft'); // по умолчанию — первая
    P.fittings = { 'hinge:soft': 'hinge-brand' };
    const l = shoppingList(buildSpec(P), c2, P).find(x => x.kind === 'hinge' && x.variant === 'soft');
    expect(l).toMatchObject({ brand: 'Brand', art: 'X-1', price: 300, url: 'https://example.com/x' });
  });

  it('смета по фурнитуре сходится со списком покупок', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const P = randomProject(seed), spec = buildSpec(P), G = groupParts(spec), E = edgeSummary(G);
      const N = nest(G, { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: cat.cut.kerf, trim: cat.cut.trim, minOffcut: cat.cut.minOffcut });
      const est = estimate(spec, G, N, E, cat, P), hw = est.sections.find(s => s.title === 'Фурнитура');
      const list = shoppingList(spec, cat, P);
      expect(hw.sum).toBeCloseTo(list.reduce((a, l) => a + l.sum, 0), 1);
      expect(hw.lines.length).toBe(list.length);
    }
  });

  it('старый справочник без моделей получает модели по умолчанию', async () => {
    const { loadCatalog } = await import('../web/catalog.js');
    const old = { ...DEFAULT_CATALOG }; delete old.fittings;
    const c = loadCatalog({ getItem: () => JSON.stringify(old) });
    expect(c.fittings.length).toBeGreaterThan(20);
  });
});
