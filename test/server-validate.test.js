import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { addModule } from '../web/project.js';
import { checkProject, MAX_PROJECT_BYTES } from '../server/src/lib/validate.js';

describe('серверная проверка проекта', () => {
  it('проект из одного корпуса проходит', () => { expect(checkProject(makePreset('wardrobe'))).toBeNull(); });
  it('проект с модулями проходит', () => {
    const r = makePreset('wardrobe'); addModule(r, makePreset('dresser'), {}); addModule(r, makePreset('tv'), { y: 1500 });
    expect(checkProject(r)).toBeNull();
  });
  it('слишком большой проект отклоняется', () => {
    const r = makePreset('wardrobe'); r.junk = 'x'.repeat(MAX_PROJECT_BYTES);
    expect(checkProject(r)).toMatch(/слишком большой/);
  });
  it('мусор вместо модулей не роняет проверку', () => {
    const r = makePreset('wardrobe'); r.modules = [null, 5, { P: { sections: [] } }];
    expect(checkProject(r)).toBeNull();
  });
});
