// Проект из нескольких модулей (корпусов): P — основной корпус, P.modules — дополнительные. Без DOM.
// Модули стоят в ряд слева направо вплотную (плюс зазор gap), задние стенки на одной плоскости, подъём над полом y.
import { buildSpec } from './model.js';
import { normalize, MAX_MODULES } from './rules.js';
import { roomFrame, roomWarnings, rowExtent } from './room.js';
import { makePreset } from './rules.js';
import { normalizeWorktop, worktopParts, worktopWarnings } from './worktop.js';

const clone = o => JSON.parse(JSON.stringify(o));
const PRIMARY_KEYS = ['modules', 'modName', 'modY'];

export const moduleCount = root => 1 + (Array.isArray(root.modules) ? root.modules.length : 0);
export const isMulti = root => moduleCount(root) > 1;

/** Корпус модуля i: нулевой — сам проект, остальные — вложенные. */
export const cabinetOf = (root, i) => (i === 0 ? root : root.modules[i - 1].P);

/** Сводка по модулям: [{ i, name, gap, y, P }]. Для основного корпуса P — сам проект (изменения видны сразу). */
export function moduleList(root) {
  const list = [{ i: 0, name: root.modName || 'Корпус 1', gap: 0, y: root.modY || 0, over: false, turn: '', P: root }];
  (root.modules || []).forEach((m, k) => list.push({ i: k + 1, name: m.name, gap: m.gap || 0, y: m.y || 0, over: !!m.over, turn: m.turn || '', P: m.P }));
  return list;
}

const detach = P => { const c = { ...P }; for (const k of PRIMARY_KEYS) delete c[k]; return c; };

/** Развернуть проект в независимые записи: [{ name, gap, y, P }] (основной корпус отделяется от проекта). */
const toItems = root => moduleList(root).map(m => ({ name: m.name, gap: m.gap, y: m.y, over: m.over, turn: m.turn, P: m.i === 0 ? detach(root) : m.P }));

/** Собрать проект обратно из записей: первая становится основным корпусом, остальные — модулями. root меняется на месте. */
function fromItems(root, items) {
  const [first, ...rest] = items;
  const room = root.room;
  for (const k of Object.keys(root)) delete root[k];
  Object.assign(root, first.P);
  if (room) root.room = room;
  root.modName = first.name; if (first.y) root.modY = first.y;
  if (rest.length) root.modules = rest.map(m => ({ name: m.name, gap: m.gap, y: m.y, ...(m.over ? { over: true } : {}), ...(m.turn ? { turn: m.turn } : {}), P: m.P }));
  return normalize(root);
}

const uniqueName = (items, base) => { const used = new Set(items.map(m => m.name)); if (!used.has(base)) return base; let n = 2; while (used.has(`${base} ${n}`)) n++; return `${base} ${n}`; };

/** Добавить модуль после модуля `after` (по умолчанию в конец). Возвращает индекс нового модуля или -1, если достигнут предел. */
export function addModule(root, P, { name = 'Модуль', gap = 0, y = 0, over = false, turn = '', after = moduleCount(root) - 1 } = {}) {
  if (moduleCount(root) >= MAX_MODULES) return -1;
  const items = toItems(root), at = Math.max(0, Math.min(after, items.length - 1)) + 1;
  items.splice(at, 0, { name: uniqueName(items, name), gap, y, over, turn, P: clone(P) });
  fromItems(root, items);
  return at;
}

export function duplicateModule(root, i) {
  const items = toItems(root), src = items[i];
  if (!src || items.length >= MAX_MODULES) return -1;
  items.splice(i + 1, 0, { name: uniqueName(items, `${src.name} (копия)`), gap: src.gap, y: src.y, over: src.over, turn: src.turn, P: clone(src.P) });
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
  items[0].gap = 0; items[0].over = false; items[0].turn = '';
  fromItems(root, items);
  return j;
}

/** Переименовать, сменить зазор или подъём модуля. */
export function setModuleProps(root, i, { name, gap, y, over, turn }) {
  if (i === 0) {
    if (name !== undefined) root.modName = name;
    if (y !== undefined) root.modY = y;
  } else {
    const m = root.modules[i - 1];
    if (name !== undefined) m.name = name;
    if (gap !== undefined) m.gap = gap;
    if (y !== undefined) m.y = y;
    if (over !== undefined) m.over = !!over;
    if (turn !== undefined) { if (turn) m.turn = turn; else delete m.turn; }
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
/** Проект целиком; при заданном помещении (root.room) добавляет привязку к стенам (frame) и замечания по размещению. */
export function buildProject(root, opts = {}) {
  const r = buildLayout(root, opts), room = root.room;
  if (!room) return r;
  const rw = roomWarnings(r, room);
  return { ...r, room, frame: roomFrame(r, room), warnings: [...r.warnings, ...rw], spec: rw.length ? { ...r.spec, warnings: [...r.spec.warnings, ...rw] } : r.spec };
}

function buildLayout(root, { hwFor } = {}) {
  const list = moduleList(root);
  const mods = list.map(m => ({ ...m, spec: buildSpec(m.P, { ...(hwFor ? { hw: hwFor(m.P) } : {}), ...(m.i && root.overrides ? { inherit: root.overrides } : {}) }) }));
  const wt = normalizeWorktop(root.countertop);
  if (mods.length === 1) {
    const m = { ...mods[0], x: 0, y: 0, z: 0, rot: 0, run: 0, s: 0, left: 0, W: mods[0].spec.meta.W, H: mods[0].spec.meta.H, D: mods[0].spec.meta.D };
    const worktops = worktopParts([m], wt);
    const warnings = worktopWarnings(worktops);
    return { mods: [m], spec: worktops.length ? { ...m.spec, parts: [...m.spec.parts, ...worktops], warnings: [...m.spec.warnings, ...warnings] } : m.spec, multi: false, worktops, warnings };
  }

  // раскладка: основной ряд вдоль стены A; модуль с turn начинает второй ряд вдоль соседней стены (угол справа или слева)
  let cursor = 0, prevS = 0, run = 0, turn = '';
  mods.forEach((m, k) => {
    m.W = m.spec.meta.W; m.H = m.spec.meta.H; m.D = m.spec.meta.D;
    if (k > 0 && !m.over && m.turn && !turn) { turn = m.turn; run = 1; cursor = 0; prevS = 0; }
    m.run = run;
    m.s = k && m.over ? prevS + m.gap : cursor + (k ? m.gap : 0);
    m.left = m.s;
    cursor = Math.max(cursor, m.s + m.W); prevS = m.s;
  });
  const runA = mods.filter(m => m.run === 0), totalA = Math.max(...runA.map(m => m.s + m.W)), DA = Math.max(...runA.map(m => m.D));
  for (const m of mods) {
    if (m.run === 0) { m.x = m.s + m.W / 2; m.z = m.D / 2; m.rot = 0; }
    else if (turn === 'R') { m.x = totalA - m.D / 2; m.z = DA + m.s + m.W / 2; m.rot = -Math.PI / 2; }
    else { m.x = m.D / 2; m.z = DA + m.s + m.W / 2; m.rot = Math.PI / 2; }
  }
  // фальшпанель стоит лицом вровень с фасадами ряда, остальные корпуса — спиной к стене
  const runD = [0, 1].map(r => Math.max(0, ...mods.filter(m => m.run === r && m.P.type !== 'kfill').map(m => m.D)));
  for (const m of mods) {
    if (m.P.type !== 'kfill' || !runD[m.run]) continue;
    if (m.run === 0) m.z = runD[0] - m.D / 2;
    else if (turn === 'R') m.x = totalA - runD[1] + m.D / 2;
    else m.x = runD[1] - m.D / 2;
  }
  const ext = m => (m.run === 0 ? [m.x - m.W / 2, m.x + m.W / 2, m.z - m.D / 2, m.z + m.D / 2] : [m.x - m.D / 2, m.x + m.D / 2, m.z - m.W / 2, m.z + m.W / 2]);
  const boxes = mods.map(ext), minX = Math.min(...boxes.map(b => b[0])), maxX = Math.max(...boxes.map(b => b[1])), minZ = Math.min(...boxes.map(b => b[2])), maxZ = Math.max(...boxes.map(b => b[3]));
  const total = maxX - minX, Dmax = maxZ - minZ;
  for (const m of mods) { m.x -= (minX + maxX) / 2; m.z -= (minZ + maxZ) / 2; }

  const parts = [], extras = [], hw = new Map(), hwx = new Map(), warnings = [];
  for (const m of mods) {
    const pl = placed(m.spec, m.i, [m.x, m.y, m.z]);
    parts.push(...pl.parts); extras.push(...pl.extras);
    for (const [k, q] of m.spec.hw) hw.set(k, (hw.get(k) || 0) + q);
    for (const e of m.spec.hwx) { const key = `${e.name}|${e.stage}`, cur = hwx.get(key); if (cur) cur.qty += e.qty; else hwx.set(key, { ...e }); }
    for (const w of m.spec.warnings) warnings.push(`${m.name}: ${w}`);
  }
  const cornerMod = mods.find(m => m.spec.meta.corner);
  if (turn && cornerMod && cornerMod.P.cornerSide !== (turn === 'L' ? 'left' : 'right')) warnings.push(`${cornerMod.name}: угол ${cornerMod.P.cornerSide === 'right' ? 'справа' : 'слева'}, а второй ряд повёрнут ${turn === 'L' ? 'влево' : 'вправо'}: развернитесь в одну сторону`);
  const worktops = worktopParts(mods, wt);
  parts.push(...worktops);
  const wtWarn = worktopWarnings(worktops);
  warnings.push(...wtWarn);
  const H = Math.max(...mods.map(m => m.y + m.H));
  const spec = {
    parts, extras, hwx: [...hwx.values()], hw: [...hw.entries()], warnings,
    meta: { W: total, H, D: Dmax, yB: 0, yT: H, ih: H, sections: [], modules: mods.map(m => ({ i: m.i, name: m.name, x: m.x, y: m.y, z: m.z, rot: m.rot, run: m.run, W: m.W, H: m.H, D: m.D, meta: m.spec.meta })) },
  };
  return { mods, spec, multi: true, worktops, warnings: wtWarn };
}

/** Закрыть остаток стены A фальшпанелью: после последнего модуля ряда. Возвращает { ok, width } или { ok: false, reason }. Для ряда с углом справа не поддерживается. */
export function fillWall(root) {
  const room = root.room;
  if (!room) return { ok: false, reason: 'помещение не задано' };
  const proj = buildProject(root), f = proj.frame;
  if (f.corner === 'R') return { ok: false, reason: 'ряд с углом справа: остаток слева закройте вручную' };
  const row = proj.mods.filter(m => m.run === 0 && !m.over);
  if (!row.length) return { ok: false, reason: 'нет модулей на полу вдоль стены A' };
  const last = row.reduce((a, m) => (f.place(m).u1 > f.place(a).u1 ? m : a)), free = room.w - Math.max(rowExtent(proj, room).u1, f.place(last).u1);
  if (free < 20) return { ok: false, reason: 'свободного места меньше 20 мм' };
  if (free > 600) return { ok: false, reason: `остаток ${Math.round(free)} мм больше 600 мм: добавьте шкаф` };
  const filler = makePreset('kfill', { frontName: last.P.frontName, frontColor: last.P.frontColor, frontT: last.P.frontT });
  filler.height = last.P.type === 'kbase' || last.P.type === 'kcorner' ? last.P.height : filler.height;
  filler.sections[0].width = Math.round(free);
  const i = addModule(root, filler, { name: 'Фальшпанель', after: last.i });
  return i < 0 ? { ok: false, reason: 'достигнут предел модулей' } : { ok: true, width: Math.round(free), index: i };
}
