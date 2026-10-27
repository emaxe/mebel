import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { groupParts, nest, sawSize } from '../web/export.js';
import { toCutCSV, toDrillJSON, cuttable } from '../web/export-cut.js';
import { nestMapDXF, partContour } from '../web/dxf.js';
import { randomProject } from './helpers.js';

const parseCSV = t => t.replace(/^﻿/, '').split('\r\n').map(l => l.split(';').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"')));
const spec = () => buildSpec(makePreset('wardrobe'));

describe('CSV для сервисов раскроя', () => {
  it('одна строка на группу деталей, количество сходится, стекла нет', () => {
    const G = groupParts(spec()), rows = parseCSV(toCutCSV(G)), body = rows.slice(1);
    expect(body.length).toBe(cuttable(G).length);
    expect(body.reduce((a, r) => a + +r[9], 0)).toBe(cuttable(G).reduce((a, g) => a + g.qty, 0));
    expect(rows[0].length).toBe(17);
    for (const r of body) expect(r.length).toBe(17);
  });
  it('пильные размеры равны sawSize, чистовые — размеру детали', () => {
    const G = cuttable(groupParts(spec())), body = parseCSV(toCutCSV(G)).slice(1);
    G.forEach((g, i) => {
      const s = sawSize(g);
      expect(+body[i][5].replace(',', '.')).toBeCloseTo(s.L, 1); expect(+body[i][6].replace(',', '.')).toBeCloseTo(s.W, 1);
      expect(+body[i][7].replace(',', '.')).toBeCloseTo(g.L, 1); expect(+body[i][8].replace(',', '.')).toBeCloseTo(g.W, 1);
    });
  });
  it('текстурные детали: поворот запрещён, указана ось волокон', () => {
    const G = groupParts(spec()), plain = parseCSV(toCutCSV(G)).slice(1), tex = parseCSV(toCutCSV(G, { textured: () => true })).slice(1);
    expect(plain.every(r => r[10] === '1' && r[11] === '')).toBe(true);
    expect(tex.every(r => r[10] === '0' && ['Длина', 'Ширина'].includes(r[11]))).toBe(true);
  });
  it('материал и декор разделены, кавычки экранируются, есть BOM и нет NaN', () => {
    const G = groupParts(spec());
    G[0].name = 'Деталь "тест"';
    const t = toCutCSV(G);
    expect(t.charCodeAt(0)).toBe(0xfeff);
    expect(t).not.toMatch(/NaN|undefined/);
    const rows = parseCSV(t);
    expect(rows[1][1]).toBe('Деталь "тест"');
    expect(['ЛДСП', 'МДФ', 'ХДФ']).toContain(rows[1][2]);
  });
});

describe('карта раскроя DXF', () => {
  it('на каждый лист и каждую деталь по замкнутому контуру', () => {
    const N = nest(groupParts(spec())), text = Buffer.from(nestMapDXF(N)).toString('latin1');
    const count = ly => (text.match(new RegExp(`POLYLINE\\r\\n8\\r\\n${ly}\\r\\n`, 'g')) || []).length;
    expect(count('SHEET')).toBe(N.sheets.length);
    expect(count('PIECE')).toBe(N.sheets.reduce((a, s) => a + s.pieces.length, 0));
    expect(text).toMatch(/EOF\s*$/);
    expect(text).not.toMatch(/NaN|undefined/);
  });
  for (const seed of [4, 8, 15]) it(`случайный проект ${seed}: карта читается`, () => {
    const text = Buffer.from(nestMapDXF(nest(groupParts(buildSpec(randomProject(seed)))))).toString('latin1');
    const lines = text.split('\r\n');
    expect(lines.length % 2).toBe(0);
    for (let i = 0; i < lines.length; i += 2) expect(lines[i].trim()).toMatch(/^\d+$/);
  });
});

describe('операции ЧПУ в JSON', () => {
  it('валидный JSON, детали и отверстия не потеряны', () => {
    const G = groupParts(spec()), j = JSON.parse(toDrillJSON(G, { project: 'Т' }));
    expect(j.units).toBe('mm'); expect(j.project).toBe('Т');
    expect(j.parts.length).toBe(G.length);
    G.forEach((g, i) => { expect(j.parts[i].drilling.length).toBe(g.holes.length); expect(j.parts[i].grooves.length).toBe(g.grooves.length); expect(j.parts[i].quantity).toBe(g.qty); });
  });
  it('торцевые отверстия помечены как edge, сквозные — through с depth null', () => {
    const j = JSON.parse(toDrillJSON(groupParts(spec())));
    const ops = j.parts.flatMap(p => p.drilling);
    expect(ops.some(o => o.target === 'edge')).toBe(true);
    expect(ops.filter(o => o.through).every(o => o.depth === null)).toBe(true);
    expect(ops.filter(o => !o.through).every(o => Number.isFinite(o.depth))).toBe(true);
  });
  it('контур совпадает с partContour и замкнут в пределах габарита', () => {
    const G = groupParts(spec()), j = JSON.parse(toDrillJSON(G));
    G.forEach((g, i) => {
      expect(j.parts[i].contour.length).toBe(partContour(g.L, g.W, g.cutouts).length);
      for (const p of j.parts[i].contour) { expect(p.x).toBeGreaterThanOrEqual(-0.01); expect(p.x).toBeLessThanOrEqual(g.L + 0.01); expect(p.y).toBeGreaterThanOrEqual(-0.01); expect(p.y).toBeLessThanOrEqual(g.W + 0.01); }
    });
  });
});
