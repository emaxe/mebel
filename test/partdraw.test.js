import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { groupParts, grainOf } from '../web/export.js';
import { partDrawing, chainPositions } from '../web/partdraw.js';
import { renderProduction } from '../web/production-view.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';

const circles = svg => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="([^"]+)"/g)].map(m => ({ x: +m[1], y: +m[2], filled: m[4] !== 'none' }));
const parts = name => { const spec = buildSpec(makePreset('wardrobe')); return groupParts(spec).find(g => g.name === name); };

describe('позиции размерных цепочек', () => {
  it('начинаются с 0, заканчиваются размером детали, по возрастанию без повторов', () => {
    const g = parts('Боковина левая');
    for (const [axis, size] of [['x', g.L], ['y', g.W]]) {
      const p = chainPositions(g.holes, axis, size);
      expect(p[0]).toBe(0); expect(p[p.length - 1]).toBe(size);
      expect(p).toEqual([...new Set(p)].sort((a, b) => a - b));
    }
  });
  it('число засечек ограничено, лишние мелкие отверстия отбрасываются', () => {
    const holes = Array.from({ length: 80 }, (_, i) => ({ f: 'A', u: 20 + i * 11, v: 30, d: i % 10 === 0 ? 8 : 5 }));
    expect(chainPositions(holes, 'x', 1000).length).toBeLessThanOrEqual(20);
  });
  it('торцевые отверстия не создают засечек', () => {
    expect(chainPositions([{ f: 'w1', u: 0, v: 50, d: 5 }, { f: 'd2', u: 77, v: 600, d: 8 }], 'x', 800)).toEqual([0, 800]);
  });
});

describe('чертёж детали', () => {
  it('все отверстия на пластях нарисованы, свои сплошные, чужие пунктиром', () => {
    const g = parts('Боковина левая');
    const faces = g.holes.filter(h => h.f === 'A' || h.f === 'B');
    expect(partDrawing(g, { view: 'A' }) && circles(partDrawing(g)).length).toBe(faces.length);
    expect(circles(partDrawing(g)).filter(c => c.filled).length).toBe(faces.filter(h => h.f === 'A').length);
    expect(circles(partDrawing(g, { view: 'B' })).filter(c => c.filled).length).toBe(faces.filter(h => h.f === 'B').length);
  });
  it('вид B зеркален по оси X: суммарный сдвиг отверстий симметричен', () => {
    const g = parts('Боковина левая'), a = circles(partDrawing(g)), b = circles(partDrawing(g, { view: 'B' }));
    const ox = 64, w = Math.max(...a.map(c => c.x)) - ox;
    const mid = xs => xs.reduce((s, v) => s + v, 0) / xs.length;
    const full = Math.min((900 - 64 - 96) / g.L, (300 - 44 - 78) / g.W) * g.L;
    expect(mid(a.map(c => c.x)) + mid(b.map(c => c.x))).toBeCloseTo(2 * ox + full, 0);
    expect(w).toBeGreaterThan(0);
  });
  it('стрелка волокон только при текстуре и по правильной оси', () => {
    const g = parts('Боковина левая');
    expect(partDrawing(g)).not.toMatch(/data-grain/);
    expect(partDrawing(g, { grain: 'L' })).toMatch(/data-grain="L"/);
    expect(partDrawing(g, { grain: 'W' })).toMatch(/data-grain="W"/);
  });
  it('подписи отрезков цепочки равны разностям координат отверстий', () => {
    const g = parts('Боковина левая'), svg = partDrawing(g);
    const segs = [...svg.matchAll(/data-seg="([^"]+)"/g)].map(m => +m[1].replace(',', '.'));
    expect(segs.length).toBeGreaterThan(0);
    const xs = chainPositions(g.holes, 'x', g.L), ys = chainPositions(g.holes, 'y', g.W);
    const exp = new Set([...xs.slice(1).map((v, i) => v - xs[i]), ...ys.slice(1).map((v, i) => v - ys[i])].map(v => Math.round(v * 10) / 10));
    for (const sg of segs) expect(exp.has(sg), String(sg)).toBe(true);
  });
  it('габаритные размеры подписаны', () => {
    const g = parts('Боковина левая'), svg = partDrawing(g), f = v => String(Math.round(v * 10) / 10).replace('.', ',');
    expect(svg).toContain(`>${f(g.L)}</text>`); expect(svg).toContain(`>${f(g.W)}</text>`);
  });
});

describe('направление волокон', () => {
  it('цоколь по длине, фасад по высоте, явное поле имеет приоритет', () => {
    expect(grainOf({ plane: 'xy', L: 2400, W: 80 })).toBe('L');
    expect(grainOf({ plane: 'xy', L: 394, W: 2216 })).toBe('W');
    expect(grainOf({ plane: 'xz', L: 500, W: 600 })).toBe('L');
    expect(grainOf({ plane: 'xy', L: 394, W: 2216, grain: 'L' })).toBe('L');
  });
});

describe('страница задания', () => {
  it('в чертежах есть вид B для деталей с отверстиями на тыльной пласти и стрелки волокон для декора', () => {
    const P = makePreset('wardrobe'); P.bodyName = 'Дуб';
    const cat = JSON.parse(JSON.stringify(DEFAULT_CATALOG)); if (!cat.decors.find(d => d.name === 'Дуб')) cat.decors.push({ name: 'Дуб', textured: true });
    const { html } = renderProduction({ P, cat, projName: 'Т', preview: null, shareToken: null, bought: new Set(), baseHref: 'http://x/' });
    expect(html).toMatch(/data-view="B"/);
    expect(html).toMatch(/data-grain=/);
    expect(html).not.toMatch(/NaN|undefined/);
  });
});

describe('отбор позиций цепочки при большом числе отверстий', () => {
  it('сначала крупные отверстия: конфирматы не теряются среди полкодержателей', () => {
    const pins = Array.from({ length: 60 }, (_, i) => ({ f: 'B', u: 100 + i * 32, v: 59, d: 5 }));
    const conf = [{ f: 'A', u: 9, v: 50, d: 7 }, { f: 'A', u: 2111, v: 50, d: 7 }];
    const p = chainPositions([...pins, ...conf], 'x', 2120);
    expect(p).toContain(9); expect(p).toContain(2111);
    expect(p.length).toBeLessThanOrEqual(20);
    expect(p).toEqual([...new Set(p)].sort((a, b) => a - b));
  });
  it('цепочка боковины шкафа содержит крайние конфирматы', () => {
    const g = parts('Боковина левая'), p = chainPositions(g.holes, 'x', g.L);
    expect(p.length).toBeGreaterThan(2);
    expect(p).toContain(9);
  });
});
