// Несколько проектов в localStorage. Без DOM. Текущий проект дублируется в 'mebel-v3', его читает production.html.
import { SCHEMA, schemaOf } from './rules.js';

export const PROJECTS_KEY = 'mebel-projects';
export const CURRENT_KEY = 'mebel-current';
export const LEGACY_KEY = 'mebel-v3';
export const NAME_KEY = 'mebel-v3-name';

const read = (st, k) => { try { return JSON.parse(st.getItem(k) || 'null'); } catch { return null; } };
const write = (st, k, v) => { try { st.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; } catch { return false; } };

/** Подписка на запись списка (синхронизация с сервером): hooks.onSave = () => … */
export const hooks = { onSave: null };

export const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Список проектов {id: {name, updated, P}}; первый запуск переносит единственный старый проект. */
export function loadProjects(st = globalThis.localStorage, fallbackP = null) {
  let db = read(st, PROJECTS_KEY);
  if (!db || typeof db !== 'object' || !Object.keys(db).length) {
    db = {};
    const old = read(st, LEGACY_KEY) || fallbackP;
    if (old) db[newId()] = { name: 'Мой проект', updated: Date.now(), P: old };
  }
  let cur = st.getItem ? st.getItem(CURRENT_KEY) : null;
  if (!db[cur]) cur = Object.keys(db)[0] || null;
  return { db, cur };
}

/** Возвращает false, если запись не удалась (например, localStorage переполнен). */
export function saveProjects(db, cur, st = globalThis.localStorage) {
  let ok = write(st, PROJECTS_KEY, db);
  if (cur) { write(st, CURRENT_KEY, cur); write(st, LEGACY_KEY, db[cur].P); write(st, NAME_KEY, db[cur].name); }
  if (hooks.onSave) try { hooks.onSave(); } catch { /* подписчик не должен ломать сохранение */ }
  return ok;
}

/** Уникальное имя: «Шкаф» → «Шкаф (2)». */
export function uniqueName(db, name) {
  const base = (name || 'Проект').trim() || 'Проект', used = new Set(Object.values(db).map(p => p.name));
  if (!used.has(base)) return base;
  let i = 2; while (used.has(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

export const projectFile = (db, id) => JSON.stringify({ app: 'mebel', version: 1, name: db[id].name, P: db[id].P }, null, 2);

/** Разбор файла .json: принимает файл проекта или «голые» параметры. Возвращает {name, P} или бросает Error. */
export function parseProjectFile(text) {
  let o; try { o = JSON.parse(text); } catch { throw new Error('Файл не похож на JSON'); }
  const P = o && o.P ? o.P : o;
  if (!P || typeof P !== 'object' || !Array.isArray(P.sections) || !P.sections.length) throw new Error('В файле нет проекта: нужны секции (sections)');
  if (schemaOf(P) > SCHEMA) throw new Error('Проект создан в более новой версии конструктора: обновите приложение');
  return { name: (o && o.name) || 'Импорт', P };
}
