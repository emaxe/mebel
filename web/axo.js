// Аксонометрия изделия для инструкции: детали боксами, готовые — серые, детали шага — цветом и со стрелкой установки. SVG-строка, без DOM.
import { dims } from './kinematics.js';

const C = 0.866; // cos 30°
const iso = (x, y, z) => [(x - z) * C, -(y - (x + z) * 0.5)]; // вид с +x, +y, +z; ось y экрана вниз
const FACE = { top: '#f4efe4', front: '#e5decf', right: '#d6cebb' }, EDGE = '#8a8478';
const HI = { top: '#f6bb85', front: '#ea9650', right: '#cf7b36' }, HIE = '#7a3d12';
const METAL = { top: '#dadde0', front: '#b9bec3', right: '#9da3a9' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Куда сдвигать деталь шага, чтобы показать, откуда она ставится. */
function offset(p, stage) {
  const k = 160;
  if (['shelves', 'fixed', 'drawers', 'doors', 'flaps', 'backOverlay', 'kupe', 'rods'].includes(stage)) return [0, 0, k];
  if (stage === 'carcass' || stage === 'base') return p.plane === 'yz' ? [Math.sign(p.c[0] || 1) * k, 0, 0] : [0, k, 0];
  return [0, k, 0]; // перегородки, крышка, карниз, задняя стенка в паз — сверху
}

function boxes(spec, shown, focus) {
  const out = [];
  const add = (lo, hi, o) => out.push({ lo, hi, ...o });
  for (const p of spec.parts) {
    if (!shown.has(p.asm) || (focus && !focus.includes(p))) continue;
    const d = dims(p);
    add([0, 1, 2].map(k => p.c[k] - d[k] / 2), [0, 1, 2].map(k => p.c[k] + d[k] / 2), { ref: p, stage: p.asm, mat: p.mat });
  }
  if (!focus) for (const e of spec.extras) {
    if (e.nc || e.group || !shown.has(e.asm) || (e.kind !== 'box' && e.kind !== 'cyl')) continue;
    const d = e.kind === 'box' ? e.s : e.axis === 'x' ? [e.len, 2 * e.r, 2 * e.r] : e.axis === 'z' ? [2 * e.r, 2 * e.r, e.len] : [2 * e.r, e.len, 2 * e.r];
    add([0, 1, 2].map(k => e.c[k] - d[k] / 2), [0, 1, 2].map(k => e.c[k] + d[k] / 2), { ref: e, stage: e.asm, mat: 'metal' });
  }
  return out;
}

/** Порядок рисования: дальние раньше ближних (разделение по осям, при цикле — по сумме координат центров). */
function sortBoxes(bs) {
  const n = bs.length, before = Array.from({ length: n }, () => new Set()), indeg = new Array(n).fill(0), eps = 0.5;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = bs[i], b = bs[j];
    const ab = [0, 1, 2].some(k => a.hi[k] <= b.lo[k] + eps), ba = [0, 1, 2].some(k => b.hi[k] <= a.lo[k] + eps);
    if (ab && !ba) { before[i].add(j); indeg[j]++; } else if (ba && !ab) { before[j].add(i); indeg[i]++; }
  }
  const sum = b => (b.lo[0] + b.hi[0] + b.lo[1] + b.hi[1] + b.lo[2] + b.hi[2]) / 2, out = [], left = new Set(bs.map((_, i) => i));
  while (left.size) {
    let pick = -1;
    for (const i of left) if (indeg[i] === 0 && (pick < 0 || sum(bs[i]) < sum(bs[pick]))) pick = i;
    if (pick < 0) for (const i of left) if (pick < 0 || sum(bs[i]) < sum(bs[pick])) pick = i; // цикл: рвём по глубине
    left.delete(pick); out.push(bs[pick]);
    for (const j of before[pick]) indeg[j]--;
  }
  return out;
}

/**
 * opts: { shown: Set этапов, уже стоящих или текущего; highlight: этап шага; numbers: Map(деталь → №); focus: список деталей (показать только их); explode: сместить детали шага; width }.
 */
export function axoView(spec, opts = {}) {
  const shown = opts.shown || new Set(spec.parts.map(p => p.asm)), hi = opts.highlight, explode = opts.explode !== false && hi;
  let bs = boxes(spec, shown, opts.focus);
  for (const b of bs) b.hi_ = hi && b.stage === hi;
  const moved = bs.map(b => {
    if (!b.hi_ || !explode || !b.ref.plane) return [0, 0, 0];
    return offset(b.ref, hi);
  });
  bs.forEach((b, i) => { b.m = moved[i]; });
  const shift = (v, m) => [v[0] + m[0], v[1] + m[1], v[2] + m[2]];
  const view = bs.map(b => ({ ...b, lo: shift(b.lo, b.m), hi: shift(b.hi, b.m) }));
  const order = sortBoxes(view);
  const sw = '0.9';
  const poly = (pts, fill, stroke) => `<polygon points="${pts.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  const body = [], labels = [], arrows = [];
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const grow = ([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  for (const b of order) {
    const [x0, y0, z0] = b.lo, [x1, y1, z1] = b.hi, col = b.mat === 'metal' ? METAL : b.hi_ ? HI : FACE, ed = b.hi_ ? HIE : EDGE;
    const top = [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)];
    const front = [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)];
    const right = [iso(x1, y0, z0), iso(x1, y0, z1), iso(x1, y1, z1), iso(x1, y1, z0)];
    const gl = b.mat === 'glass' || b.mat === 'mirror';
    body.push(`<g${gl ? ' opacity="0.55"' : ''}>${poly(right, col.right, ed)}${poly(front, col.front, ed)}${poly(top, col.top, ed)}</g>`);
    [...top, ...front, ...right].forEach(grow);
    if (b.hi_ && b.ref.name) {
      const no = opts.numbers && opts.numbers.get(b.ref);
      const t = iso((x0 + x1) / 2, y1, (z0 + z1) / 2);
      if (no) labels.push([t, no]);
      const m = b.m;
      if (m[0] || m[1] || m[2]) {
        const c = [(b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2], a = iso(...c), z = iso(c[0] - m[0], c[1] - m[1], c[2] - m[2]);
        arrows.push([a, z]);
      }
    }
  }
  const u = Math.max(maxX - minX, maxY - minY) / 55 || 1; // единица относительно размера схемы: подписи читаются и у шкафа, и у короба
  const lab = labels.map(([[x, y], no]) => `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(u * 0.9).toFixed(1)}" fill="#1f1e1b"/><text x="${x.toFixed(1)}" y="${(y + u * 0.33).toFixed(1)}" text-anchor="middle" font-size="${(u * (String(no).length > 2 ? 0.8 : 1)).toFixed(1)}" fill="#fff" font-family="Helvetica,Arial,sans-serif">${esc(no)}</text></g>`).join('');
  const arr = arrows.map(([[x1, y1], [x2, y2]]) => {
    const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, hx = x2 - ux * u * 1.6, hy = y2 - uy * u * 1.6, w = u * 0.8;
    return `<g stroke="#c0392b" stroke-width="${(u * 0.22).toFixed(1)}" fill="#c0392b"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}" stroke-dasharray="${(u * 0.8).toFixed(1)} ${(u * 0.5).toFixed(1)}"/><polygon points="${x2.toFixed(1)},${y2.toFixed(1)} ${(hx - uy * w).toFixed(1)},${(hy + ux * w).toFixed(1)} ${(hx + uy * w).toFixed(1)},${(hy - ux * w).toFixed(1)}" stroke="none"/></g>`;
  }).join('');
  if (!Number.isFinite(minX)) return '<svg viewBox="0 0 10 10"></svg>';
  const pad = 30, w = maxX - minX + 2 * pad, h = maxY - minY + 2 * pad;
  return `<svg viewBox="${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" style="width:100%;max-width:${opts.width || 620}px;background:#fff" role="img">${body.join('')}${arr}${lab}</svg>`;
}
