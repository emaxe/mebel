// Furniture spec: every cut part with finished size, edge banding and drilling (mm, y-up, x centred, z front+).
// Panel planes: 'yz' (u=y, v=z from back), 'xz' (u=x from left, v=z from back), 'xy' (u=x from left, v=y from bottom).
// Faces: yz A=-x B=+x · xz A=top B=bottom · xy A=front B=back. Edges: w1 u=0, w2 u=L, d1 v=0, d2 v=W.
import { addFronts } from './model-fronts.js';

export const ITEM_H = { shelf: null, fixed: null, glass: 6, rod: 40, drawer: null, idrawer: null };
/** Drawer with a visible front, or a built-in one hidden behind the section's door. */
export const isDrawer = t => t === 'drawer' || t === 'idrawer';

export function presetItems(kind, ih, P) {
  const t = P.thickness, hat = P.hatShelf, it = [];
  const even = (from, to, k, type = 'shelf') => { for (let i = 1; i <= k; i++) it.push({ type, y: Math.round(from + ((to - from) * i) / (k + 1)) }); };
  const drawers = (k, h = 180) => { for (let i = 0; i < k; i++) it.push({ type: 'drawer', y: i * h, h }); return k ? k * h : 0; };
  if (kind === 'shelves') even(0, ih, Math.max(1, Math.round(ih / 360) - 1));
  if (kind === 'rod') { it.push({ type: 'fixed', y: ih - hat }, { type: 'rod', y: ih - hat - 60 }); }
  if (kind === 'rodShelves') {
    const yl = Math.max(300, ih - hat - 1050);
    it.push({ type: 'fixed', y: ih - hat }, { type: 'rod', y: ih - hat - 60 }, { type: 'shelf', y: yl });
    even(0, yl, Math.floor(yl / 350));
  }
  if (kind === 'rod2') { const m = Math.round((ih - hat) / 2); it.push({ type: 'fixed', y: ih - hat }, { type: 'rod', y: ih - hat - 60 }, { type: 'fixed', y: m }, { type: 'rod', y: m - 60 }); }
  if (kind === 'drawers') { const top = drawers(Math.min(6, Math.floor(ih / 180))); if (ih - top > 200) even(top, ih, Math.floor((ih - top) / 350)); }
  if (kind === 'drawersShelves') { const top = drawers(Math.min(3, Math.floor(ih / 360))); it.push({ type: 'fixed', y: top }); even(top + t, ih, Math.floor((ih - top) / 360)); }
  return it;
}

export function buildSpec(P) {
  const S = P.sections, n = S.length, t = P.thickness, H = P.height, D = P.depth;
  const W = S.reduce((a, s) => a + s.width, 0) + (n + 1) * t;
  const b = P.base === 'none' ? 0 : P.plinth;
  const ovTop = P.topType === 'overlay', ov = ovTop ? P.topOverhang : 0;
  const sliding = P.doorType === 'sliding';
  const eF = P.edgeFront, eH = P.edgeHidden;
  const zC0 = P.backType === 'overlay' ? -D / 2 + 4 : -D / 2, Dc = D / 2 - zC0;
  const zBack = P.backType === 'groove' ? -D / 2 + 20 : zC0;
  const zF = D / 2 - (sliding ? 90 : 0);
  const yB = b + t, yT = H - t, ih = yT - yB;
  const body = `ЛДСП ${P.bodyName}`;
  const parts = [], extras = [], hw = new Map(), warnings = [];
  const r1 = v => Math.round(v * 10) / 10;
  const addHw = (k, q = 1) => hw.set(k, (hw.get(k) || 0) + q);
  const part = o => {
    const p = { kind: 'panel', mat: 'body', label: body, T: t, holes: [], grooves: [], notes: [], sec: 0, ...o };
    p.edges = { d1: 0, d2: 0, w1: 0, w2: 0, ...(o.edges || {}) };
    parts.push(p); return p;
  };
  const hole = (p, f, u, v, d, h, note) => p.holes.push({ f, u: r1(u), v: r1(v), d, h, note });
  const edgeHole = (p, e, s, d, h, note) => hole(p, e, e === 'w1' ? 0 : e === 'w2' ? p.L : s, e === 'd1' ? 0 : e === 'd2' ? p.W : s, d, h, note);
  const cpos = len => (len > 450 ? [50, len / 2, len - 50] : [50, len - 50]);
  const opp = f => (f === 'A' ? 'B' : 'A');
  // Узел «пласть fp ↔ торец ep». ff — наружная пласть fp, через которую идёт конфирмат; cam — скрытая пласть ep под эксцентрик.
  // Вдоль торца координата точки es совпадает с fv (с точностью до константы), поэтому шкант сдвигается на одну и ту же величину по обоим.
  const conf = (fp, ff, fu, fv, ep, e, es, cam = 'A') => {
    const kind = P.joint || 'confirmat', len = e === 'w1' || e === 'w2' ? ep.W : ep.L;
    const es2 = Math.max(20, Math.min(len - 20, es + (es <= len / 2 ? 32 : -32)));
    const dowel = s => { hole(fp, opp(ff), fu, fv + s - es, 8, 15, 'шкант'); edgeHole(ep, e, s, 8, 20, 'шкант'); addHw('Шкант 8×35'); };
    if (kind === 'minifix') {
      hole(fp, opp(ff), fu, fv, 5, 12, 'минификс: штифт');
      edgeHole(ep, e, es, 8, 34, 'минификс: торец');
      const [cu, cv] = e === 'w1' ? [34, es] : e === 'w2' ? [ep.L - 34, es] : e === 'd1' ? [es, 34] : [es, ep.W - 34];
      hole(ep, cam, cu, cv, 15, 13, 'минификс: эксцентрик');
      addHw('Эксцентрик (минификс) Ø15 + штифт');
      dowel(es2);
    } else if (kind === 'dowel') { dowel(es); dowel(es2); }
    else { hole(fp, ff, fu, fv, 7, 'скв.', 'конфирмат'); edgeHole(ep, e, es, 5, 50, 'конфирмат'); addHw('Конфирмат 7×50'); }
  };

  // ── carcass
  const sideH = H - b - (ovTop ? t : 0);
  const sideE = { d2: eF, w2: ovTop ? 0 : eH, w1: P.base === 'legs' ? eH : 0 };
  const sideL = part({ name: 'Боковина левая', plane: 'yz', L: sideH, W: Dc, c: [-W / 2 + t / 2, b + sideH / 2, zC0 + Dc / 2], edges: sideE });
  const sideR = part({ name: 'Боковина правая', plane: 'yz', L: sideH, W: Dc, c: [W / 2 - t / 2, b + sideH / 2, zC0 + Dc / 2], edges: sideE });
  const bottom = part({ name: 'Дно', plane: 'xz', L: W - 2 * t, W: Dc, c: [0, b + t / 2, zC0 + Dc / 2], edges: { d2: eF } });
  for (const v of cpos(Dc)) { conf(sideL, 'A', t / 2, v, bottom, 'w1', v, 'B'); conf(sideR, 'B', t / 2, v, bottom, 'w2', v, 'B'); }
  let top, topX0;
  if (ovTop) {
    top = part({ name: 'Крышка', plane: 'xz', L: W + 2 * ov, W: Dc + ov, c: [0, H - t / 2, zC0 + (Dc + ov) / 2], edges: { d2: eF, w1: eF, w2: eF, d1: ov ? eH : 0 } });
    topX0 = -W / 2 - ov;
    for (const v of cpos(Dc)) { conf(top, 'A', ov + t / 2, v, sideL, 'w2', v, 'B'); conf(top, 'A', ov + W - t / 2, v, sideR, 'w2', v, 'A'); }
  } else {
    top = part({ name: 'Крышка', plane: 'xz', L: W - 2 * t, W: Dc, c: [0, H - t / 2, zC0 + Dc / 2], edges: { d2: eF } });
    topX0 = -W / 2 + t;
    for (const v of cpos(Dc)) { conf(sideL, 'A', sideH - t / 2, v, top, 'w1', v, 'A'); conf(sideR, 'B', sideH - t / 2, v, top, 'w2', v, 'A'); }
  }
  if (P.backType === 'groove') {
    for (const [p, f] of [[sideL, 'B'], [sideR, 'A'], [bottom, 'A'], [top, 'B']]) p.grooves.push({ f, axis: 'u', at: 16, w: 4.5, depth: 8, note: 'паз под ХДФ' });
    part({ name: 'Задняя стенка', mat: 'back', label: 'ХДФ', T: 4, plane: 'xy', L: W - 2 * t + 14, W: ih + 14, c: [0, (yB + yT) / 2, -D / 2 + 18], notes: ['устанавливается в паз 4,5×8 мм'] });
  } else if (P.backType === 'overlay') {
    const bk = part({ name: 'Задняя стенка', mat: 'back', label: 'ХДФ', T: 4, plane: 'xy', L: W - 4, W: H - b - 4, c: [0, b + (H - b) / 2, -D / 2 + 2], notes: ['крепится саморезами 3,5×16 с шагом 150 мм'] });
    addHw('Саморез 3,5×16 (для ХДФ)', Math.ceil((2 * (bk.L + bk.W)) / 150) + (n - 1) * Math.ceil(bk.W / 300));
  }
  if (P.base === 'plinth') {
    // Plinth frame under the whole carcass: the sides, dividers and bottom stand on it, not in the air.
    const zP = D / 2 - 50, pd = zP - zC0, fn = ['крепится мебельными уголками к дну'];
    part({ name: 'Цоколь', plane: 'xy', L: W - 2 * t, W: b, c: [0, b / 2, zP - t / 2], edges: { d1: eH }, notes: fn });
    part({ name: 'Цоколь задний', plane: 'xy', L: W - 2 * t, W: b, c: [0, b / 2, zC0 + t / 2], notes: fn });
    for (const sx of [-1, 1]) part({ name: 'Цоколь боковой', plane: 'yz', L: b, W: pd, c: [sx * (W / 2 - t / 2), b / 2, zC0 + pd / 2], notes: ['опора боковины; крепится уголками к дну'] });
    addHw('Уголок мебельный', 8 + 2 * (n + 1));
  }
  if (P.base === 'legs') {
    const lx = W > 1200 ? [-1, 0, 1] : [-1, 1];
    for (const sx of lx) for (const sz of [-1, 1]) extras.push({ kind: 'cyl', mat: 'metal', name: 'Ножка', r: 16, len: b, axis: 'y', c: [sx * (W / 2 - 50), b / 2, sz * (D / 2 - 50)] });
    addHw(`Опора мебельная H=${b} мм`, lx.length * 2);
  }
  if (P.cornice) part({ name: 'Карниз', plane: 'xz', L: W + 30, W: Dc + 20, c: [0, H + t / 2, zC0 + (Dc + 20) / 2], edges: { d2: eF, w1: eF, w2: eF }, notes: ['крепится к крышке саморезами 4×30 снизу'] });

  // ── sections
  const divD = zF - zBack - 1, divZ0 = zBack + 1;
  const bounds = [{ p: sideL, y0: b, z0: zC0, div: false }];
  const shelfBack = zBack + 2, shelfFront = zF - P.shelfSetback, sd = shelfFront - shelfBack;
  const secMeta = [];
  let x0 = -W / 2 + t;
  S.forEach((s, i) => {
    if (i > 0) {
      const xd = x0 - t / 2;
      const dv = part({ name: 'Перегородка', plane: 'yz', L: ih, W: divD, c: [xd, (yB + yT) / 2, divZ0 + divD / 2], edges: { d2: eF }, sec: i });
      for (const v of cpos(divD)) {
        conf(bottom, 'B', xd - (-W / 2 + t), divZ0 + v - zC0, dv, 'w1', v, 'A');
        conf(top, 'A', xd - topX0, divZ0 + v - zC0, dv, 'w2', v, 'A');
      }
      bounds.push({ p: dv, y0: yB, z0: divZ0, div: true });
      if (P.base === 'plinth') part({ name: 'Цоколь средний', plane: 'yz', L: b, W: D / 2 - 50 - zC0, c: [xd, b / 2, zC0 + (D / 2 - 50 - zC0) / 2], sec: i, notes: ['опора перегородки; крепится уголками к дну'] });
    }
    x0 += s.width + t;
  });
  bounds.push({ p: sideR, y0: b, z0: zC0, div: false });

  x0 = -W / 2 + t;
  const mkOnBounds = (L, R) => (y, z, d, h, note) => {
    hole(L.p, 'B', y - L.y0, z - L.z0, d, h, note);
    hole(R.p, 'A', y - R.y0, z - R.z0, d, h, note);
  };
  // Полка, стекло, стационарная полка или штанга в одной колонке (вся секция либо одна из колонок зоны).
  // c = { iw, cx, L, R, xL, xR, sec, onBounds }: ширина, центр, левая и правая опоры, их внутренние грани. Возвращает деталь для полки.
  const emit = (it, c) => {
    const { iw, cx, L, R, xL, xR, sec, onBounds } = c, ya = yB + it.y;
    if (it.type === 'shelf' || it.type === 'glass') {
      const gl = it.type === 'glass';
      const p = part(gl
        ? { name: 'Полка стеклянная', mat: 'glass', label: 'Стекло закалённое', T: 6, plane: 'xz', L: iw - 4, W: sd, c: [cx, ya + 3, shelfBack + sd / 2], sec, notes: ['кромки шлифованные'] }
        : { name: 'Полка съёмная', plane: 'xz', L: iw - 2, W: sd, c: [cx, ya + t / 2, shelfBack + sd / 2], edges: { d2: eF }, sec });
      for (const dy of [-32, 0, 32]) for (const z of [shelfFront - 37, shelfBack + 37]) onBounds(ya - 5 + dy, z, 5, 12, 'полкодержатель');
      addHw(gl ? 'Полкодержатель для стекла' : 'Полкодержатель', 4);
      for (const z of [shelfFront - 37, shelfBack + 37]) for (const sx of [-1, 1]) extras.push({ kind: 'box', mat: 'metal', nc: true, name: 'Полкодержатель', s: [8, 6, 8], c: [sx < 0 ? xL + 4 : xR - 4, ya - 3, z], sec });
      return p;
    }
    if (it.type === 'fixed') {
      const p = part({ name: it.name || (it.auto ? 'Полка антресоли' : 'Полка стационарная'), plane: 'xz', L: iw, W: sd, c: [cx, ya + t / 2, shelfBack + sd / 2], edges: { d2: eF }, sec });
      // у общей перегородки соседние полки на одной высоте дали бы совпадающие отверстия с двух сторон: такую точку сдвигаем
      const clash = (pn, u, v) => pn.holes.some(h => (h.f === 'A' || h.f === 'B') && /конфирмат|минификс|шкант/.test(h.note || '') && Math.abs(h.u - u) < 12 && Math.abs(h.v - v) < 12);
      for (let v of cpos(sd)) {
        const uL = ya + t / 2 - L.y0, uR = ya + t / 2 - R.y0;
        if (clash(L.p, uL, shelfBack + v - L.z0) || clash(R.p, uR, shelfBack + v - R.z0)) v += v + 40 <= sd - 30 ? 40 : -40;
        conf(L.p, 'A', uL, shelfBack + v - L.z0, p, 'w1', v, 'B');
        conf(R.p, 'B', uR, shelfBack + v - R.z0, p, 'w2', v, 'B');
      }
      return p;
    }
    if (it.type === 'rod') {
      const zc = shelfBack + sd / 2;
      extras.push({ kind: 'cyl', mat: 'metal', name: 'Штанга', r: 12.5, len: iw - 2, axis: 'x', c: [cx, ya, zc], sec });
      for (const sx of [-1, 1]) extras.push({ kind: 'cyl', mat: 'metal', nc: true, name: 'Штангодержатель', r: 20, len: 6, axis: 'x', c: [cx + sx * (iw / 2 - 3), ya, zc], sec });
      for (const dz of [-15, 15]) onBounds(ya, zc + dz, 3, 10, 'штангодержатель');
      addHw(`Штанга Ø25, L=${iw - 2} мм`); addHw('Штангодержатель', 2);
    }
    return null;
  };

  S.forEach((s, i) => {
    const iw = s.width, cx = x0 + iw / 2, sec = i + 1;
    const L = bounds[i], R = bounds[i + 1], onBounds = mkOnBounds(L, R);
    const xL = L.p.c[0] + L.p.T / 2, xR = R.p.c[0] - R.p.T / 2, blocks = [];
    const col = { iw, cx, L, R, xL, xR, sec, onBounds };
    const items = [...(s.items || [])];
    if (s.split > 0 && !sliding) items.push({ type: 'fixed', y: ih - s.split - t / 2, auto: true });
    // зона деления по высоте: полка-граница и полуперегородка с двумя колонками
    const z = s.zone, zh = z ? Math.max(0, Math.min(z.h, ih - 2 * t)) : 0, zy0 = z && z.pos === 'top' ? ih - zh : 0;
    if (z) items.push({ type: 'fixed', y: z.pos === 'top' ? zy0 - t : zh, name: 'Полка зоны', zone: true });
    items.sort((a, b2) => a.y - b2.y);
    let prevTop = -1, zoneShelf = null;
    const drawers = [];
    for (const it of items) {
      const ya = yB + it.y;
      const hh = isDrawer(it.type) ? it.h : it.type === 'glass' ? 6 : it.type === 'rod' ? 0 : t;
      if (it.y < -0.5 || it.y + hh > ih + 0.5) warnings.push(`Секция ${sec}: элемент «${itemName(it.type)}» выходит за пределы секции`);
      else if (it.type !== 'rod' && it.y < prevTop - 0.5) warnings.push(`Секция ${sec}: элементы перекрываются на высоте ${Math.round(it.y)} мм`);
      else if (z && !it.zone && it.y < zy0 + zh - 0.5 && it.y + hh > zy0 + 0.5) warnings.push(`Секция ${sec}: элемент «${itemName(it.type)}» попадает в зону деления`);
      if (it.type !== 'rod') prevTop = Math.max(prevTop, it.y + hh);
      if (it.type === 'shelf' || it.type === 'glass' || it.type === 'fixed') blocks.push([ya, ya + hh]);
      if (isDrawer(it.type)) drawers.push({ ...it, ya });
      else { const p = emit(it, col); if (it.zone) zoneShelf = p; }
    }
    if (z) {
      const sp = Math.max(100, Math.min(z.split, iw - t - 100)), xh = xL + sp + t / 2;
      const hd = part({ name: 'Полуперегородка', plane: 'yz', L: zh, W: sd, c: [xh, yB + zy0 + zh / 2, shelfBack + sd / 2], edges: { d2: eF }, sec, notes: ['делит зону секции на две колонки'] });
      const hb = { p: hd, y0: yB + zy0, z0: shelfBack, div: true };
      for (const v of cpos(sd)) {
        const zz = shelfBack + v, su = xh - (cx - iw / 2);
        if (z.pos === 'top') {
          conf(top, 'A', xh - topX0, zz - zC0, hd, 'w2', v, 'A');
          if (zoneShelf) conf(zoneShelf, 'B', su, v, hd, 'w1', v, 'A');
        } else {
          conf(bottom, 'B', xh - (-W / 2 + t), zz - zC0, hd, 'w1', v, 'A');
          if (zoneShelf) conf(zoneShelf, 'A', su, v, hd, 'w2', v, 'A');
        }
      }
      const cols = [
        [z.left, { iw: sp, cx: xL + sp / 2, L, R: hb, xL, xR: xL + sp, sec, onBounds: mkOnBounds(L, hb) }],
        [z.right, { iw: iw - sp - t, cx: xL + sp + t + (iw - sp - t) / 2, L: hb, R, xL: xL + sp + t, xR, sec, onBounds: mkOnBounds(hb, R) }],
      ];
      for (const [list, c] of cols) {
        let top2 = -1;
        for (const it of [...(list || [])].sort((a, b2) => a.y - b2.y)) {
          const hh = it.type === 'glass' ? 6 : t, itn = { ...it, y: zy0 + it.y };
          if (it.y < -0.5 || it.y + hh > zh + 0.5) warnings.push(`Секция ${sec}: полка колонки выходит за пределы зоны`);
          else if (it.y < top2 - 0.5) warnings.push(`Секция ${sec}: полки колонки перекрываются на высоте ${Math.round(it.y)} мм`);
          top2 = Math.max(top2, it.y + hh);
          blocks.push([yB + itn.y, yB + itn.y + hh]);
          emit(itn, c);
        }
      }
    }
    secMeta.push({ x: cx, w: iw, sec: i });
    s._ctx = { iw, cx, L, R, onBounds, drawers, blocks, faceL: xL, faceR: xR, eL: i === 0 ? -W / 2 : L.p.c[0], eR: i === n - 1 ? W / 2 : R.p.c[0] };
    x0 += iw + t;
  });

  const ctx = { P, S, W, H, D, t, b, ovTop, sliding, eF, eH, zF, yB, yT, ih, shelfBack, sd, parts, extras, part, hole, addHw, warnings, body };
  addFronts(ctx);
  S.forEach(s => delete s._ctx);
  return { parts, extras, hw: [...hw.entries()], warnings, meta: { W, H: H + (P.cornice ? t : 0), D, yB, yT, ih, sections: secMeta } };
}

export const itemName = t => ({ shelf: 'Полка', fixed: 'Полка стац.', glass: 'Полка стекло', rod: 'Штанга', drawer: 'Ящик', idrawer: 'Ящик встроенный' }[t] || t);
