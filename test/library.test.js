import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { addModule, buildProject, moduleList } from '../web/project.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { TEMPLATES, libraryEntry, sanitizeLibrary, instantiate, MAX_LIBRARY } from '../web/library.js';
import { sanitizeCatalog, DEFAULT_CATALOG } from '../web/catalog.js';

const keep = { bodyColor: '#abcdef', bodyName: 'Тест', frontColor: '#112233', frontName: 'Графит', metalColor: '#c8ccd0' };

describe('библиотека корпусов', () => {
  it('каждый шаблон собирается без замечаний и ошибок проверки, цвета берутся из проекта', () => {
    for (const t of TEMPLATES) {
      const { P } = instantiate(t, keep), sp = buildSpec(P);
      expect(sp.warnings, t.id).toEqual([]);
      expect(checkBuild(sp, P, { skipKin: true }).filter(f => f.level === 'error'), t.id).toEqual([]);
      expect(P.bodyName, t.id).toBe('Тест'); expect(P.type).toBe(t.type);
    }
  });
  it('шаблоны разные и идентификаторы уникальны', () => {
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length);
    const items = id => instantiate(TEMPLATES.find(t => t.id === id), keep).P.sections[0];
    expect(items('k-drawers3').items.filter(i => i.type === 'drawer').length).toBe(3);
    expect(items('k-sink').items).toEqual([]); expect(items('k-sink').door).toBe('double');
    expect(items('w-lift').door).toBe('flapUp');
  });
  it('навесные шаблоны встают над предыдущим на 1400 мм', () => {
    const r = instantiate(TEMPLATES.find(t => t.id === 'w-door2'), keep);
    expect(r.over).toBe(true); expect(r.y).toBe(1400);
  });
  it('запись из модуля восстанавливает тот же корпус и положение', () => {
    const root = makePreset('kbase'); const w = makePreset('kwall'); w.sections[0].width = 700; normalize(w);
    addModule(root, w, { name: 'Мой навесной', over: true, y: 1500, after: 0 });
    const e = libraryEntry(root, 1, 'Мой шкаф');
    expect(e).toMatchObject({ name: 'Мой шкаф', over: true, y: 1500 });
    expect(e.P.modules).toBeUndefined();
    const back = instantiate(e);
    expect(back.P.sections[0].width).toBe(700);
    const r2 = makePreset('kbase'); addModule(r2, back.P, { name: back.name, over: back.over, y: back.y });
    expect(moduleList(r2)[1]).toMatchObject({ over: true, y: 1500 });
    expect(buildProject(r2).warnings).toEqual([]);
  });
  it('запись не делится ссылками с проектом', () => {
    const root = makePreset('kbase'), e = libraryEntry(root, 0, 'А');
    e.P.sections[0].width = 999;
    expect(root.sections[0].width).not.toBe(999);
    const a = instantiate(e), b = instantiate(e); a.P.sections[0].items.push({ type: 'shelf', y: 100 });
    expect(b.P.sections[0].items.length).not.toBe(a.P.sections[0].items.length);
  });
  it('справочник отбрасывает мусор и ограничивает размер', () => {
    expect(sanitizeLibrary('x')).toEqual([]);
    expect(sanitizeLibrary([null, { name: '', P: { sections: [{}] } }, { name: 'ok', P: { sections: [] } }, { name: 'ok', P: { sections: [{}] }, y: -5 }])).toEqual([{ name: 'ok', P: { sections: [{}] } }]);
    expect(sanitizeLibrary(Array.from({ length: 80 }, (_, i) => ({ name: 'n' + i, P: { sections: [{}] } }))).length).toBe(MAX_LIBRARY);
    expect(DEFAULT_CATALOG.library).toEqual([]);
    expect(sanitizeCatalog({ library: [{ name: 'a', P: { sections: [{}] } }, 5] }).library.length).toBe(1);
  });
});
