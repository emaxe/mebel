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

const DEFAULT_NEST = { L: 2800, W: 2070, trim: 10, kerf: 4, minOffcut: [300, 100] };
const textured0 = label => /Дуб|Орех/.test(label);

/**
 * Гильотинный раскрой. opts: { sheetFor(label, T) -> {L, W}, textured(label) -> bool, trim, kerf, minOffcut: [длинная, короткая] }.
 * Свободные прямоугольники, лучшее совпадение короткой стороны, остаток делится так, чтобы осталась самая большая часть.
 * Перебираются 4 порядка деталей; выбирается меньшее число листов, при равенстве — самый крупный деловой остаток.
 */
export function nest(groups, opts = {}) {
  const o = { ...DEFAULT_NEST, ...opts };
  const k = o.kerf, isTex = o.textured || textured0;
  const byMat = new Map();
  for (const g of groups) {
    if (g.mat === 'glass' || g.mat === 'mirror') continue;
    const key = `${g.label}, ${g.T} мм`;
    if (!byMat.has(key)) byMat.set(key, { label: g.label, T: g.T, pcs: [] });
    for (let i = 0; i < g.qty; i++) {
      let l = g.saw.L, w = g.saw.W;
      const grain = g.grain || (g.plane === 'xy' && g.W >= g.L ? 'W' : 'L'); // фасады стоят волокном по высоте, узкие горизонтальные планки (цоколь, карниз) — по длине
      if (grain === 'W') [l, w] = [w, l];
      const fixed = !!isTex(g.label);
      if (!fixed && w > l) [l, w] = [w, l];
      byMat.get(key).pcs.push({ no: g.no, l, w, fixed });
    }
  }

  const pack = (pcs, UL, UW) => {
    const sheets = [], over = [];
    const place = (sh, p, opt) => {
      let best = null;
      sh.free.forEach((f, fi) => {
        for (const [l, w] of opt) if (l <= f.l && w <= f.w) {
          const sc = Math.min(f.l - l, f.w - w), sc2 = Math.max(f.l - l, f.w - w);
          if (!best || sc < best.sc || (sc === best.sc && sc2 < best.sc2)) best = { fi, f, l, w, sc, sc2 };
        }
      });
      if (!best) return false;
      const { f, l, w } = best, dx = f.l - l, dy = f.w - w;
      sh.free.splice(best.fi, 1);
      // A: нижняя часть на всю длину, правая — высотой с деталь; B: правая на всю высоту, нижняя — шириной с деталь
      const area = r => (r ? r.l * r.w : 0), ok = r => (r.l > 0 && r.w > 0 ? r : null);
      const A = [ok({ x: f.x + l + k, y: f.y, l: dx - k, w }), ok({ x: f.x, y: f.y + w + k, l: f.l, w: dy - k })];
      const B = [ok({ x: f.x + l + k, y: f.y, l: dx - k, w: f.w }), ok({ x: f.x, y: f.y + w + k, l, w: dy - k })];
      const mx = r => Math.max(area(r[0]), area(r[1]));
      const useA = mx(A) >= mx(B);
      for (const r of useA ? A : B) if (r) sh.free.push(r);
      if (dy > 0) sh.cut += useA ? f.l : l;
      if (dx > 0) sh.cut += useA ? w : f.w;
      sh.pieces.push({ no: p.no, x: f.x, y: f.y, l, w });
      return true;
    };
    for (const p of pcs) {
      let opt = [[p.l, p.w]];
      if (!p.fixed) opt.push([p.w, p.l]);
      opt = opt.filter(([l, w]) => l <= UL && w <= UW);
      if (!opt.length) { over.push(p); continue; }
      let done = false;
      for (const sh of sheets) if (place(sh, p, opt)) { done = true; break; }
      if (!done) { const sh = { free: [{ x: 0, y: 0, l: UL, w: UW }], pieces: [], cut: 0 }; sheets.push(sh); place(sh, p, opt); }
    }
    const lastBig = sheets.length ? Math.max(0, ...sheets[sheets.length - 1].free.map(f => f.l * f.w)) : 0;
    return { sheets, over, lastBig };
  };

  const out = [], over = [];
  for (const [mat, { label, T, pcs }] of byMat) {
    const sz = o.sheetFor ? o.sheetFor(label, T) : { L: o.L, W: o.W };
    const SL = sz.L, SW = sz.W, UL = SL - 2 * o.trim, UW = SW - 2 * o.trim;
    const orders = [(a, b) => b.l * b.w - a.l * a.w, (a, b) => b.l - a.l || b.w - a.w, (a, b) => b.w - a.w || b.l - a.l, (a, b) => b.l + b.w - (a.l + a.w)];
    let best = null;
    for (const cmp of orders) {
      const r = pack(pcs.slice().sort(cmp), UL, UW);
      if (!best || r.sheets.length < best.sheets.length || (r.sheets.length === best.sheets.length && r.lastBig > best.lastBig)) best = r;
    }
    for (const p of best.over) over.push({ mat, ...p });
    best.sheets.forEach((s, i) => {
      const area = s.pieces.reduce((a, p) => a + p.l * p.w, 0);
      const [m1, m2] = o.minOffcut;
      const offcuts = s.free.filter(f => (f.l >= m1 && f.w >= m2) || (f.w >= m1 && f.l >= m2)).map(f => ({ x: f.x, y: f.y, l: f.l, w: f.w }));
      const trimCut = o.trim > 0 ? 2 * (SL + SW) : 0;
      out.push({ mat, idx: i + 1, of: best.sheets.length, L: SL, W: SW, trim: o.trim, pieces: s.pieces, use: area / (UL * UW), offcuts, cutLen: s.cut + trimCut });
    });
  }
  return { sheets: out, over };
}

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
