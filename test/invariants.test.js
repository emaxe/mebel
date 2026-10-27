import { describe, it, expect } from 'vitest';
import { buildSpec } from '../web/model.js';
import { toDXF, groupParts, nest } from '../web/export.js';
import { randomProject } from './helpers.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe('DXF: структура', () => {
  for (const seed of SEEDS.slice(0, 12)) it(`проект ${seed}: пары кодов, секции и числа корректны`, () => {
    const bytes = Buffer.from(toDXF(buildSpec(randomProject(seed))));
    const lines = bytes.toString('latin1').split('\r\n');
    expect(lines.length % 2).toBe(0);
    let sections = 0, open = false;
    for (let i = 0; i < lines.length; i += 2) {
      const code = lines[i].trim(), val = lines[i + 1];
      expect(code, `строка ${i}`).toMatch(/^\d+$/);
      if (code === '0' && val === 'SECTION') { expect(open).toBe(false); open = true; sections++; }
      if (code === '0' && val === 'ENDSEC') { expect(open).toBe(true); open = false; }
      if (+code >= 10 && +code <= 59) expect(val, `${code}`).toMatch(/^-?\d+(\.\d+)?$/);
    }
    expect(open).toBe(false);
    expect(sections).toBe(2);
    expect(lines.slice(-2)).toEqual(['0', 'EOF']);
    expect(bytes.includes(0x3f)).toBe(bytes.toString('latin1').includes('?'));
  });
  it('в DXF нет символов вне cp1251 («?» только в исходном тексте)', () => {
    const txt = Buffer.from(toDXF(buildSpec(randomProject(3)))).toString('latin1');
    expect(txt).not.toMatch(/\?\d+ /);
  });
});

describe('раскрой: геометрия', () => {
  for (const seed of SEEDS) it(`проект ${seed}: детали внутри листа, без пересечений и с пропилом`, () => {
    const spec = buildSpec(randomProject(seed)), N = nest(groupParts(spec));
    const kerf = 4 - 1e-6;
    for (const sh of N.sheets) {
      const ps = sh.pieces, UL = sh.L - 2 * sh.trim, UW = sh.W - 2 * sh.trim;
      for (const a of ps) { expect(a.x).toBeGreaterThanOrEqual(-1e-6); expect(a.y).toBeGreaterThanOrEqual(-1e-6); expect(a.x + a.l).toBeLessThanOrEqual(UL + 1e-6); expect(a.y + a.w).toBeLessThanOrEqual(UW + 1e-6); }
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        const gapX = Math.max(b.x - (a.x + a.l), a.x - (b.x + b.l)), gapY = Math.max(b.y - (a.y + a.w), a.y - (b.y + b.w));
        expect(Math.max(gapX, gapY), `${a.no}×${b.no}`).toBeGreaterThanOrEqual(kerf);
      }
    }
  });
  it('количество разложенных деталей = количество деталей в группах', () => {
    const spec = buildSpec(randomProject(7)), G = groupParts(spec), N = nest(G);
    const need = G.filter(g => g.mat !== 'glass' && g.mat !== 'mirror').reduce((a, g) => a + g.qty, 0);
    expect(N.sheets.reduce((a, s) => a + s.pieces.length, 0) + N.over.length).toBe(need);
  });
});
