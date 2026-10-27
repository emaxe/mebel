// Per-type rules (what each kind of furniture supports), presets and section auto-fill. No DOM: testable in node.
import { presetItems, isDrawer } from './model.js';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Самый низкий ящик: короб 70 мм + 20 мм от низа фасада (model-fronts.js) должны уместиться в высоту ящика. */
export const MIN_DRAWER_H = 100;
export const innerH = P => P.height - (P.base === 'none' ? 0 : P.plinth) - 2 * P.thickness;

const ZONE_ITEMS = ['shelf', 'fixed', 'glass']; // в колонках зоны только полки
const ALL_ITEMS = ['shelf', 'fixed', 'glass', 'rod', 'drawer', 'idrawer'];
export const TYPE_RULES = {
  wardrobe: { height: [1600, 2800], depth: [450, 800], secW: [300, 1200], maxSec: 8, zone: true, doors: ['none', 'left', 'right', 'double'], sliding: true, mezz: true, cornice: true, items: ALL_ITEMS, drawerFronts: 'inset', fills: ['shelves', 'rod', 'rodShelves', 'rod2', 'drawers', 'drawersShelves', 'idrawers', 'empty'] },
  rack: { height: [600, 2600], depth: [250, 500], secW: [300, 1000], maxSec: 8, zone: true, doors: [], items: ['shelf', 'fixed', 'glass'], drawerFronts: 'inset', fills: ['shelves', 'empty'] },
  nightstand: { height: [400, 800], depth: [300, 550], secW: [300, 800], maxSec: 2, doors: ['none', 'left', 'right', 'flapDown'], items: ['shelf', 'fixed', 'glass', 'drawer', 'idrawer'], drawerFronts: 'overlay', fills: ['drawers2', 'drawers3', 'drawersShelf', 'idrawers', 'shelves', 'empty'] },
  dresser: { height: [600, 1300], depth: [350, 600], secW: [300, 1000], maxSec: 4, zone: true, doors: ['none', 'left', 'right', 'double'], items: ['shelf', 'fixed', 'drawer', 'idrawer'], drawerFronts: 'overlay', fills: ['drawers3', 'drawers4', 'drawers5', 'drawersShelf', 'idrawers', 'shelves', 'empty'] },
  kbase: { height: [500, 1000], depth: [300, 700], secW: [150, 1000], maxSec: 3, rails: true, doors: ['none', 'left', 'right', 'double'], items: ['shelf', 'fixed', 'glass', 'drawer', 'idrawer'], drawerFronts: 'overlay', fills: ['shelves1', 'shelves', 'drawers3', 'drawers2', 'drawersShelf', 'idrawers', 'empty'] },
  kwall: { height: [300, 1000], depth: [200, 450], secW: [150, 1000], maxSec: 3, doors: ['none', 'left', 'right', 'double', 'flapUp'], items: ['shelf', 'fixed', 'glass'], drawerFronts: 'inset', fills: ['shelves1', 'shelves', 'empty'] },
  ktall: { height: [1800, 2600], depth: [400, 700], secW: [300, 800], maxSec: 2, doors: ['none', 'left', 'right', 'double'], items: ['shelf', 'fixed', 'glass', 'drawer', 'idrawer'], drawerFronts: 'overlay', fills: ['shelves', 'drawersShelves', 'drawers3', 'idrawers', 'empty'] },
  tv: { height: [300, 700], depth: [300, 550], secW: [300, 1000], maxSec: 4, zone: true, doors: ['none', 'left', 'right', 'double', 'flapDown', 'flapUp'], items: ['shelf', 'fixed', 'glass', 'drawer', 'idrawer'], drawerFronts: 'overlay', fills: ['shelves1', 'shelves', 'drawers2', 'idrawers', 'empty'] },
};
export const rulesOf = P => TYPE_RULES[P.type] || TYPE_RULES.wardrobe;
export const FILL_LABELS = { shelves: 'Полки', shelves1: 'Одна полка', rod: 'Штанга', rodShelves: 'Штанга + полки', rod2: '2 штанги', drawers: 'Ящики', drawersShelves: 'Ящики + полки', drawers2: 'Ящики ×2', drawers3: 'Ящики ×3', drawers4: 'Ящики ×4', drawers5: 'Ящики ×5', drawersShelf: 'Ящик + полка', idrawers: 'Встроенные ящики', empty: 'Пусто' };

export function fillItems(kind, P) {
  const h = innerH(P), t = P.thickness, d = (n, hh) => Array.from({ length: n }, (_, i) => ({ type: 'drawer', y: i * hh, h: hh }));
  const m = /^drawers(\d)$/.exec(kind);
  if (m) { const k = Math.min(+m[1], Math.max(1, Math.floor(h / MIN_DRAWER_H))); return d(k, Math.floor(h / k)); } // ящиков не больше, чем помещается по высоте
  if (kind === 'drawersShelf') { const hh = clamp(Math.round(h / 30) * 10, 120, 300); return [...d(1, hh), { type: 'shelf', y: Math.round(hh + (h - hh - t) / 2) }]; }
  if (kind === 'idrawers') { // two hidden drawers at the bottom, shelves above them
    const hh = clamp(Math.round(h / 80) * 10, 120, 200), top = 2 * hh, k = Math.max(0, Math.round((h - top) / 360) - 1);
    return [{ type: 'idrawer', y: 0, h: hh }, { type: 'idrawer', y: hh, h: hh }, ...Array.from({ length: k }, (_, j) => ({ type: 'shelf', y: Math.round(top + ((h - top - t) * (j + 1)) / (k + 1)) }))];
  }
  if (kind === 'shelves1') return [{ type: 'shelf', y: Math.round((h - t) / 2) }];
  if (kind === 'empty') return [];
  return presetItems(kind, h, P);
}

// ── presets
export const BASE = { railW: 100, cutouts: [], fittings: {}, slide: 'ball', hinge: 'soft', push: false, wallFix: false, joint: 'confirmat', thickness: 18, backType: 'groove', cornice: false, hatShelf: 350, doorType: 'hinged', slidingDoors: 3, slidingStyle: 'mirror', frontT: 16, handle: 'bar', handleSize: 128, handleOrient: 'v', edgeFront: 2, edgeHidden: 0.4, shelfSetback: 20, open: 0, hideDoors: false, showHoles: false, topOverhang: 0, fit: true, fitMode: 'prop' };
const sec = (width, door, fill, o = {}) => ({ width, door, fill, split: 0, frontStyle: 'flat', ...o });
export const PRESETS = {
  wardrobe: { wallFix: true, height: 2300, depth: 600, base: 'plinth', plinth: 80, topType: 'inset', sections: [sec(500, 'left', 'drawersShelves'), sec(800, 'double', 'rod'), sec(500, 'right', 'rodShelves')] },
  rack: { wallFix: true, height: 1800, depth: 350, base: 'plinth', plinth: 60, topType: 'inset', handle: 'none', sections: [sec(600, 'none', 'shelves'), sec(600, 'none', 'shelves'), sec(600, 'none', 'shelves')] },
  nightstand: { height: 550, depth: 420, base: 'legs', plinth: 100, topType: 'overlay', topOverhang: 15, handleOrient: 'h', sections: [sec(450, 'none', 'drawers2')] },
  dresser: { height: 850, depth: 450, base: 'plinth', plinth: 60, topType: 'overlay', topOverhang: 15, handleOrient: 'h', sections: [sec(500, 'none', 'drawers4'), sec(500, 'none', 'drawers4')] },
  kbase: { wallFix: true, plinthStrip: true, height: 820, depth: 560, base: 'legs', plinth: 100, topType: 'rails', backType: 'overlay', handleOrient: 'h', sections: [sec(600, 'double', 'shelves1')] },
  kwall: { wallFix: true, height: 720, depth: 320, base: 'none', plinth: 0, topType: 'inset', backType: 'overlay', sections: [sec(600, 'double', 'shelves1')] },
  ktall: { wallFix: true, plinthStrip: true, height: 2200, depth: 560, base: 'legs', plinth: 100, topType: 'inset', backType: 'overlay', sections: [sec(600, 'double', 'shelves')] },
  tv: { height: 450, depth: 400, base: 'legs', plinth: 120, topType: 'overlay', topOverhang: 10, handle: 'profile', sections: [sec(500, 'left', 'shelves1'), sec(700, 'none', 'shelves1'), sec(500, 'none', 'drawers2')] },
};
export function makePreset(type, keep = {}) {
  const P = { ...BASE, ...PRESETS[type], type, bodyColor: '#ecebe7', bodyName: 'Белый', frontColor: '#c49a6c', frontName: 'Дуб', metalColor: '#c8ccd0', ...keep };
  P.sections = PRESETS[type].sections.map(s => { const { fill, ...r } = s; return { ...r, items: fillItems(fill, P) }; });
  return normalize(P);
}
/** Default content for a section added to this type of furniture. */
export const newSection = P => ({ width: clamp(500, ...rulesOf(P).secW), door: 'none', split: 0, frontStyle: 'flat', drawerFronts: rulesOf(P).drawerFronts, items: fillItems(rulesOf(P).fills[0], P) });

/**
 * Зона деления секции по высоте: s.zone = { pos: 'bottom'|'top', h, split, left: [], right: [] }.
 * h — свободная высота зоны, split — ширина левой колонки, y полок в колонках отсчитывается от низа зоны.
 * Основные элементы секции, целиком попавшие в зону, удаляются.
 */
export const zoneSpan = (z, ih, t, withShelf = false) => {
  if (!z) return null;
  const sh = withShelf ? t : 0;
  return z.pos === 'top' ? [ih - z.h - sh, ih] : [0, z.h + sh];
};
function normalizeZone(s, R, ih, t) {
  const z = s.zone;
  if (!R.zone || !z || typeof z !== 'object' || ih < 400) { s.zone = null; return; } // зоне нужно хотя бы 150 мм и 250 мм под основную часть секции
  if (z.pos !== 'top') z.pos = 'bottom';
  z.h = clamp(Math.round(z.h || 300), 150, Math.max(150, ih - 250));
  z.split = clamp(Math.round(z.split || (s.width - t) / 2), 100, Math.max(100, s.width - t - 100));
  for (const k of ['left', 'right']) {
    z[k] = (z[k] || []).filter(it => ZONE_ITEMS.includes(it.type));
    // съёмные полки: ряд отверстий полкодержателей (−37…+27 мм от полки) должен целиком лежать на колонне зоны
    for (const it of z[k]) it.y = it.type === 'fixed' ? clamp(it.y, 0, Math.max(0, z.h - t)) : clamp(it.y, 37, Math.max(37, z.h - 27));
  }
  const [za, zb] = zoneSpan(z, ih, t);
  s.items = s.items.filter(it => !(it.y >= za - 0.5 && it.y + hOf(it, t) <= zb + 0.5));
}

/**
 * Вырезы в деталях: { part: имя детали, sec: 0 (все) или номер секции, kind: 'hole' | 'notch', w, h, r, u, v, corner }.
 * hole — прямоугольный вырез со скруглением r, центр в (u, v) от кромок Ш1 и Д1; notch — выемка в углу corner ('w1d1'…'w2d2'), размер w×h, r — радиус внутреннего угла.
 */
const CORNERS = ['w1d1', 'w1d2', 'w2d1', 'w2d2'];
export function normalizeCutouts(list) {
  const num = (v, d) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);
  return (Array.isArray(list) ? list : []).slice(0, 20).filter(c => c && typeof c === 'object').map(c => {
    const w = clamp(num(c.w, 60), 5, 3000), h = clamp(num(c.h, 60), 5, 3000);
    return { part: String(c.part || 'Задняя стенка').slice(0, 60), sec: Math.max(0, Math.round(num(c.sec, 0))), kind: c.kind === 'notch' ? 'notch' : 'hole', w, h, r: clamp(num(c.r, 0), 0, Math.min(w, h) / 2), u: num(c.u, 0), v: num(c.v, 0), corner: CORNERS.includes(c.corner) ? c.corner : 'w1d1' };
  });
}

/** Bring a project to what its type supports: ranges, doors, antresol, items, front mode. Idempotent. */
import { normalizeWorktop } from './worktop.js';
export const SCHEMA = 2;
const MIGRATIONS = [P => P, P => P];
export const MAX_MODULES = 12;

export function schemaOf(P) { return Number.isInteger(P.schema) && P.schema >= 0 ? P.schema : 0; }

export function migrate(P) {
  let v = schemaOf(P);
  if (v > SCHEMA) return false;
  for (; v < SCHEMA; v++) MIGRATIONS[v](P);
  P.schema = Array.isArray(P.modules) && P.modules.length ? 2 : 1;
  return true;
}

/** Дополнительные модули проекта: P.modules = [{ name, gap, y, P }]. Основной корпус — сам P (его имя и подъём — modName, modY). */
export function normalizeModules(P) {
  const list = Array.isArray(P.modules) ? P.modules : [];
  P.modules = list.filter(m => m && typeof m === 'object' && m.P && typeof m.P === 'object' && Array.isArray(m.P.sections) && m.P.sections.length).slice(0, MAX_MODULES - 1);
  const int = (v, lo, hi) => clamp(Number.isFinite(+v) && v !== '' && v !== null ? Math.round(+v) : 0, lo, hi);
  for (const m of P.modules) {
    m.name = typeof m.name === 'string' && m.name.trim() ? m.name.trim().slice(0, 40) : 'Модуль';
    m.gap = int(m.gap, 0, 2000); m.y = int(m.y, 0, 3000);
    if (m.over) m.over = true; else delete m.over;
    if (m.turn !== 'L' && m.turn !== 'R') delete m.turn;
    delete m.P.modules; delete m.P.modName; delete m.P.modY; delete m.P.countertop;
    normalize(m.P);
  }
  let turned = false;
  for (const m of P.modules) { if (m.turn && (m.over || turned)) delete m.turn; if (m.turn) turned = true; }
  if (!P.modules.length) delete P.modules;
  if (P.countertop !== undefined) { const w = normalizeWorktop(P.countertop); if (w) P.countertop = w; else delete P.countertop; }
  if (typeof P.modName === 'string' && P.modName.trim()) P.modName = P.modName.trim().slice(0, 40); else delete P.modName;
  if (P.modY !== undefined) { P.modY = int(P.modY, 0, 3000); if (!P.modY) delete P.modY; }
  return P;
}

export function normalize(P) {
  migrate(P);
  if (!TYPE_RULES[P.type]) P.type = 'wardrobe';
  const R = TYPE_RULES[P.type], t = P.thickness;
  P.height = clamp(P.height, ...R.height); P.depth = clamp(P.depth, ...R.depth);
  if (P.fit === undefined) P.fit = true;
  if (P.fitMode !== 'even') P.fitMode = 'prop';
  if (!['confirmat', 'minifix', 'dowel'].includes(P.joint)) P.joint = 'confirmat';
  if (!R.sliding) P.doorType = 'hinged';
  if (!['ball', 'ballSoft', 'hidden', 'roller'].includes(P.slide)) P.slide = 'ball';
  if (!['soft', 'plain', 'wide'].includes(P.hinge)) P.hinge = 'soft';
  P.wallFix = !!P.wallFix;
  P.cutouts = normalizeCutouts(P.cutouts);
  if (!P.fittings || typeof P.fittings !== 'object' || Array.isArray(P.fittings)) P.fittings = {};
  P.push = !!P.push && P.handle === 'none'; // push-to-open работает только без ручек
  if (P.push) { if (P.hinge !== 'plain') P.hinge = 'plain'; if (P.slide === 'ballSoft') P.slide = 'ball'; } // доводчик гасит толчок
  if (!R.cornice) P.cornice = false;
  if (!['inset', 'overlay', 'rails'].includes(P.topType) || (P.topType === 'rails' && !R.rails)) P.topType = 'inset';
  if (P.overrides !== undefined) {
    const list = (Array.isArray(P.overrides) ? P.overrides : []).filter(o => o && typeof o === 'object' && typeof o.part === 'string' && o.part.trim() && typeof o.decor === 'string' && o.decor.trim()).slice(0, 30);
    P.overrides = list.map(o => ({ part: o.part.trim().slice(0, 60), sec: Number.isFinite(+o.sec) ? clamp(Math.round(+o.sec), 0, 30) : 0, decor: o.decor.trim().slice(0, 40), color: typeof o.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(o.color) ? o.color : '#cccccc' }));
    if (!P.overrides.length) delete P.overrides;
  }
  if (!P.plinthStrip || P.base !== 'legs') delete P.plinthStrip; else P.plinthStrip = true;
  P.railW = clamp(Number.isFinite(+P.railW) ? Math.round(+P.railW) : 100, 60, 200);
  P.sections = (P.sections || []).slice(0, R.maxSec);
  if (!P.sections.length) P.sections = [newSection(P)];
  if (P.base !== 'none') P.plinth = clamp(P.plinth, 40, Math.max(40, P.height - 200)); // основание не должно съедать изделие: внутри остаётся не меньше ~150 мм
  const ih = innerH(P);
  for (const s of P.sections) {
    s.width = clamp(s.width, ...R.secW);
    if (!R.doors.includes(s.door)) s.door = 'none';
    s.split = R.mezz && s.split > 0 ? clamp(s.split, 250, Math.max(250, ih - 300)) : 0;
    s.items = (s.items || []).filter(it => R.items.includes(it.type));
    if (s.drawerFronts !== 'inset' && s.drawerFronts !== 'overlay') s.drawerFronts = R.drawerFronts;
    if (s.door === 'flapDown' || s.door === 'flapUp') s.drawerFronts = 'inset'; // a flap has no flat row of drawers under it
    const top = Math.max(0, ...s.items.filter(it => it.type === 'drawer').map(it => it.y + it.h)); // visible drawers only
    if (s.drawerFronts === 'overlay' && s.door !== 'none' && top > 0 && ih - top < 130) s.drawerFronts = 'inset'; // no room for a door above overlay drawers
    for (const it of s.items) {
      if (isDrawer(it.type)) { it.h = clamp(it.h || 180, MIN_DRAWER_H, 500); it.y = clamp(it.y, 0, Math.max(0, ih - it.h)); }
      else it.y = clamp(it.y, it.type === 'shelf' || it.type === 'glass' ? 8 : 0, it.type === 'rod' ? ih : Math.max(8, ih - t)); // съёмной полке нужен ряд полкодержателей под ней
    }
    normalizeZone(s, R, ih, t);
  }
  return normalizeModules(P);
}

// ── auto-fill
const hOf = (it, t) => (isDrawer(it.type) ? it.h : it.type === 'glass' ? 6 : it.type === 'rod' ? 0 : t);
const GMIN = 120; // smallest clear gap between neighbouring shelves

/** Free spans [a, b] (section coordinates, mm) where shelves may go; clothes hanging under a rod are reserved. */
export function freeZones(items, ih, t, clothes = 1000, zone = null) {
  const occ = zone ? [zoneSpan(zone, ih, t, true)] : [];
  for (const it of items) {
    if (it.type === 'rod') {
      const below = Math.max(0, ...items.filter(o => o !== it && o.type !== 'rod' && o.y + hOf(o, t) <= it.y + 0.5).map(o => o.y + hOf(o, t)));
      occ.push([Math.max(below, it.y - clothes), it.y + 15]);
    } else occ.push([it.y, it.y + hOf(it, t)]);
  }
  occ.sort((x, y) => x[0] - y[0]);
  const zones = []; let cur = 0;
  for (const [a, b] of occ) { if (a > cur) zones.push([cur, a]); cur = Math.max(cur, b); }
  if (ih > cur) zones.push([cur, ih]);
  return zones.filter(([a, b]) => b - a >= t + 2 * 20);
}

const cap = (L, t) => Math.max(0, Math.floor((L - GMIN) / (t + GMIN)));
function layout(zones, counts, t, type, s32) {
  const out = [];
  zones.forEach(([a, b], zi) => {
    const k = counts[zi]; if (!k) return;
    const gap = (b - a - k * t) / (k + 1), ys = Array.from({ length: k }, (_, j) => Math.round(a + (j + 1) * gap + j * t));
    const sn = ys.map(y => Math.round(y / 32) * 32);
    const okSnap = s32 && sn.every((y, j) => y >= a + 20 && y + t <= b - 20 && (j === 0 || y - sn[j - 1] >= t + 60));
    for (const y of okSnap ? sn : ys) out.push({ type, y });
  });
  return out;
}

/** Replace removable shelves by n evenly spread ones (shared over free spans in proportion to their height). */
export function autoShelves(sec, ih, t, { n, type = 'shelf', s32 = true } = {}) {
  const keep = sec.items.filter(it => it.type !== 'shelf' && it.type !== 'glass');
  const zones = freeZones(keep, ih, t, 1000, sec.zone), counts = zones.map(() => 0), caps = zones.map(([a, b]) => cap(b - a, t));
  for (let i = 0; i < n; i++) {
    let best = -1, bv = 0;
    zones.forEach(([a, b], z) => { if (counts[z] < caps[z]) { const v = (b - a) / (counts[z] + 1); if (v > bv) { bv = v; best = z; } } });
    if (best < 0) break; counts[best]++;
  }
  sec.items = [...keep, ...layout(zones, counts, t, type, s32)];
}
/** Fill every free span with shelves at the given pitch (clear height between shelves). */
export function stepShelves(sec, ih, t, { step = 350, type = 'shelf', s32 = true } = {}) {
  const keep = sec.items.filter(it => it.type !== 'shelf' && it.type !== 'glass');
  const zones = freeZones(keep, ih, t, 1000, sec.zone);
  const counts = zones.map(([a, b]) => clamp(Math.round((b - a - step) / (step + t)), 0, cap(b - a, t)));
  sec.items = [...keep, ...layout(zones, counts, t, type, s32)];
}
/** Stack drawers (in place, keeping their types) from the bottom up to `zone`: equal heights, or graduated (taller at the bottom). */
function stackDrawers(dr, zone, graded) {
  const n = dr.length, w = Array.from({ length: n }, (_, i) => (graded ? Math.pow(1.15, n - 1 - i) : 1)), sw = w.reduce((a, b) => a + b, 0);
  const hs = w.map(x => Math.floor((zone * x) / sw));
  hs[graded ? 0 : n - 1] += zone - hs.reduce((a, b) => a + b, 0);
  let y = 0;
  dr.forEach((d, i) => { d.y = y; d.h = hs[i]; y += hs[i]; });
}
/** A stack of n drawers from the bottom up to `zone` mm: equal heights, or graduated (taller at the bottom). */
export function autoDrawers(sec, ih, t, { n, zone = ih, graded = false } = {}) {
  zone = clamp(Math.round(zone), 160, ih);
  n = clamp(Math.round(n), Math.max(1, Math.ceil(zone / 500)), Math.max(1, Math.floor(zone / MIN_DRAWER_H)));
  const old = sec.items.filter(it => isDrawer(it.type)).sort((a, b) => a.y - b.y).map(it => it.type);
  const keep = sec.items.filter(it => !isDrawer(it.type) && !(it.type === 'rod' ? it.y < zone : it.type === 'fixed' ? it.y < zone - 0.5 : it.y < zone + t));
  const dr = Array.from({ length: n }, (_, i) => ({ type: old[i] || old[old.length - 1] || 'drawer', y: 0, h: 0 }));
  stackDrawers(dr, zone, graded);
  sec.items = [...keep, ...dr];
}
/** Slide all drawers down into a gapless stack from the bottom. */
export function packDrawers(sec) {
  let y = 0;
  for (const d of sec.items.filter(it => isDrawer(it.type)).sort((a, b) => a.y - b.y)) { d.y = y; y += d.h; }
}
/** Spread what is already in the section evenly, keeping the counts: drawers equal in a stack, shelves evenly in free spans. */
export function redistribute(sec, ih, t, { s32 = false } = {}) {
  const dr = sec.items.filter(it => isDrawer(it.type)).sort((a, b) => a.y - b.y);
  if (dr.length) stackDrawers(dr, Math.min(ih, Math.round(Math.max(...dr.map(d => d.y + d.h)))), false);
  const sh = sec.items.filter(it => it.type === 'shelf' || it.type === 'glass');
  if (sh.length) autoShelves(sec, ih, t, { n: sh.length, type: sh.every(i => i.type === 'glass') ? 'glass' : 'shelf', s32 });
}
/**
 * Resize: the inner height changed from oldIh to newIh. 'prop' keeps every element at the same relative place
 * (drawer heights scale too, stacks stay gapless); 'even' scales fixed parts and re-spreads shelves and drawers evenly.
 */
export function sectionOfMessage(text, n) {
  const m = /[Сс]екци[яи]\s+(\d+)/.exec(text), i = m ? +m[1] - 1 : -1;
  return i >= 0 && i < n ? i : null;
}

export const itemHeight = (it, t) => (isDrawer(it.type) ? it.h : it.type === 'glass' ? 6 : it.type === 'rod' ? 0 : t);

export function moveItem(sec, i, y, { t, ih, step = 32, gap = 20 }) {
  const it = sec.items[i], hh = itemHeight(it, t);
  let lo = 0, hi = ih - hh;
  sec.items.forEach((o, j) => {
    if (j === i || o.type === 'rod') return;
    const g = isDrawer(it.type) || isDrawer(o.type) ? 0 : gap;
    if (o.y < it.y) lo = Math.max(lo, o.y + itemHeight(o, t) + g);
    else hi = Math.min(hi, o.y - hh - g);
  });
  if (lo > hi) return it.y;
  const v = step ? Math.round(y / step) * step : Math.round(y);
  return clamp(v, lo, hi);
}

export const totalWidth = P => P.sections.reduce((a, s) => a + s.width, 0) + (P.sections.length + 1) * P.thickness;

export function fitWidth(P, W) {
  const [lo, hi] = rulesOf(P).secW, n = P.sections.length, t = P.thickness;
  const target = clamp(Math.round(W) - (n + 1) * t, n * lo, n * hi), w0 = P.sections.map(s => s.width), w = w0.slice(), fixed = new Set();
  for (let it = 0; it <= n; it++) {
    const rest = w0.map((_, i) => i).filter(i => !fixed.has(i));
    const k = (target - [...fixed].reduce((a, i) => a + w[i], 0)) / rest.reduce((a, i) => a + w0[i], 0);
    let clamped = false;
    for (const i of rest) { const v = w0[i] * k; if (v < lo || v > hi) { w[i] = clamp(v, lo, hi); fixed.add(i); clamped = true; } else w[i] = v; }
    if (!clamped) break;
  }
  const r = w.map(Math.round);
  let diff = target - r.reduce((a, v) => a + v, 0);
  while (diff) {
    const step = Math.sign(diff), order = r.map((_, i) => i).filter(i => r[i] + step >= lo && r[i] + step <= hi).sort((a, b) => r[b] - r[a]);
    if (!order.length) break;
    r[order[0]] += step; diff -= step;
  }
  P.sections.forEach((s, i) => { s.width = r[i]; });
  return totalWidth(P);
}

export function fitSections(P, oldIh, newIh, mode = 'prop') {
  if (!oldIh || !newIh || oldIh === newIh) return;
  const r = newIh / oldIh, t = P.thickness;
  for (const s of P.sections) {
    if (s.zone) { s.zone.h = Math.round(s.zone.h * r); for (const c of [s.zone.left, s.zone.right]) for (const it of c || []) it.y = Math.round(it.y * r); }
    if (mode === 'even') {
      for (const it of s.items) if (!isDrawer(it.type) && it.type !== 'shelf' && it.type !== 'glass') it.y = Math.round(it.y * r);
      const dr = s.items.filter(it => isDrawer(it.type)).sort((a, b) => a.y - b.y);
      if (dr.length) stackDrawers(dr, clamp(Math.round(Math.max(...dr.map(d => d.y + d.h)) * r), MIN_DRAWER_H * dr.length, newIh), false);
      redistribute(s, newIh, t, { s32: false });
    } else for (const it of s.items) {
      const y0 = Math.round(it.y * r);
      if (isDrawer(it.type)) { it.h = Math.round((it.y + it.h) * r) - y0; }
      it.y = y0;
    }
  }
}
