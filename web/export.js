// Production exports: grouped cut list, saw sizes, sheet nesting, CSV, DXF.
import { machiningRows } from './partinfo.js';
import { dxfFromGroups } from './dxf.js';
export const EDGE_SUB = 1; // edges ≥ 1 mm are subtracted from the saw size

export function sawSize(p) {
  const s = e => (e >= EDGE_SUB ? e : 0);
  return { L: +(p.L - s(p.edges.w1) - s(p.edges.w2)).toFixed(1), W: +(p.W - s(p.edges.d1) - s(p.edges.d2)).toFixed(1) };
}
const r = v => Math.round(v * 10) / 10;

/** Ключ, по которому одинаковые детали сводятся в одну позицию спецификации. */
export const partKey = p => JSON.stringify([p.name, p.label, p.T, r(p.L), r(p.W), p.edges, p.holes, p.grooves, p.notes, p.mill || null, p.cutouts || null]);

export function groupParts(spec) {
  const map = new Map();
  for (const p of spec.parts) {
    const key = partKey(p);
    const g = map.get(key);
    if (g) { g.qty++; g.secs.add(p.sec); } else map.set(key, { ...p, L: r(p.L), W: r(p.W), qty: 1, secs: new Set([p.sec]) });
  }
  const order = ['body', 'front', 'back', 'glass', 'mirror'];
  return [...map.values()]
    .sort((a, b) => order.indexOf(a.mat) - order.indexOf(b.mat) || b.L * b.W - a.L * a.W)
    .map((g, i) => ({ ...g, no: i + 1, saw: sawSize(g), secLabel: [...g.secs].filter(Boolean).sort((a, b) => a - b).join(', ') || '—' }));
}

export function edgeSummary(groups) {
  const m = new Map();
  for (const g of groups) for (const [e, v] of Object.entries(g.edges)) if (v) {
    // выемка в углу срезает часть кромки (новые торцы выемки не кромятся)
    const cut = (g.cutouts || []).filter(c => c.kind === 'notch' && c.corner.includes(e)).reduce((a, c) => a + (e[0] === 'd' ? c.u1 - c.u0 : c.v1 - c.v0), 0);
    const len = Math.max(0, (e[0] === 'd' ? g.L : g.W) - cut) * g.qty;
    m.set(v, (m.get(v) || 0) + len);
  }
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([t, mm]) => ({ t, m: mm / 1000 }));
}

export { nest, grainOf, offcutsOf } from './nest.js';

export function toCSV(spec, title) {
  const groups = groupParts(spec);
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const e = v => (v ? String(v).replace('.', ',') : '');
  const c = v => (typeof v === 'number' ? String(v).replace('.', ',') : '');
  const rows = [[title], [], ['№', 'Деталь', 'Секция', 'Материал', 'Толщина', 'Длина', 'Ширина', 'Длина пил.', 'Ширина пил.', 'Кол-во', 'Кромка Д1', 'Кромка Д2', 'Кромка Ш1', 'Кромка Ш2', 'Отверстий', 'Паз', 'Примечание']];
  for (const g of groups) rows.push([g.no, g.name, g.secLabel, g.label, g.T, e(g.L), e(g.W), e(g.saw.L), e(g.saw.W), g.qty, e(g.edges.d1), e(g.edges.d2), e(g.edges.w1), e(g.edges.w2), g.holes.length || '', g.grooves.map(x => `${x.w}×${x.depth} в ${x.at} мм`).join('; '), g.notes.join('; ')]);
  rows.push([], ['', 'Кромка: Д1/Д2 — длинные стороны (вдоль «Длины»), Ш1/Ш2 — короткие. Пильный размер = чистовой − кромка ≥ 1 мм.']);
  rows.push([], ['', 'Кромка, итого', '', '', 'мм', 'пог. м (+10%)']);
  for (const x of edgeSummary(groups)) rows.push(['', 'ПВХ кромка', '', '', e(x.t), e((x.m * 1.1).toFixed(1))]);
  rows.push([], ['', 'Фурнитура', '', '', '', '', '', '', '', 'Кол-во']);
  for (const [k, v] of spec.hw) rows.push(['', k, '', '', '', '', '', '', '', v]);
  rows.push([], ['', 'Присадка (отверстия)', 'Деталь №', 'Пласть/торец', 'X, мм', 'Y, мм', 'Ø, мм', 'Глубина', 'Назначение']);
  for (const g of groups) for (const h of g.holes) rows.push(['', '', g.no, h.f, c(h.u), c(h.v), h.d, h.h, h.note]);
  const mach = groups.flatMap(g => machiningRows(g).map(m => ['', '', g.no, m.title, m.size, m.pos, m.face, m.depth, m.note]));
  if (mach.length) { rows.push([], ['', 'Фрезеровка и вырезы', 'Деталь №', 'Что', 'Размер', 'Положение', 'Пласть', 'Глубина', 'Примечание']); rows.push(...mach); }
  return '\ufeff' + rows.map(rw => rw.map(q).join(';')).join('\r\n');
}

export const toDXF = (spec, opts) => dxfFromGroups(groupParts(spec), opts);
