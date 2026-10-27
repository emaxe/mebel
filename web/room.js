// Помещение проекта: стены A (основная), B (перпендикулярная при угловой кухне) и C (напротив A при П-образной), потолок, проёмы и плинтус. Без DOM: данные, привязка модулей к стенам и проверки.
import { footprint } from './plan.js';

export const ROOM_DEFAULT = { w: 3600, d: 2800, h: 2700, x: 0, skirt: 0, skirtT: 15, tol: 0, openings: [] };
export const OPENING_KINDS = { door: { label: 'Дверь', w: 900, h: 2050, y: 0 }, window: { label: 'Окно', w: 1200, h: 1300, y: 900 } };
export const MAX_OPENINGS = 12;

const num = (v, lo, hi, d) => { const n = Math.round(+v); return Number.isFinite(n) && v !== '' && v !== null ? Math.max(lo, Math.min(hi, n)) : d; };

/** Привести помещение к допустимому виду или вернуть null (помещения нет). Проём лежит внутри своей стены и потолка. */
export function normalizeRoom(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const w = num(r.w, 500, 20000, ROOM_DEFAULT.w), d = num(r.d, 500, 20000, ROOM_DEFAULT.d), h = num(r.h, 1500, 5000, ROOM_DEFAULT.h);
  const out = { w, d, h, x: num(r.x, 0, 20000, 0), skirt: num(r.skirt, 0, 300, 0), skirtT: num(r.skirtT, 5, 60, 15), tol: num(r.tol, 0, 50, 0), openings: [] };
  for (const o of (Array.isArray(r.openings) ? r.openings : []).slice(0, MAX_OPENINGS)) {
    if (!o || typeof o !== 'object') continue;
    const kind = o.kind === 'window' ? 'window' : 'door', wall = o.wall === 'B' || o.wall === 'C' ? o.wall : 'A', len = wall === 'B' ? d : w;
    const ow = num(o.w, 200, len, OPENING_KINDS[kind].w), y = num(o.y, 0, h - 200, OPENING_KINDS[kind].y);
    out.openings.push({ kind, wall, x: num(o.x, 0, Math.max(0, len - ow), 0), w: ow, y, h: num(o.h, 200, h - y, Math.min(OPENING_KINDS[kind].h, h - y)) });
  }
  return out;
}

/**
 * Привязка проекта к помещению. Координата u — вдоль стены A слева направо, v — от стены A в комнату.
 * Угловой ряд (turn L/R) определяет, с какой стороны стена B; ряд стоит в этом углу, room.x — отступ от него (без угла — от левого края стены A).
 * Возвращает { corner, xOf(u), zOf(v), place(m) } для координат проекта (мм, как в buildProject).
 */
export function roomFrame(proj, room) {
  const boxes = proj.mods.map(footprint), tb = (proj.worktops || []).filter(p => p.name === 'Столешница').map(p => [p.c[0] - p.L / 2, p.c[0] + p.L / 2, p.c[2] - p.W / 2, p.c[2] + p.W / 2]);
  const all = [...boxes, ...tb], minX = Math.min(...all.map(b => b[0])), maxX = Math.max(...all.map(b => b[1])), minZ = Math.min(...all.map(b => b[2]));
  const r1 = proj.mods.find(m => m.run === 1), corner = r1 ? (r1.rot < 0 ? 'R' : 'L') : null;
  const xOf = corner === 'R' ? u => u - room.w + room.x + maxX : u => u - room.x + minX;
  const uOf = x => (corner === 'R' ? x - maxX + room.w - room.x : x - minX + room.x);
  const place = m => { const b = footprint(m); return { u0: uOf(b[0]), u1: uOf(b[1]), v0: b[2] - minZ, v1: b[3] - minZ, y0: m.y, y1: m.y + m.H }; };
  return { corner, hasC: proj.mods.some(m => m.run === 2), xOf, uOf, zOf: v => v + minZ, place };
}

const over = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

/** Замечания по размещению проекта в помещении: стены, потолок, проёмы, плинтус. */
export function roomWarnings(proj, room) {
  if (!room) return [];
  const f = roomFrame(proj, room), out = [], mm = v => Math.round(v);
  const placed = proj.mods.map(m => ({ m, p: f.place(m) }));
  const wallOf = m => ['A', 'B', 'C'][m.run];
  for (const { m, p } of placed) {
    const along = m.run !== 1;
    if (along && p.u1 > room.w + 0.5) out.push(`${m.name}: выходит за стену ${wallOf(m)} на ${mm(p.u1 - room.w)} мм`);
    else if (along && p.u0 < -0.5) out.push(`${m.name}: выходит за левый край стены ${wallOf(m)} на ${mm(-p.u0)} мм`);
    if (m.run === 1 && p.v1 > room.d + 0.5) out.push(`${m.name}: выходит за стену B на ${mm(p.v1 - room.d)} мм`);
    if (m.run === 0 && p.v1 > room.d + 0.5) out.push(`${m.name}: глубже помещения на ${mm(p.v1 - room.d)} мм`);
    if (m.run === 2 && p.v1 > room.d + 0.5) out.push(`${m.name}: выходит за стену C на ${mm(p.v1 - room.d)} мм`);
    if (p.y1 > room.h + 0.5) out.push(`${m.name}: выше потолка на ${mm(p.y1 - room.h)} мм`);
  }
  for (const o of room.openings) {
    const label = `${OPENING_KINDS[o.kind].label.toLowerCase()} на стене ${o.wall}`;
    for (const { m, p } of placed) {
      if (o.wall !== wallOf(m)) continue;
      const along = o.wall === 'B' ? over(p.v0, p.v1, o.x, o.x + o.w) : over(p.u0, p.u1, o.x, o.x + o.w);
      if (along > 1 && over(p.y0, p.y1, o.y, o.y + o.h) > 1) out.push(`${m.name}: перекрывает ${label} (${o.x}…${o.x + o.w} мм)`);
    }
  }
  if (room.tol > 0) {
    // допуск на кривизну стен: между корпусами и стенами должен оставаться запас, иначе корпус не встанет в проём
    for (const wall of ['A', 'B', 'C']) {
      const ms = placed.filter(({ m }) => wallOf(m) === wall);
      if (!ms.length) continue;
      const len = wall === 'B' ? room.d : room.w, end = Math.max(...ms.map(({ p }) => (wall === 'B' ? p.v1 : p.u1))), free = len - end;
      if (free >= -0.5 && free < room.tol - 0.5) out.push(`Стена ${wall}: запас ${mm(free)} мм меньше допуска на кривизну ${room.tol} мм — нужен добор или зазор`);
    }
    const top = Math.max(...placed.map(({ p }) => p.y1));
    if (room.h - top >= -0.5 && room.h - top < room.tol - 0.5) out.push(`Потолок: запас ${mm(room.h - top)} мм меньше допуска на кривизну ${room.tol} мм`);
  }
  if (room.skirt > 0) {
    const bad = placed.filter(({ m }) => m.y === 0 && !(m.P.base === 'legs' && m.P.plinth >= room.skirt));
    for (const { m } of bad) out.push(`${m.name}: плинтус ${room.skirt} мм мешает прилеганию к стене, отодвиньте на ${room.skirtT} мм или снимите плинтус`);
  }
  return out;
}

/** Ширина ряда вдоль стены A (все модули run 0) и его край u1 при текущем отступе. */
export function rowExtent(proj, room) {
  const f = roomFrame(proj, room), ps = proj.mods.filter(m => m.run === 0).map(m => f.place(m));
  return { u0: Math.min(...ps.map(p => p.u0)), u1: Math.max(...ps.map(p => p.u1)), width: Math.max(...ps.map(p => p.u1)) - Math.min(...ps.map(p => p.u0)) };
}

/**
 * Отступ ряда room.x для привязки к стене: 'start' — в угол (левый край или угол), 'center' — по центру стены, 'end' — к правому краю.
 * При угловом ряде ряд всегда стоит в углу: подходит только 'start'. Возвращает отступ в мм или null.
 */
export function alignOffset(proj, room, mode) {
  const f = roomFrame(proj, room);
  if (mode === 'start') return 0;
  if (f.corner) return null;
  const { width } = rowExtent(proj, room);
  return Math.max(0, Math.round(mode === 'center' ? (room.w - width) / 2 : room.w - width));
}
