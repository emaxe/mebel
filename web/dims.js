// Размерные линии для 3D: где стоят и что показывают. Без DOM, координаты в мм (y вверх, x от центра, z вперёд).

const round = v => Math.round(v);

/** Просветы между горизонтальными панелями выбранной секции: от дна до полки, между полками, от полки до крышки. */
export function shelfGaps(spec, sel) {
  const m = spec.meta, s = m.sections[sel];
  if (!s) return [];
  const levels = spec.parts
    .filter(p => p.plane === 'xz' && !p.group && p.sec === sel + 1 && p.L >= 0.8 * s.w)
    .map(p => [p.c[1] - p.T / 2, p.c[1] + p.T / 2])
    .sort((a, b) => a[0] - b[0]);
  const out = []; let prev = m.yB;
  for (const [lo, hi] of levels) { if (lo - prev >= 5) out.push([prev, lo]); prev = Math.max(prev, hi); }
  if (m.yT - prev >= 5) out.push([prev, m.yT]);
  return out;
}

/** Список размеров: { id, kind, a, b, off, value, edit } — a и b концы измеряемого отрезка, off сдвиг линии от детали. */
export function dimensions(spec, P, sel, { gaps = true } = {}) {
  const m = spec.meta, W = m.W, D = m.D, H = m.H, zf = D / 2, out = [];
  out.push({ id: 'W', kind: 'W', a: [-W / 2, 0, zf], b: [W / 2, 0, zf], off: [0, -110, 0], value: round(W), edit: { k: 'W' } });
  out.push({ id: 'H', kind: 'H', a: [W / 2, 0, zf], b: [W / 2, H, zf], off: [140, 0, 0], value: round(H), edit: { k: 'height' } });
  out.push({ id: 'D', kind: 'D', a: [W / 2, 0, -D / 2], b: [W / 2, 0, zf], off: [140, -110, 0], value: round(D), edit: { k: 'depth' } });
  m.sections.forEach((s, i) => out.push({ id: `S${i}`, kind: 'sec', a: [s.x - s.w / 2, H, zf], b: [s.x + s.w / 2, H, zf], off: [0, 110, 0], value: round(s.w), edit: { k: 'sec', i } }));
  if (gaps) {
    const s = m.sections[sel];
    if (s) shelfGaps(spec, sel).forEach(([lo, hi], j) => out.push({ id: `G${j}`, kind: 'gap', a: [s.x - s.w / 2, lo, zf], b: [s.x - s.w / 2, hi, zf], off: [-90, 0, 0], value: round(hi - lo), edit: null }));
  }
  return out;
}
