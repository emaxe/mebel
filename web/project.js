// Проект из нескольких модулей (корпусов): P — основной корпус, P.modules — дополнительные. Без DOM.
// Модули стоят в ряд слева направо вплотную (плюс зазор gap), задние стенки на одной плоскости, подъём над полом y.
import { buildSpec } from './model.js';
import { normalize, MAX_MODULES } from './rules.js';

const clone = o => JSON.parse(JSON.stringify(o));
const PRIMARY_KEYS = ['modules', 'modName', 'modY'];

export const moduleCount = root => 1 + (Array.isArray(root.modules) ? root.modules.length : 0);
export const isMulti = root => moduleCount(root) > 1;

/** Корпус модуля i: нулевой — сам проект, остальные — вложенные. */
export const cabinetOf = (root, i) => (i === 0 ? root : root.modules[i - 1].P);

/** Сводка по модулям: [{ i, name, gap, y, P }]. Для основного корпуса P — сам проект (изменения видны сразу). */
export function moduleList(root) {
  const list = [{ i: 0, name: root.modName || 'Корпус 1', gap: 0, y: root.modY || 0, P: root }];
  (root.modules || []).forEach((m, k) => list.push({ i: k + 1, name: m.name, gap: m.gap || 0, y: m.y || 0, P: m.P }));
  return list;
}

const detach = P => { const c = { ...P }; for (const k of PRIMARY_KEYS) delete c[k]; return c; };

/** Развернуть проект в независимые записи: [{ name, gap, y, P }] (основной корпус отделяется от проекта). */
const toItems = root => moduleList(root).map(m => ({ name: m.name, gap: m.gap, y: m.y, P: m.i === 0 ? detach(root) : m.P }));

/** Собрать проект обратно из записей: первая становится основным корпусом, остальные — модулями. root меняется на месте. */
function fromItems(root, items) {
  const [first, ...rest] = items;
  for (const k of Object.keys(root)) delete root[k];
  Object.assign(root, first.P);
  root.modName = first.name; if (first.y) root.modY = first.y;
  if (rest.length) root.modules = rest.map(m => ({ name: m.name, gap: m.gap, y: m.y, P: m.P }));
  return normalize(root);
}

const uniqueName = (items, base) => { const used = new Set(items.map(m => m.name)); if (!used.has(base)) return base; let n = 2; while (used.has(`${base} ${n}`)) n++; return `${base} ${n}`; };

/** Добавить модуль после модуля `after` (по умолчанию в конец). Возвращает индекс нового модуля или -1, если достигнут предел. */
export function addModule(root, P, { name = 'Модуль', gap = 0, y = 0, after = moduleCount(root) - 1 } = {}) {
  if (moduleCount(root) >= MAX_MODULES) return -1;
  const items = toItems(root), at = Math.max(0, Math.min(after, items.length - 1)) + 1;
  items.splice(at, 0, { name: uniqueName(items, name), gap, y, P: clone(P) });
  fromItems(root, items);
  return at;
}

export function duplicateModule(root, i) {
  const items = toItems(root), src = items[i];
  if (!src || items.length >= MAX_MODULES) return -1;
  items.splice(i + 1, 0, { name: uniqueName(items, `${src.name} (копия)`), gap: src.gap, y: src.y, P: clone(src.P) });
  fromItems(root, items);
  return i + 1;
}

/** Удалить модуль; единственный модуль не удаляется. Возвращает true при успехе. */
export function removeModule(root, i) {
  const items = toItems(root);
  if (items.length <= 1 || i < 0 || i >= items.length) return false;
  items.splice(i, 1);
  fromItems(root, items);
  return true;
}

/** Сдвинуть модуль на dir (−1 влево, +1 вправо). Возвращает новый индекс. */
export function moveModule(root, i, dir) {
  const items = toItems(root), j = i + dir;
  if (j < 0 || j >= items.length) return i;
  [items[i], items[j]] = [items[j], items[i]];
  items[0].gap = 0;
  fromItems(root, items);
  return j;
}

/** Переименовать, сменить зазор или подъём модуля. */
export function setModuleProps(root, i, { name, gap, y }) {
  if (i === 0) {
    if (name !== undefined) root.modName = name;
    if (y !== undefined) root.modY = y;
  } else {
    const m = root.modules[i - 1];
    if (name !== undefined) m.name = name;
    if (gap !== undefined) m.gap = gap;
    if (y !== undefined) m.y = y;
  }
  normalize(root);
}

const add3 = (a, d) => [a[0] + d[0], a[1] + d[1], a[2] + d[2]];

/** Копия спецификации модуля, сдвинутая на d; группы анимации клонируются, у модулей после первого их id получает префикс. */
function placed(spec, i, d) {
  const pre = i > 0 ? `m${i}_` : '', gmap = new Map();
  const grp = g => {
    if (!g) return g;
    if (!gmap.has(g)) {
      const n = { ...g, id: pre + g.id };
      if (g.follow) n.follow = pre + g.follow;
      if (g.pivot) n.pivot = add3(g.pivot, d);
      gmap.set(g, n);
    }
    return gmap.get(g);
  };
  const parts = spec.parts.map(p => {
    const n = { ...p, c: add3(p.c, d), group: grp(p.group), mod: i };
    if (p.item !== undefined) Object.defineProperty(n, 'item', { value: p.item });
    return n;
  });
  const extras = spec.extras.map(e => {
    const n = { ...e, group: grp(e.group), mod: i };
    if (e.c) n.c = add3(e.c, d);
    if (e.a) n.a = add3(e.a, d);
    if (e.b) n.b = add3(e.b, d);
    return n;
  });
  return { parts, extras };
}

/**
 * Собрать проект: спецификация каждого модуля и общая. Для проекта из одного корпуса общая спецификация — та же, что даёт buildSpec.
 * opts.hwFor(P) — параметры фурнитуры корпуса (resolveHw).
 */
export function buildProject(root, { hwFor } = {}) {
  const list = moduleList(root);
  const mods = list.map(m => ({ ...m, spec: buildSpec(m.P, hwFor ? { hw: hwFor(m.P) } : {}) }));
  if (mods.length === 1) { const m = mods[0]; return { mods: [{ ...m, x: 0, y: 0, z: 0, W: m.spec.meta.W, H: m.spec.meta.H, D: m.spec.meta.D }], spec: m.spec, multi: false }; }

  let left = 0;
  mods.forEach((m, k) => { left += k ? m.gap : 0; m.left = left; m.W = m.spec.meta.W; m.H = m.spec.meta.H; m.D = m.spec.meta.D; left += m.W; });
  const total = left, Dmax = Math.max(...mods.map(m => m.D));
  for (const m of mods) { m.x = m.left + m.W / 2 - total / 2; m.z = (m.D - Dmax) / 2; }

  const parts = [], extras = [], hw = new Map(), hwx = new Map(), warnings = [];
  for (const m of mods) {
    const pl = placed(m.spec, m.i, [m.x, m.y, m.z]);
    parts.push(...pl.parts); extras.push(...pl.extras);
    for (const [k, q] of m.spec.hw) hw.set(k, (hw.get(k) || 0) + q);
    for (const e of m.spec.hwx) { const key = `${e.name}|${e.stage}`, cur = hwx.get(key); if (cur) cur.qty += e.qty; else hwx.set(key, { ...e }); }
    for (const w of m.spec.warnings) warnings.push(`${m.name}: ${w}`);
  }
  const H = Math.max(...mods.map(m => m.y + m.H));
  const spec = {
    parts, extras, hwx: [...hwx.values()], hw: [...hw.entries()], warnings,
    meta: { W: total, H, D: Dmax, yB: 0, yT: H, ih: H, sections: [], modules: mods.map(m => ({ i: m.i, name: m.name, x: m.x, y: m.y, z: m.z, W: m.W, H: m.H, D: m.D, meta: m.spec.meta })) },
  };
  return { mods, spec, multi: true };
}
