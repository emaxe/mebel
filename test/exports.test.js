import { describe, it, expect } from 'vitest';
import { buildExport, FILE_EXPORTS } from '../web/exports.js';
import { DEFAULT_CATALOG } from '../web/catalog.js';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { buildProject } from '../web/project.js';

const ctx = (type = 'wardrobe') => {
  const P = makePreset(type), spec = buildSpec(P);
  return { proj: buildProject(P), root: P, P, spec, cat: structuredClone(DEFAULT_CATALOG), projectName: 'Тест' };
};

describe('выгрузки', () => {
  it('каждая выгрузка даёт имя, тип и непустые данные', () => {
    const c = ctx();
    for (const k of FILE_EXPORTS) {
      const f = buildExport(k, c);
      expect(f.name).toMatch(/^wardrobe_\d+x\d+x\d+/);
      expect(f.type).toMatch(/\//);
      expect(String(f.data).length).toBeGreaterThan(50);
    }
  });
  it('расширения и типы', () => {
    const c = ctx();
    expect(buildExport('csv', c).name.endsWith('.csv')).toBe(true);
    expect(buildExport('dxf', c).name.endsWith('.dxf')).toBe(true);
    expect(buildExport('cutmap', c).name.endsWith('_karta_raskroya.dxf')).toBe(true);
    expect(JSON.parse(buildExport('drill', c).data).parts.length).toBeGreaterThan(0);
  });
  it('кухонный тип выгружается без ошибок', () => {
    for (const k of FILE_EXPORTS) expect(() => buildExport(k, ctx('kbase'))).not.toThrow();
  });
  it('неизвестная выгрузка — ошибка', () => {
    expect(() => buildExport('xyz', ctx())).toThrow();
  });
});
