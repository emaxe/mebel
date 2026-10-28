import { describe, it, expect } from 'vitest';
import { createHistory } from '../web/history.js';

describe('история правок', () => {
  it('отмена и повтор возвращают снимки по порядку', () => {
    const h = createHistory();
    h.snap('a'); h.snap('b');
    expect(h.undo('c')).toBe('b');
    expect(h.undo('b')).toBe('a');
    expect(h.undo('a')).toBe(null);
    expect(h.redo('a')).toBe('b');
    expect(h.redo('b')).toBe('c');
    expect(h.redo('c')).toBe(null);
  });
  it('новая правка сбрасывает повтор', () => {
    const h = createHistory();
    h.snap('a'); h.undo('b');
    expect(h.canRedo).toBe(true);
    h.snap('c');
    expect(h.canRedo).toBe(false);
  });
  it('глубина ограничена лимитом', () => {
    const h = createHistory({ limit: 3 });
    for (const v of 'abcde') h.snap(v);
    const got = []; let cur = 'f', j;
    while ((j = h.undo(cur)) !== null) { got.push(j); cur = j; }
    expect(got).toEqual(['e', 'd', 'c']);
  });
  it('жест: begin один раз, end без изменений убирает запись', () => {
    const h = createHistory();
    h.begin('a'); h.begin('b'); h.end('a');
    expect(h.canUndo).toBe(false);
    h.begin('a'); h.end('x');
    expect(h.canUndo).toBe(true);
    expect(h.undo('x')).toBe('a');
  });
  it('end без begin ничего не делает; clear очищает', () => {
    const h = createHistory();
    h.end('a'); expect(h.canUndo).toBe(false);
    h.snap('a'); h.clear();
    expect(h.canUndo || h.canRedo).toBe(false);
  });
});
