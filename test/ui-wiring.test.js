import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = f => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');

describe('меню экспорта', () => {
  const html = read('index.html'), app = read('app.js');
  const buttons = [...new Set([...html.matchAll(/data-x="([^"]+)"/g)].map(m => m[1]))];
  const block = app.slice(app.indexOf('const EXPORTS = {'), app.indexOf('document.querySelectorAll(\'[data-x]\')'));
  const handlers = new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]));

  it('у каждой кнопки есть обработчик', () => {
    expect(buttons.filter(b => !handlers.has(b))).toEqual([]);
  });
  it('нет обработчиков без кнопки', () => {
    expect([...handlers].filter(h => !buttons.includes(h))).toEqual([]);
  });
  it('новые выгрузки присутствуют', () => {
    for (const k of ['cutcsv', 'cutmap', 'drill']) expect(buttons).toContain(k);
  });
});
