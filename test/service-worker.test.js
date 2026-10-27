import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const dir = new URL('../web/', import.meta.url);
const sw = readFileSync(new URL('service-worker.js', dir), 'utf8');
const assets = [...sw.matchAll(/'([^']+\.(?:js|html|webmanifest|svg|png))'/g)].map(m => m[1]);

describe('сервис-воркер', () => {
  it('в кеш попадают все модули клиента', () => {
    const modules = readdirSync(dir).filter(f => /\.(js|html)$/.test(f) && f !== 'service-worker.js');
    const missing = modules.filter(f => !assets.includes(f));
    expect(missing).toEqual([]);
  });
  it('каждый файл из списка кеша существует', () => {
    const gone = assets.filter(a => { try { statSync(new URL(a, dir)); return false; } catch { return true; } });
    expect(gone).toEqual([]);
  });
  it('версия кеша имеет вид mebel-vN', () => {
    expect(sw).toMatch(/^const VERSION = 'mebel-v\d+';/m);
  });
});
