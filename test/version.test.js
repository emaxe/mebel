import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_VERSION } from '../web/version.js';

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('версия приложения', () => {
  it('совпадает с package.json и последним релизом в CHANGELOG', () => {
    expect(JSON.parse(read('server/package.json')).version).toBe(APP_VERSION);
    expect(JSON.parse(read('test/package.json')).version).toBe(APP_VERSION);
    expect(/^## \[(\d+\.\d+\.\d+)\]/m.exec(read('CHANGELOG.md'))[1]).toBe(APP_VERSION);
  });
});
