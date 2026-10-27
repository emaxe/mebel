import { describe, it, expect } from 'vitest';
import { makePreset, moveItem, itemHeight, innerH, moveDivider, moveZoneSplit, normalize, totalWidth } from '../web/rules.js';
import { buildSpec } from '../web/model.js';

const mk = items => ({ items });
const ctx = { t: 18, ih: 1000 };

describe('перетаскивание элементов секции', () => {
  it('привязка к шагу 32 и свободный ход без привязки', () => {
    const s = mk([{ type: 'shelf', y: 300 }]);
    expect(moveItem(s, 0, 405, ctx)).toBe(416);
    expect(moveItem(s, 0, 405, { ...ctx, step: 0 })).toBe(405);
  });
  it('не выходит за пределы секции', () => {
    const s = mk([{ type: 'shelf', y: 300 }]);
    expect(moveItem(s, 0, -500, ctx)).toBe(0);
    expect(moveItem(s, 0, 5000, ctx)).toBe(1000 - 18);
  });
  it('не заходит на соседние полки и держит зазор', () => {
    const s = mk([{ type: 'shelf', y: 200 }, { type: 'shelf', y: 500 }, { type: 'shelf', y: 800 }]);
    expect(moveItem(s, 1, 100, { ...ctx, step: 0 })).toBe(200 + 18 + 20);
    expect(moveItem(s, 1, 900, { ...ctx, step: 0 })).toBe(800 - 18 - 20);
  });
  it('ящики стыкуются без зазора, штанга не мешает', () => {
    const s = mk([{ type: 'drawer', y: 0, h: 180 }, { type: 'shelf', y: 600 }, { type: 'rod', y: 500 }]);
    expect(moveItem(s, 1, 0, { ...ctx, step: 0 })).toBe(180);
    expect(itemHeight(s.items[2], 18)).toBe(0);
  });
  it('зажатый между соседями элемент остаётся на месте', () => {
    const s = mk([{ type: 'shelf', y: 100 }, { type: 'shelf', y: 130 }, { type: 'shelf', y: 160 }]);
    expect(moveItem(s, 1, 500, ctx)).toBe(130);
  });
});

describe('связь детали с элементом секции', () => {
  it('полки несут индекс элемента, не попадая в сериализацию', () => {
    const P = makePreset('rack'), spec = buildSpec(P);
    const shelves = spec.parts.filter(p => p.item !== undefined);
    expect(shelves.length).toBeGreaterThan(0);
    for (const p of shelves) {
      const it = P.sections[p.sec - 1].items[p.item];
      expect(['shelf', 'glass', 'fixed']).toContain(it.type);
      expect(Math.abs(p.c[1] - (spec.meta.yB + it.y + itemHeight(it, P.thickness) / 2))).toBeLessThan(0.01);
      expect(Object.keys(p)).not.toContain('item');
      expect(JSON.stringify(p)).not.toContain('"item"');
    }
  });
  it('сдвиг через moveItem перемещает деталь ровно на выбранную высоту', () => {
    const P = makePreset('rack'), s = P.sections[0], i = s.items.findIndex(x => x.type === 'shelf');
    s.items[i].y = moveItem(s, i, s.items[i].y + 64, { t: P.thickness, ih: innerH(P) });
    const p = buildSpec(P).parts.find(x => x.sec === 1 && x.item === i);
    expect(p.c[1]).toBeCloseTo(buildSpec(P).meta.yB + s.items[i].y + P.thickness / 2, 3);
  });
});

describe('перетаскивание перегородок', () => {
  it('перегородка двигает ширину соседей, общая ширина не меняется', () => {
    const P = makePreset('wardrobe'), W = totalWidth(P), [a, b] = [P.sections[0].width, P.sections[1].width];
    expect(moveDivider(P, 1, a + 103)).toBe(a + 100);
    expect(P.sections[0].width + P.sections[1].width).toBe(a + b);
    expect(totalWidth(P)).toBe(W);
    expect(moveDivider(P, 1, a + 103, { step: 0 })).toBe(a + 103);
  });
  it('секция не выходит за предел типа', () => {
    const P = makePreset('wardrobe'), [lo, hi] = [300, 1200], sum = P.sections[0].width + P.sections[1].width;
    expect(moveDivider(P, 1, 0)).toBe(Math.max(lo, sum - hi));
    expect(moveDivider(P, 1, 99999)).toBe(Math.min(hi, sum - lo));
    expect(P.sections[1].width).toBeGreaterThanOrEqual(lo);
  });
  it('после сдвига проект нормализуется и собирается', () => {
    const P = makePreset('wardrobe'); moveDivider(P, 2, 900); normalize(P);
    expect(buildSpec(P).warnings).toEqual([]);
  });
  it('полуперегородка зоны держит 100 мм до стенок', () => {
    const P = makePreset('wardrobe'), s = P.sections[1];
    s.zone = { pos: 'bottom', h: 400, split: 200, left: [], right: [] }; normalize(P);
    expect(moveZoneSplit(P, s, 0)).toBe(100);
    expect(moveZoneSplit(P, s, 99999)).toBe(s.width - P.thickness - 100);
    expect(moveZoneSplit(P, s, 333)).toBe(330);
    expect(moveZoneSplit(P, P.sections[0], 300)).toBe(0);
  });
});
