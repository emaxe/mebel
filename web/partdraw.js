// Чертёж детали в SVG: кромка, пазы, фрезеровка, отверстия, размерные цепочки, стрелка волокон. Без DOM: строка SVG.
const COL = { 35: '#d4672a', 15: '#8e44ad', 8: '#2f8f5b', 7: '#2b6cb0', 5: '#1f1e1b', 3: '#8a8478' };
const ECOL = e => (e >= 1 ? '#c0392b' : '#d9a441');
const fmt = v => String(Math.round(v * 10) / 10).replace('.', ',');
const MAX_TICKS = 18;

/** Координаты, по которым ставятся цепочки размеров: 0, позиции отверстий на пластях, длина. Лишние (мелкие отверстия) отбрасываются. */
export function chainPositions(holes, axis, size) {
  const key = axis === 'x' ? 'u' : 'v';
  const items = holes.filter(h => h.f === 'A' || h.f === 'B').map(h => ({ p: Math.round(h[key] * 2) / 2, d: h.d })).filter(i => i.p > 0.5 && i.p < size - 0.5);
  const all = new Set(items.map(i => i.p));
  if (all.size <= MAX_TICKS) return [0, ...[...all].sort((a, b) => a - b), size];
  const keep = new Set();
  for (const i of items.slice().sort((a, b) => b.d - a.d || a.p - b.p)) { if (!keep.has(i.p) && keep.size >= MAX_TICKS) continue; keep.add(i.p); }
  return [0, ...[...keep].sort((a, b) => a - b), size];
}

/** view: 'A' — вид на пласть A; 'B' — вид с пласти B (зеркально по X, как деталь, перевёрнутая вокруг вертикальной оси). grain: 'L' | 'W' | null. */
export function partDrawing(g, { view = 'A', grain = null } = {}) {
  const mirror = view === 'B', BW = 900, BH = 300, padL = 64, padR = 96, padT = 44, padB = 78;
  const sc = Math.min((BW - padL - padR) / g.L, (BH - padT - padB) / g.W);
  const w = g.L * sc, h = g.W * sc, ox = padL, oy = padT + h, H = h + padT + padB;
  const X = u => ox + (mirror ? g.L - u : u) * sc, Y = v => oy - v * sc;
  const holes = g.holes;
  let s = `<svg viewBox="0 0 ${BW} ${H}" style="width:100%;max-height:380px" data-view="${view}">`;
  s += `<rect x="${ox}" y="${padT}" width="${w}" height="${h}" fill="#f6f3ec" stroke="#1f1e1b" stroke-width="1.5"/>`;
  const ed = g.edges, ew = mirror ? { w1: 'w2', w2: 'w1' } : { w1: 'w1', w2: 'w2' };
  const et = (x1, y1, x2, y2, v, lx, ly, lab) => (v ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ECOL(v)}" stroke-width="${v >= 1 ? 5 : 3}"/><text x="${lx}" y="${ly}" font-size="11" fill="${ECOL(v)}" text-anchor="middle">${lab} ${fmt(v)}</text>` : '');
  s += et(ox, oy, ox + w, oy, ed.d1, ox + w / 2, oy + 14, 'Д1');
  s += et(ox, padT, ox + w, padT, ed.d2, ox + w / 2, padT - 8, 'Д2');
  s += et(ox, padT, ox, oy, ed[ew.w1], ox - 30, padT + h / 2, mirror ? 'Ш2' : 'Ш1');
  s += et(ox + w, padT, ox + w, oy, ed[ew.w2], ox + w + 30, padT + h / 2, mirror ? 'Ш1' : 'Ш2');
  for (const gr of g.grooves) for (const dv of [0, gr.w]) s += `<line x1="${ox}" x2="${ox + w}" y1="${Y(gr.at + dv)}" y2="${Y(gr.at + dv)}" stroke="#6b5a45" stroke-dasharray="6 4"/>`;
  const rr = (u0, v0, u1, v1, r, attrs) => {
    const xa = X(mirror ? u1 : u0), xb = X(mirror ? u0 : u1);
    return `<rect x="${Math.min(xa, xb)}" y="${Y(v1)}" width="${Math.abs(xb - xa)}" height="${(v1 - v0) * sc}" rx="${(r || 0) * sc}" ${attrs}/>`;
  };
  const mi = g.mill;
  if (mi && mi.kind === 'shaker') s += rr(mi.frameW, mi.frameW, g.L - mi.frameW, g.W - mi.frameW, mi.cornerR, 'fill="#e8f0fa" stroke="#2b6cb0" stroke-width="1.4" stroke-dasharray="7 4"');
  if (mi && mi.kind === 'glass') {
    const o = (mi.rebate[0] - mi.window[0]) / 2;
    s += rr(mi.frameW - o, mi.frameW - o, g.L - mi.frameW + o, g.W - mi.frameW + o, mi.cornerR, 'fill="none" stroke="#2b6cb0" stroke-width="1.2" stroke-dasharray="7 4"');
    s += rr(mi.frameW, mi.frameW, g.L - mi.frameW, g.W - mi.frameW, mi.cornerR, 'fill="#e8f0fa" stroke="#2b6cb0" stroke-width="1.6"');
  }
  for (const c of g.cutouts || []) s += rr(c.u0, c.v0, c.u1, c.v1, c.r, 'fill="#f8d7d3" stroke="#c0392b" stroke-width="1.6"');
  if (grain) {
    const horiz = grain === 'L', cx = ox + w / 2, cy = padT + h / 2, len = Math.min(horiz ? w : h, 120) / 2;
    const [x1, y1, x2, y2] = horiz ? [cx - len, cy, cx + len, cy] : [cx, cy + len, cx, cy - len];
    s += `<g stroke="#8a7a5a" stroke-width="1.4" fill="#8a7a5a" data-grain="${grain}"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    s += horiz ? `<path d="M${x2} ${y2} l-8 -4 v8z"/><path d="M${x1} ${y1} l8 -4 v8z"/>` : `<path d="M${x2} ${y2} l-4 8 h8z"/><path d="M${x1} ${y1} l-4 -8 h8z"/>`;
    s += `</g><text x="${cx}" y="${horiz ? cy - 8 : cy - len - 6}" font-size="10" fill="#8a7a5a" text-anchor="middle">волокна</text>`;
  }
  for (const ho of holes) {
    const c = COL[ho.d] || '#555', x = X(ho.u), y = Y(ho.v);
    if (ho.f === 'A' || ho.f === 'B') {
      const r = Math.max((ho.d / 2) * sc, ho.d >= 30 ? 6 : 2.6), own = ho.f === view;
      s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${own ? c : 'none'}" stroke="${c}" stroke-width="1.4" ${own ? '' : 'stroke-dasharray="2 1.5"'}/>`;
    } else {
      const f = mirror ? { w1: 'w2', w2: 'w1', d1: 'd1', d2: 'd2' }[ho.f] : ho.f;
      const d = { w1: [1, 0], w2: [-1, 0], d1: [0, -1], d2: [0, 1] }[f], L = 12;
      s += `<path d="M${x} ${y} L${x + d[0] * L - d[1] * 4} ${y - d[1] * L - d[0] * 4} L${x + d[0] * L + d[1] * 4} ${y - d[1] * L + d[0] * 4}Z" fill="#2b6cb0"/>`;
    }
  }
  const chain = (pts, axis) => {
    const xs = axis === 'x' ? pts.map(p => (mirror ? g.L - p : p)).sort((a, b) => a - b) : pts;
    const pos = v => (axis === 'x' ? ox + v * sc : oy - v * sc);
    let out = '', base = axis === 'x' ? oy + 28 : ox + w + 56;
    out += axis === 'x' ? `<line x1="${pos(xs[0])}" y1="${base}" x2="${pos(xs[xs.length - 1])}" y2="${base}" stroke="#8a8478"/>` : `<line x1="${base}" y1="${pos(xs[0])}" x2="${base}" y2="${pos(xs[xs.length - 1])}" stroke="#8a8478"/>`;
    xs.forEach((v, i) => {
      out += axis === 'x' ? `<line x1="${pos(v)}" y1="${base - 4}" x2="${pos(v)}" y2="${base + 4}" stroke="#8a8478"/>` : `<line x1="${base - 4}" y1="${pos(v)}" x2="${base + 4}" y2="${pos(v)}" stroke="#8a8478"/>`;
      if (!i) return;
      const seg = v - xs[i - 1], mid = (pos(v) + pos(xs[i - 1])) / 2, px = Math.abs(pos(v) - pos(xs[i - 1]));
      if (axis === 'x') { if (px >= 22) out += `<text x="${mid}" y="${base + 13}" font-size="9" text-anchor="middle" fill="#3a362f" data-seg="${fmt(seg)}">${fmt(seg)}</text>`; }
      else if (px >= 12) out += `<text x="${base + 7}" y="${mid + 3}" font-size="9" fill="#3a362f" data-seg="${fmt(seg)}">${fmt(seg)}</text>`;
    });
    return out;
  };
  s += chain(chainPositions(holes, 'x', g.L), 'x');
  s += chain(chainPositions(holes, 'y', g.W), 'y');
  s += `<text x="${ox + w / 2}" y="${oy + 56}" font-size="12" text-anchor="middle" font-weight="600">${fmt(g.L)}</text>`;
  s += `<text x="${ox + w + 78}" y="${padT + h / 2}" font-size="12" font-weight="600" transform="rotate(90 ${ox + w + 78} ${padT + h / 2})" text-anchor="middle">${fmt(g.W)}</text>`;
  s += `<text x="${ox}" y="${padT - 26}" font-size="11" fill="#6f6a60">${mirror ? 'Вид с пласти B (деталь перевёрнута вокруг вертикальной оси, X зеркально)' : 'Вид на пласть A'}</text>`;
  return s + '</svg>';
}
