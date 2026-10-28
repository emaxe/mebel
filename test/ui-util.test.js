import { describe, it, expect } from 'vitest';
import { TYPES, TYPE_INFO, typeLabel, dedupe, partIdOf, panelKey, keepColorsOf, hasDrawers, hasDoors, hasShelves, hasMoving, hinged, sectionSummary, stampOf, fmtDate, sizeOf } from '../web/ui-util.js';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { buildProject } from '../web/project.js';
import { randomProject } from './helpers.js';

describe('подписи и справочники', () => {
  it('у каждого типа есть подпись и описание', () => {
    for (const [k, l] of TYPES) { expect(l).toBeTruthy(); expect(TYPE_INFO[k]).toBeTruthy(); expect(typeLabel(k)).toBe(l); }
    expect(typeLabel('нет')).toBe('');
  });
  it('dedupe сворачивает повторы', () => {
    expect(dedupe(['a', 'b', 'a', 'a'])).toEqual(['a (×3)', 'b']);
    expect(dedupe([])).toEqual([]);
  });
});

describe('даты и размеры', () => {
  const now = new Date(2026, 9, 28, 15, 0);
  it('fmtDate: сегодня, вчера и дата', () => {
    expect(fmtDate(new Date(2026, 9, 28, 9, 5), now)).toBe('сегодня 09:05');
    expect(fmtDate(new Date(2026, 9, 27, 23, 59), now)).toBe('вчера');
    expect(fmtDate(new Date(2026, 8, 1, 12, 0), now)).toBe('01.09.2026');
  });
  it('sizeOf считает ширину по секциям и толщине', () => {
    const P = makePreset('wardrobe');
    const w = P.sections.reduce((a, s) => a + s.width, 0) + (P.sections.length + 1) * P.thickness;
    expect(sizeOf(P)).toBe(`${Math.round(w)}×${P.height}×${P.depth}`);
  });
});

describe('ключ панели замечаний и цвета', () => {
  it('вид и цвета не меняют ключ, размеры меняют', () => {
    const P = makePreset('wardrobe'), k = panelKey(P);
    expect(panelKey({ ...P, open: 1, hideDoors: true, showHoles: true, asmStep: 3, bodyColor: '#000' })).toBe(k);
    expect(panelKey({ ...P, height: P.height + 10 })).not.toBe(k);
  });
  it('keepColorsOf берёт только цвета', () => {
    const c = keepColorsOf(makePreset('rack'));
    expect(Object.keys(c).sort()).toEqual(['bodyColor', 'bodyName', 'frontColor', 'frontName', 'metalColor']);
  });
});

describe('предикаты по проекту', () => {
  it('на случайных проектах согласованы друг с другом', () => {
    for (let i = 1; i <= 60; i++) {
      const P = randomProject(i);
      expect(hasMoving(P)).toBe(hasDoors(P) || hasDrawers(P));
      if (P.doorType === 'sliding') expect(hinged(P)).toBe(false);
      expect(typeof hasShelves(P)).toBe('boolean');
    }
  });
  it('стеллаж без дверей и ящиков не подвижен', () => {
    const P = makePreset('rack');
    P.sections.forEach(s => { s.door = 'none'; s.items = s.items.filter(i => i.type === 'shelf'); });
    expect(hasDoors(P)).toBe(false);
    expect(hasDrawers(P)).toBe(false);
    expect(hasMoving(P)).toBe(false);
  });
});

describe('сводка секции, имя файла, id детали', () => {
  it('sectionSummary перечисляет ширину, дверь и полки', () => {
    const s = { width: 500, door: 'left', items: [{ type: 'shelf' }, { type: 'shelf' }, { type: 'drawer' }] };
    expect(sectionSummary(s, true)).toBe('500 мм · дверь левая · полок: 2 · ящиков: 1');
    expect(sectionSummary(s, false)).toBe('500 мм · полок: 2 · ящиков: 1');
  });
  it('stampOf: один корпус и проект из модулей', () => {
    const P = makePreset('rack'), spec = buildSpec(P), proj = buildProject(P);
    expect(stampOf(proj, P, P, spec)).toMatch(/^rack_\d+x\d+x\d+$/);
  });
  it('partIdOf отличает полку от обычной детали', () => {
    expect(partIdOf({ item: 2, sec: 1 })).toBe('item|1|2');
    expect(partIdOf({ name: 'Крышка', sec: 0, c: [1.4, 2.6, 3] })).toBe('Крышка|0|1,3,3');
  });
});
