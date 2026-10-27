import { describe, it, expect } from 'vitest';
import { makePreset, normalize, migrate, SCHEMA, schemaOf } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { projectFile, parseProjectFile } from '../web/projects.js';

describe('версия схемы проекта', () => {
  it('новый проект несёт текущую версию', () => {
    expect(makePreset('wardrobe').schema).toBe(SCHEMA);
  });
  it('старый проект без поля schema мигрирует без изменения расчёта', () => {
    const P = makePreset('dresser'), before = JSON.stringify(buildSpec(P).parts);
    const legacy = JSON.parse(JSON.stringify(P)); delete legacy.schema;
    expect(schemaOf(legacy)).toBe(0);
    expect(migrate(legacy)).toBe(true);
    expect(legacy.schema).toBe(SCHEMA);
    expect(JSON.stringify(buildSpec(normalize(legacy)).parts)).toBe(before);
  });
  it('мусорное значение schema трактуется как 0', () => {
    for (const bad of ['x', -1, 1.5, null, undefined]) expect(schemaOf({ schema: bad })).toBe(0);
  });
  it('проект из более новой версии не затирается нормализацией', () => {
    const P = makePreset('rack'); P.schema = SCHEMA + 5;
    normalize(P);
    expect(P.schema).toBe(SCHEMA + 5);
    expect(migrate(P)).toBe(false);
  });
  it('импорт файла из более новой версии отклоняется понятной ошибкой', () => {
    const P = makePreset('rack'); P.schema = SCHEMA + 1;
    expect(() => parseProjectFile(JSON.stringify({ app: 'mebel', P }))).toThrow(/новой версии/);
  });
  it('файл проекта сохраняет версию и читается обратно', () => {
    const P = makePreset('tv'), db = { a: { name: 'Т', P } };
    const back = parseProjectFile(projectFile(db, 'a'));
    expect(back.P.schema).toBe(SCHEMA);
    expect(back.name).toBe('Т');
  });
});
