import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { groupParts, nest, edgeSummary } from '../web/export.js';
import { DEFAULT_CATALOG, sanitizeCatalog, sheetFor, isTextured } from '../web/catalog.js';
import { estimate } from '../web/estimate.js';
import { renderProduction } from '../web/production-view.js';

const clone = o => JSON.parse(JSON.stringify(o));
const nestWith = (spec, cat) => nest(groupParts(spec), { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: cat.cut.kerf, trim: cat.cut.trim, minOffcut: cat.cut.minOffcut, stock: cat.stock });

describe('справочник: складские остатки', () => {
  it('по умолчанию пусто, мусор заменяется значениями по умолчанию', () => {
    expect(sanitizeCatalog({}).stock).toEqual([]);
    const c = sanitizeCatalog({ stock: [{ label: 5, T: 'x', L: '', W: null, qty: 2.7 }, 'мусор', null] });
    expect(c.stock.length).toBe(1);
    expect(c.stock[0]).toEqual({ label: 'ЛДСП Белый', T: 18, L: 800, W: 600, qty: 2 });
  });
  it('отрицательное количество становится нулём', () => {
    expect(sanitizeCatalog({ stock: [{ label: 'ЛДСП Белый', T: 18, L: 800, W: 600, qty: -3 }] }).stock[0].qty).toBe(0);
  });
});

describe('смета и сводка с остатками', () => {
  const setup = withStock => {
    const P = makePreset('tv'), cat = clone(DEFAULT_CATALOG);
    if (withStock) cat.stock = [{ label: `ЛДСП ${P.bodyName}`, T: P.thickness, L: 1200, W: 800, qty: 3 }];
    const spec = buildSpec(P), G = groupParts(spec), N = nestWith(spec, cat);
    return { P, cat, spec, G, N, est: estimate(spec, G, N, edgeSummary(G), cat, P) };
  };
  it('остатки не покупаются: листов в смете не больше, чем целых листов в раскрое', () => {
    const a = setup(false), b = setup(true);
    const sheetsQty = e => e.sections.flatMap(s => s.lines).filter(l => l.unit === 'лист').reduce((s, l) => s + l.qty, 0);
    expect(b.N.sheets.some(s => s.stock)).toBe(true);
    expect(sheetsQty(b.est)).toBe(b.N.sheets.filter(s => !s.stock).length);
    expect(sheetsQty(b.est)).toBeLessThanOrEqual(sheetsQty(a.est));
  });
  it('страница задания показывает остатки, порядок резов и линии резов', () => {
    const { P, cat } = setup(true);
    const { html } = renderProduction({ P, cat, projName: 'Т', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' });
    expect(html).toMatch(/остаток \d+\/\d+/);
    expect(html).toMatch(/\+ \d+ ост\./);
    expect(html).toMatch(/Порядок резов \(\d+\)/);
    expect(html).toMatch(/stroke="#c0392b" stroke-width="3" stroke-dasharray="20 10"/);
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it('без остатков страница не упоминает их', () => {
    const { P, cat } = setup(false);
    const { html } = renderProduction({ P, cat, projName: 'Т', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' });
    expect(html).not.toMatch(/\+ \d+ ост\./);
    expect(html).toMatch(/Порядок резов/);
  });
});
