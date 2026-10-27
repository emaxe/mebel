// Гильотинный раскрой листовых материалов. Без DOM и зависимостей: используется в задании, картах раскроя, экспорте и тестах.
export const DEFAULT_NEST = { L: 2800, W: 2070, trim: 10, kerf: 4, minOffcut: [300, 100], stock: [] };
const textured0 = label => /Дуб|Орех/.test(label);

/** Вдоль какой стороны детали идут волокна: 'L' (длина) или 'W' (ширина). Фасады стоят волокном по высоте, узкие горизонтальные планки (цоколь, карниз) — по длине. */
export const grainOf = g => g.grain || (g.plane === 'xy' && g.W >= g.L ? 'W' : 'L');

// как выбирается свободный прямоугольник: меньший остаток по короткой стороне, по длинной или по площади
const SCORERS = [
  (f, l, w) => [Math.min(f.l - l, f.w - w), Math.max(f.l - l, f.w - w)],
  (f, l, w) => [Math.max(f.l - l, f.w - w), Math.min(f.l - l, f.w - w)],
  (f, l, w) => [f.l * f.w - l * w, Math.min(f.l - l, f.w - w)],
];
// в каком порядке укладываются детали
const ORDERS = [
  (a, b) => b.l * b.w - a.l * a.w,
  (a, b) => b.l - a.l || b.w - a.w,
  (a, b) => b.w - a.w || b.l - a.l,
  (a, b) => b.l + b.w - (a.l + a.w),
];
const less = (a, b) => (a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1]);

function pack(pcs, score, def, stockQueue, k) {
  const sheets = [], over = [];
  const optsOf = p => (p.fixed ? [[p.l, p.w]] : [[p.l, p.w], [p.w, p.l]]);
  const fits = (sh, p) => optsOf(p).some(([l, w]) => l <= sh.UL && w <= sh.UW);
  const open = src => {
    const sh = { ...src, free: [{ x: 0, y: 0, l: src.UL, w: src.UW }], pieces: [], cuts: [] };
    sheets.push(sh);
    return sh;
  };
  const place = (sh, p) => {
    let best = null;
    sh.free.forEach((f, fi) => {
      for (const [l, w] of optsOf(p)) if (l <= f.l && w <= f.w) {
        const sc = score(f, l, w);
        if (!best || less(sc, best.sc)) best = { fi, f, l, w, sc };
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
    const H = () => dy > 0 && sh.cuts.push({ dir: 'H', pos: f.y + w, from: f.x, to: useA ? f.x + f.l : f.x + l });
    const V = () => dx > 0 && sh.cuts.push({ dir: 'V', pos: f.x + l, from: f.y, to: useA ? f.y + w : f.y + f.w });
    if (useA) { H(); V(); } else { V(); H(); }
    sh.pieces.push({ no: p.no, x: f.x, y: f.y, l, w });
    return true;
  };
  const tryOn = (list, p) => { for (const sh of list) if (fits(sh, p) && place(sh, p)) return true; return false; };
  for (const p of pcs) {
    if (!fits(def, p) && !stockQueue.some(s => fits(s, p))) { over.push(p); continue; }
    // остатки закрываются первыми: уже начатые, затем новые подходящие, и только потом целые листы
    if (tryOn(sheets.filter(s => s.stock), p)) continue;
    const si = stockQueue.findIndex(s => fits(s, p));
    if (si >= 0) { const sh = open(stockQueue.splice(si, 1)[0]); if (place(sh, p)) continue; }
    if (tryOn(sheets.filter(s => !s.stock), p)) continue;
    if (fits(def, p)) place(open(def), p); else over.push(p);
  }
  const dsheets = sheets.filter(s => !s.stock), last = dsheets[dsheets.length - 1];
  const lastBig = last ? Math.max(0, ...last.free.map(f => f.l * f.w)) : 0;
  return { sheets, over, nDefault: dsheets.length, lastBig };
}

/**
 * Деловые остатки листа: максимальные свободные прямоугольники при зазоре в пропил вокруг деталей, жадно крупнейшие без наложений.
 * pieces — детали в координатах рабочей области UL×UW, minOffcut — [длинная, короткая] сторона.
 */
export function offcutsOf(pieces, UL, UW, k, minOffcut) {
  const xs = new Set([0, UL]), ys = new Set([0, UW]);
  const boxes = pieces.map(p => [Math.max(0, p.x - k), Math.max(0, p.y - k), Math.min(UL, p.x + p.l + k), Math.min(UW, p.y + p.w + k)]);
  for (const b of boxes) { xs.add(b[0]); xs.add(b[2]); ys.add(b[1]); ys.add(b[3]); }
  const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b), nx = X.length - 1, ny = Y.length - 1;
  const busy = (ix, iy) => boxes.some(b => X[ix] >= b[0] - 1e-9 && X[ix + 1] <= b[2] + 1e-9 && Y[iy] >= b[1] - 1e-9 && Y[iy + 1] <= b[3] + 1e-9);
  const grid = Array.from({ length: ny }, (_, iy) => Array.from({ length: nx }, (_, ix) => busy(ix, iy)));
  const cand = [];
  for (let i = 0; i < nx; i++) {
    const rowFree = Array(ny).fill(true);
    for (let j = i; j < nx; j++) {
      for (let r = 0; r < ny; r++) if (grid[r][j]) rowFree[r] = false;
      for (let r = 0; r < ny; r++) {
        if (!rowFree[r]) continue;
        let r1 = r; while (r1 + 1 < ny && rowFree[r1 + 1]) r1++;
        cand.push({ x: X[i], y: Y[r], l: X[j + 1] - X[i], w: Y[r1 + 1] - Y[r] });
        r = r1;
      }
    }
  }
  const [m1, m2] = minOffcut, good = c => (c.l >= m1 && c.w >= m2) || (c.w >= m1 && c.l >= m2);
  const picked = [];
  for (const c of cand.filter(good).sort((a, b) => b.l * b.w - a.l * a.w)) {
    if (picked.some(q => c.x < q.x + q.l - 1e-9 && q.x < c.x + c.l - 1e-9 && c.y < q.y + q.w - 1e-9 && q.y < c.y + c.w - 1e-9)) continue;
    picked.push({ x: c.x, y: c.y, l: c.l, w: c.w });
  }
  return picked;
}

/**
 * opts: { sheetFor(label, T) -> {L, W}, textured(label) -> bool, trim, kerf, minOffcut: [длинная, короткая],
 *         stock: [{ label, T, L, W, qty }] — складские остатки, которые закрываются первыми (обрезка у них 0) }.
 * Перебираются 3 способа выбора места и 4 порядка деталей; выигрывает вариант с меньшим числом целых листов, затем с большим остатком.
 * Лист несёт cuts — порядок резов (каждый следующий режет участок, получившийся после предыдущих) и offcuts — деловые остатки.
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
      if (grainOf(g) === 'W') [l, w] = [w, l];
      const fixed = !!isTex(g.label);
      if (!fixed && w > l) [l, w] = [w, l];
      byMat.get(key).pcs.push({ no: g.no, l, w, fixed });
    }
  }
  const out = [], over = [];
  for (const [mat, { label, T, pcs }] of byMat) {
    const sz = o.sheetFor ? o.sheetFor(label, T) : { L: o.L, W: o.W };
    const def = { L: sz.L, W: sz.W, trim: o.trim, UL: sz.L - 2 * o.trim, UW: sz.W - 2 * o.trim, stock: false };
    const stock = (o.stock || []).filter(s => s.label === label && +s.T === T && s.L > 0 && s.W > 0 && s.qty > 0)
      .flatMap(s => Array.from({ length: Math.floor(s.qty) }, () => ({ L: s.L, W: s.W, trim: 0, UL: s.L, UW: s.W, stock: true })))
      .sort((a, b) => a.L * a.W - b.L * b.W);
    let best = null;
    for (const score of SCORERS) for (const cmp of ORDERS) {
      const r = pack(pcs.slice().sort(cmp), score, def, stock.slice(), k);
      const better = !best || r.over.length < best.over.length
        || (r.over.length === best.over.length && (r.nDefault < best.nDefault || (r.nDefault === best.nDefault && r.lastBig > best.lastBig)));
      if (better) best = r;
    }
    for (const p of best.over) over.push({ mat, ...p });
    best.sheets.forEach((s, i) => {
      const area = s.pieces.reduce((a, p) => a + p.l * p.w, 0);
      const cuts = s.cuts.map((c, n) => ({ n: n + 1, ...c, len: c.to - c.from }));
      const trimCut = s.trim > 0 ? 2 * (s.L + s.W) : 0;
      out.push({
        mat, idx: i + 1, of: best.sheets.length, L: s.L, W: s.W, trim: s.trim, stock: s.stock, pieces: s.pieces, use: area / (s.UL * s.UW),
        offcuts: offcutsOf(s.pieces, s.UL, s.UW, k, o.minOffcut), cuts, cutLen: cuts.reduce((a, c) => a + c.len, 0) + trimCut,
      });
    });
  }
  return { sheets: out, over };
}
