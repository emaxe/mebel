import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { toCSV, toDXF, groupParts, nest } from '../web/export.js';

describe('выгрузки открываются', () => {
  for (const type of ['wardrobe', 'rack', 'nightstand', 'dresser', 'tv']) {
    it(`${type}: CSV, DXF и раскрой`, () => {
      const P = makePreset(type), spec = buildSpec(P), G = groupParts(spec);
      const csv = toCSV(spec, 'Тест'), raw = toDXF(spec), N = nest(G);
      const dxf = typeof raw === 'string' ? raw : Buffer.from(raw).toString('latin1'); // DXF в cp1251
      expect(csv.length).toBeGreaterThan(200);
      expect(csv).not.toMatch(/undefined|NaN/);
      expect(dxf).toMatch(/SECTION/);
      expect(dxf).toMatch(/EOF/);
      expect(N.over).toEqual([]);
    });
  }
});
