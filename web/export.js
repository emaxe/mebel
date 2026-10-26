// Production exports: grouped cut list, saw sizes, sheet nesting, CSV, DXF.
export const EDGE_SUB = 1; // edges ≥ 1 mm are subtracted from the saw size

export function sawSize(p) {
  const s = e => (e >= EDGE_SUB ? e : 0);
  return { L: +(p.L - s(p.edges.w1) - s(p.edges.w2)).toFixed(1), W: +(p.W - s(p.edges.d1) - s(p.edges.d2)).toFixed(1) };
}
const r = v => Math.round(v * 10) / 10;

export function groupParts(spec) {
  const map = new Map();
  for (const p of spec.parts) {
    const key = JSON.stringify([p.name, p.label, p.T, r(p.L), r(p.W), p.edges, p.holes, p.grooves, p.notes]);
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
    const len = (e[0] === 'd' ? g.L : g.W) * g.qty;
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
      if (g.plane === 'xy') [l, w] = [w, l]; // волокна вдоль высоты детали
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

const holeKey = h => `D${h.d}_${h.h === 'скв.' ? 'SKV' : 'H' + h.h}`;

export function toCSV(spec, title) {
  const groups = groupParts(spec);
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const e = v => (v ? String(v).replace('.', ',') : '');
  const rows = [[title], [], ['№', 'Деталь', 'Секция', 'Материал', 'Толщина', 'Длина', 'Ширина', 'Длина пил.', 'Ширина пил.', 'Кол-во', 'Кромка Д1', 'Кромка Д2', 'Кромка Ш1', 'Кромка Ш2', 'Отверстий', 'Паз', 'Примечание']];
  for (const g of groups) rows.push([g.no, g.name, g.secLabel, g.label, g.T, e(g.L), e(g.W), e(g.saw.L), e(g.saw.W), g.qty, e(g.edges.d1), e(g.edges.d2), e(g.edges.w1), e(g.edges.w2), g.holes.length || '', g.grooves.map(x => `${x.w}×${x.depth} в ${x.at} мм`).join('; '), g.notes.join('; ')]);
  rows.push([], ['', 'Кромка: Д1/Д2 — длинные стороны (вдоль «Длины»), Ш1/Ш2 — короткие. Пильный размер = чистовой − кромка ≥ 1 мм.']);
  rows.push([], ['', 'Кромка, итого', '', '', 'мм', 'пог. м (+10%)']);
  for (const x of edgeSummary(groups)) rows.push(['', 'ПВХ кромка', '', '', e(x.t), e((x.m * 1.1).toFixed(1))]);
  rows.push([], ['', 'Фурнитура', '', '', '', '', '', '', '', 'Кол-во']);
  for (const [k, v] of spec.hw) rows.push(['', k, '', '', '', '', '', '', '', v]);
  rows.push([], ['', 'Присадка (отверстия)', 'Деталь №', 'Пласть/торец', 'X, мм', 'Y, мм', 'Ø, мм', 'Глубина', 'Назначение']);
  for (const g of groups) for (const h of g.holes) rows.push(['', '', g.no, h.f, e(h.u), e(h.v), h.d, h.h, h.note]);
  return '\ufeff' + rows.map(rw => rw.map(q).join(';')).join('\r\n');
}

export function toDXF(spec) {
  const groups = groupParts(spec);
  const out = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$DWGCODEPAGE', '3', 'ANSI_1251', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  const f = v => +v.toFixed(2);
  const line = (ly, x1, y1, x2, y2) => out.push('0', 'LINE', '8', ly, '10', f(x1), '20', f(y1), '30', 0, '11', f(x2), '21', f(y2), '31', 0);
  const circle = (ly, x, y, rr) => out.push('0', 'CIRCLE', '8', ly, '10', f(x), '20', f(y), '30', 0, '40', rr);
  const text = (ly, x, y, h, s) => out.push('0', 'TEXT', '8', ly, '10', f(x), '20', f(y), '30', 0, '40', h, '1', s);
  const lay = { body: 'KORPUS', front: 'FASAD', back: 'HDF', glass: 'STEKLO', mirror: 'ZERKALO' };
  const ROW = 7000, GAP = 150;
  let X = 0, Y = 0, rowH = 0;
  for (const g of groups) {
    if (X > 0 && X + g.L > ROW) { X = 0; Y -= rowH + GAP * 1.6; rowH = 0; }
    const ly = lay[g.mat] || 'DETAL', x0 = X, y0 = Y - g.W;
    line(ly, x0, y0, x0 + g.L, y0); line(ly, x0 + g.L, y0, x0 + g.L, y0 + g.W); line(ly, x0 + g.L, y0 + g.W, x0, y0 + g.W); line(ly, x0, y0 + g.W, x0, y0);
    const ed = g.edges, o = 3;
    if (ed.d1) line(`KROMKA_${ed.d1}`.replace('.', '_'), x0, y0 + o, x0 + g.L, y0 + o);
    if (ed.d2) line(`KROMKA_${ed.d2}`.replace('.', '_'), x0, y0 + g.W - o, x0 + g.L, y0 + g.W - o);
    if (ed.w1) line(`KROMKA_${ed.w1}`.replace('.', '_'), x0 + o, y0, x0 + o, y0 + g.W);
    if (ed.w2) line(`KROMKA_${ed.w2}`.replace('.', '_'), x0 + g.L - o, y0, x0 + g.L - o, y0 + g.W);
    for (const gr of g.grooves) for (const dv of [0, gr.w]) line('PAZ_4_5x8_' + gr.f, x0, y0 + gr.at + dv, x0 + g.L, y0 + gr.at + dv);
    for (const h of g.holes) {
      const x = x0 + h.u, y = y0 + h.v;
      if (h.f === 'A' || h.f === 'B') circle(`${holeKey(h)}_${h.f}`, x, y, h.d / 2);
      else {
        const L2 = `${holeKey(h)}_TORETS`, d = Math.min(h.h, 50);
        if (h.f === 'w1') line(L2, x, y, x + d, y); if (h.f === 'w2') line(L2, x, y, x - d, y);
        if (h.f === 'd1') line(L2, x, y, x, y + d); if (h.f === 'd2') line(L2, x, y, x, y - d);
      }
    }
    const th = Math.max(10, Math.min(35, g.W / 7));
    text('PODPISI', x0, Y + 14, th, `№${g.no} ${g.name} ${g.L}x${g.W}x${g.T} — ${g.qty} шт.`);
    text('PODPISI', x0, Y + 14 + th * 1.4, th * 0.7, `${g.label}; пил. ${g.saw.L}x${g.saw.W}; секция ${g.secLabel}`);
    X += g.L + GAP; rowH = Math.max(rowH, g.W + th * 2.6);
  }
  out.push('0', 'ENDSEC', '0', 'EOF');
  return toCp1251(out.join('\r\n'));
}

function toCp1251(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    b[i] = c < 128 ? c : c >= 0x410 && c <= 0x44f ? c - 0x350 : c === 0x401 ? 0xa8 : c === 0x451 ? 0xb8 : c === 0xd7 ? 0x78 : c === 0x2014 ? 0x97 : c === 0xab ? 0xab : c === 0xbb ? 0xbb : 0x3f;
  }
  return b;
}
