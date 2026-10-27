// Furniture spec: every cut part with finished size, edge banding and drilling (mm, y-up, x centred, z front+).
// Panel planes: 'yz' (u=y, v=z from back), 'xz' (u=x from left, v=z from back), 'xy' (u=x from left, v=y from bottom).
// Faces: yz A=-x B=+x · xz A=top B=bottom · xy A=front B=back. Edges: w1 u=0, w2 u=L, d1 v=0, d2 v=W.
import { addFronts } from './model-fronts.js';
import { defaultHw } from './hwparams.js';

/** Порядок этапов сборки; asm у детали и у extra — ключ этапа. */
export const STAGES = ['base', 'carcass', 'dividers', 'fixed', 'back', 'top', 'backOverlay', 'cornice', 'shelves', 'rods', 'drawerBox', 'drawers', 'doors', 'flaps', 'handles', 'kupe', 'final'];
const HW_KINDS = [[/^Конфирмат/, 'confirmat'], [/^Эксцентрик/, 'minifix'], [/^Шкант/, 'dowel'], [/^Полкодержатель/, 'shelfPin'], [/^Штангодержатель/, 'rodHolder'], [/^Штанга/, 'rod'], [/^Петля/, 'hinge'], [/^Направляющие/, 'slide'], [/^Ручка/, 'handle'], [/^Уголок мебельный/, 'bracket'], [/^Опора/, 'leg'], [/^(Саморез|Винт)/, 'screw'], [/^Клей/, 'glue'], [/^Газлифт/, 'gasLift'], [/^Стабилизатор/, 'stay'], [/^Рельс купе/, 'kupeRail'], [/^Профиль купе/, 'kupeProfile'], [/^Ролики/, 'kupeRoller'], [/^Толкатель/, 'pushLatch'], [/^Заглушка/, 'plug'], [/^Навес/, 'hanger'], [/^Анкер/, 'wallFix'], [/^Дюбель/, 'wallDowel']];
/** Категория фурнитуры по названию позиции. */
export const hwKind = name => (HW_KINDS.find(([re]) => re.test(name)) || [0, 'other'])[1];
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

/** opts.hw — параметры фурнитуры выбранных моделей (resolveHw); без них берутся значения по умолчанию. */
export function buildSpec(P, opts = {}) {
  const hw_ = opts.hw || defaultHw(P), pin = hw_.pin;
  const S = P.sections, n = S.length, t = P.thickness, H = P.height, D = P.depth;
  const W = S.reduce((a, s) => a + s.width, 0) + (n + 1) * t;
  const b = P.base === 'none' ? 0 : P.plinth;
  const ovTop = P.topType === 'overlay', ov = ovTop ? P.topOverhang : 0, railed = P.topType === 'rails';
  const sliding = P.doorType === 'sliding';
  const eF = P.edgeFront, eH = P.edgeHidden;
  const zC0 = P.backType === 'overlay' ? -D / 2 + 4 : -D / 2, Dc = D / 2 - zC0;
  const zBack = P.backType === 'groove' ? -D / 2 + 20 : zC0;
  const zF = D / 2 - (sliding ? 90 : 0);
  const yB = b + t, yT = H - t, ih = yT - yB;
  const body = `ЛДСП ${P.bodyName}`;
  const parts = [], extras = [], hw = new Map(), hwx = new Map(), warnings = [];
  let stage = 'carcass';
  const r1 = v => Math.round(v * 10) / 10;
  const addHw = (k, q = 1) => {
    hw.set(k, (hw.get(k) || 0) + q);
    const key = `${k}|${stage}`, e = hwx.get(key) || hwx.set(key, { kind: hwKind(k), name: k, qty: 0, stage }).get(key);
    e.qty += q;
  };
  // крепёж узла относится к этапу детали, которая ставится позже: перегородку к крышке притягивают только после установки крышки
  const at = (st, fn) => { const prev = stage; stage = st; try { return fn(); } finally { stage = prev; } };
  const extra = o => { extras.push({ asm: stage, ...o }); return o; };
  // кромка и углы стекла из справочника (по умолчанию просто шлифованная кромка и прямые углы)
  const glassEdge = () => (hw_.mill.glassChamfer ? `, фаска ${hw_.mill.glassChamfer}×45°` : '') + (hw_.mill.glassCornerR ? `, углы R${hw_.mill.glassCornerR}` : '');
  const part = o => {
    const p = { kind: 'panel', mat: 'body', label: body, T: t, holes: [], grooves: [], notes: [], sec: 0, asm: stage, ...o };
    p.edges = { d1: 0, d2: 0, w1: 0, w2: 0, ...(o.edges || {}) };
    parts.push(p); return p;
  };
  // в общей перегородке мелкие отверстия (полкодержатели, штангодержатели, планки) с двух сторон могут совпасть: 12+12 мм прошили бы плиту, поэтому там не глубже 8 мм
  const effDepth = (p, f, d, h) => ((f === 'A' || f === 'B') && /перегородка/i.test(p.name) && d <= 5 && typeof h === 'number' && h > 8 ? Math.min(8, Math.floor((p.T - 2) / 2)) : h);
  const hole = (p, f, u, v, d, h, note) => p.holes.push({ f, u: r1(u), v: r1(v), d, h: effDepth(p, f, d, h), note });
  // отверстие с пласти f в точке (u, v) прошьёт плиту насквозь, если с обратной пласти в том же месте уже есть глухое и глубины в сумме почти равны толщине
  const pierces = (p, f, u, v, d, h) => { const hh = effDepth(p, f, d, h); return typeof hh === 'number' && p.holes.some(o => (o.f === 'A' || o.f === 'B') && o.f !== f && typeof o.h === 'number' && Math.hypot(o.u - u, o.v - v) < (o.d + d) / 2 + 1 && o.h + hh >= p.T - 1); };
  let later = []; // сверловка полкодержателей и штангодержателей идёт после стыков секции: они обходят уже просверленные гнёзда
  const edgeHole = (p, e, s, d, h, note) => hole(p, e, e === 'w1' ? 0 : e === 'w2' ? p.L : s, e === 'd1' ? 0 : e === 'd2' ? p.W : s, d, h, note);
  const cpos = len => (len > 450 ? [50, len / 2, len - 50] : [50, len - 50]);
  const opp = f => (f === 'A' ? 'B' : 'A');
  // Узел «пласть fp ↔ торец ep». ff — наружная пласть fp, через которую идёт конфирмат; cam — скрытая пласть ep под эксцентрик.
  // Вдоль торца координата точки es совпадает с fv (с точностью до константы), поэтому шкант сдвигается на одну и ту же величину по обоим.
  const conf = (fp, ff, fu, fv, ep, e, es, cam = 'A') => {
    const kind = P.joint || 'confirmat', len = e === 'w1' || e === 'w2' ? ep.W : ep.L;
    const es2 = Math.max(20, Math.min(len - 20, es + (es <= len / 2 ? 32 : -32)));
    const dowel = s => { const df = Math.min(15, fp.T - 3); hole(fp, opp(ff), fu, fv + s - es, 8, df, 'шкант'); edgeHole(ep, e, s, 8, 35 - df, 'шкант'); addHw('Шкант 8×35'); }; // 35 мм = в пласти + в торце; в 16 мм плите остаётся 3 мм
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
  stage = 'carcass';
  const sideH = H - b - (ovTop ? t : 0);
  const sideE = { d2: eF, w2: ovTop ? 0 : eH, w1: P.base === 'legs' ? eH : 0 };
  const sideL = part({ name: 'Боковина левая', plane: 'yz', L: sideH, W: Dc, c: [-W / 2 + t / 2, b + sideH / 2, zC0 + Dc / 2], edges: sideE });
  const sideR = part({ name: 'Боковина правая', plane: 'yz', L: sideH, W: Dc, c: [W / 2 - t / 2, b + sideH / 2, zC0 + Dc / 2], edges: sideE });
  const bottom = part({ name: 'Дно', plane: 'xz', L: W - 2 * t, W: Dc, c: [0, b + t / 2, zC0 + Dc / 2], edges: { d2: eF } });
  for (const v of cpos(Dc)) { conf(sideL, 'A', t / 2, v, bottom, 'w1', v, 'B'); conf(sideR, 'B', t / 2, v, bottom, 'w2', v, 'B'); }
  let top, topX0;
  const tops = [], rw = Math.max(40, Math.min(P.railW || 100, Dc / 2 - 20)), railPts = len => (len >= 140 ? [30, len - 30] : [len / 2]);
  stage = 'top';
  if (railed) {
    topX0 = -W / 2 + t;
    const rear = part({ name: 'Царга задняя', plane: 'xz', L: W - 2 * t, W: rw, c: [0, H - t / 2, zC0 + rw / 2] });
    const front = part({ name: 'Царга передняя', plane: 'xz', L: W - 2 * t, W: rw, c: [0, H - t / 2, zC0 + Dc - rw / 2], edges: { d2: eF } });
    top = rear; tops.push({ p: rear, z0: 0 }, { p: front, z0: Dc - rw });
    for (const tp of tops) for (const v of railPts(rw)) { conf(sideL, 'A', sideH - t / 2, tp.z0 + v, tp.p, 'w1', v, 'A'); conf(sideR, 'B', sideH - t / 2, tp.z0 + v, tp.p, 'w2', v, 'A'); }
  } else if (ovTop) {
    top = part({ name: 'Крышка', plane: 'xz', L: W + 2 * ov, W: Dc + ov, c: [0, H - t / 2, zC0 + (Dc + ov) / 2], edges: { d2: eF, w1: eF, w2: eF, d1: ov ? eH : 0 } });
    topX0 = -W / 2 - ov;
    tops.push({ p: top, z0: 0 });
    for (const v of cpos(Dc)) { conf(top, 'A', ov + t / 2, v, sideL, 'w2', v, 'B'); conf(top, 'A', ov + W - t / 2, v, sideR, 'w2', v, 'A'); }
  } else {
    top = part({ name: 'Крышка', plane: 'xz', L: W - 2 * t, W: Dc, c: [0, H - t / 2, zC0 + Dc / 2], edges: { d2: eF } });
    tops.push({ p: top, z0: 0 });
    topX0 = -W / 2 + t;
    for (const v of cpos(Dc)) { conf(sideL, 'A', sideH - t / 2, v, top, 'w1', v, 'A'); conf(sideR, 'B', sideH - t / 2, v, top, 'w2', v, 'A'); }
  }
  const divXs = S.slice(1).map((_, i) => -W / 2 + t + S.slice(0, i + 1).reduce((a, s) => a + s.width + t, 0) - t / 2);
  const backCuts = (Lb, Hb) => {
    const fit = (a, c) => (a <= 2780 && c <= 2050) || (a <= 2050 && c <= 2780);
    if (fit(Lb, Hb)) return [[-Lb / 2, Lb / 2]];
    const maxL = Hb <= 2050 ? 2780 : 2050;
    for (let k = Math.ceil(Lb / maxL); k <= 12; k++) {
      const xs = [];
      for (let i = 1; i < k; i++) {
        const target = -Lb / 2 + (Lb * i) / k;
        xs.push(divXs.reduce((best, x) => (Math.abs(x - target) < Math.abs(best - target) ? x : best), target));
      }
      const edges = [-Lb / 2, ...xs, Lb / 2];
      const ok = edges.every((e, i) => i === 0 || (e - edges[i - 1] > 150 && e - edges[i - 1] - 1 <= maxL));
      if (ok && new Set(xs).size === xs.length) return edges.slice(1).map((e, i) => [edges[i] + (i ? 0.5 : 0), e - (i < edges.length - 2 ? 0.5 : 0)]);
    }
    const k = Math.ceil(Lb / maxL), edges = Array.from({ length: k + 1 }, (_, i) => -Lb / 2 + (Lb * i) / k);
    warnings.push('Задняя стенка не помещается в лист ХДФ: разбита на ' + k + ' части без опоры под стыком');
    return edges.slice(1).map((e, i) => [edges[i] + (i ? 0.5 : 0), e - (i < k - 1 ? 0.5 : 0)]);
  };
  const backNotes = (cuts, k) => (cuts.length > 1 ? ['часть ' + (k + 1) + ' из ' + cuts.length + ': не помещается в лист, стык по перегородке'] : []);
  const backJoints = (cuts, Hb) => {
    if (cuts.length < 2) return;
    warnings.push('Задняя стенка разбита на ' + cuts.length + ' части (не помещается в лист ХДФ): стык ставится на перегородку');
    addHw('Саморез 3,5×16 (для ХДФ)', (cuts.length - 1) * Math.ceil(Hb / 150));
  };
  stage = 'back';
  if (P.backType === 'groove') {
    for (const [p, f] of [[sideL, 'B'], [sideR, 'A'], [bottom, 'A'], [top, 'B']]) p.grooves.push({ f, axis: 'u', at: 16, w: 4.5, depth: 8, note: 'паз под ХДФ' });
    const Lb = W - 2 * t + 14, cuts = backCuts(Lb, ih + 14);
    cuts.forEach(([a, c], k) => part({ name: 'Задняя стенка', mat: 'back', label: 'ХДФ', T: 4, plane: 'xy', L: c - a, W: ih + 14, c: [(a + c) / 2, (yB + yT) / 2, -D / 2 + 18], notes: ['устанавливается в паз 4,5×8 мм', ...backNotes(cuts, k)] }));
    backJoints(cuts, ih + 14);
  } else if (P.backType === 'overlay') {
    stage = 'backOverlay';
    const cuts = backCuts(W - 4, H - b - 4);
    cuts.forEach(([a, c], k) => {
      const bk = part({ name: 'Задняя стенка', mat: 'back', label: 'ХДФ', T: 4, plane: 'xy', L: c - a, W: H - b - 4, c: [(a + c) / 2, b + (H - b) / 2, -D / 2 + 2], notes: ['крепится саморезами 3,5×16 с шагом 150 мм', ...backNotes(cuts, k)] });
      addHw('Саморез 3,5×16 (для ХДФ)', Math.ceil((2 * (bk.L + bk.W)) / 150));
    });
    addHw('Саморез 3,5×16 (для ХДФ)', (n - 1) * Math.ceil((H - b - 4) / 300));
    backJoints(cuts, H - b - 4);
  }
  stage = 'base';
  if (P.base === 'plinth') {
    // Plinth frame under the whole carcass: the sides, dividers and bottom stand on it, not in the air.
    const zP = D / 2 - 50, pd = zP - zC0, fn = ['крепится мебельными уголками к дну'];
    part({ name: 'Цоколь', plane: 'xy', L: W - 2 * t, W: b, c: [0, b / 2, zP - t / 2], edges: { d1: eH }, notes: fn });
    part({ name: 'Цоколь задний', plane: 'xy', L: W - 2 * t, W: b, c: [0, b / 2, zC0 + t / 2], notes: fn });
    for (const sx of [-1, 1]) part({ name: 'Цоколь боковой', plane: 'yz', L: b, W: pd, c: [sx * (W / 2 - t / 2), b / 2, zC0 + pd / 2], notes: ['опора боковины; крепится уголками к дну'] });
    addHw('Уголок мебельный', 8 + 2 * (n + 1)); addHw('Саморез 4×16 (мебельные уголки)', 2 * (8 + 2 * (n + 1)));
  }
  if (P.base === 'legs') {
    const lx = W > 1200 ? [-1, 0, 1] : [-1, 1];
    for (const sx of lx) for (const sz of [-1, 1]) extra({ kind: 'cyl', mat: 'metal', name: 'Ножка', r: 16, len: b, axis: 'y', c: [sx * (W / 2 - 50), b / 2, sz * (D / 2 - 50)] });
    addHw(`Опора мебельная H=${b} мм`, lx.length * 2);
  }
  stage = 'cornice';
  if (P.cornice) addHw('Саморез 4×30 (карниз)', Math.ceil((2 * (W + 30 + Dc + 20)) / 300));
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
      stage = 'dividers';
      const dv = part({ name: 'Перегородка', plane: 'yz', L: ih, W: divD, c: [xd, (yB + yT) / 2, divZ0 + divD / 2], edges: { d2: eF }, sec: i });
      for (const v of cpos(divD)) {
        conf(bottom, 'B', xd - (-W / 2 + t), divZ0 + v - zC0, dv, 'w1', v, 'A');
        if (!railed) at('top', () => conf(top, 'A', xd - topX0, divZ0 + v - zC0, dv, 'w2', v, 'A'));
      }
      if (railed) for (const tp of tops) at('top', () => conf(tp.p, 'A', xd - topX0, rw / 2, dv, 'w2', zC0 + tp.z0 + rw / 2 - divZ0, 'A'));
      bounds.push({ p: dv, y0: yB, z0: divZ0, div: true });
      if (P.base === 'plinth') { at('dividers', () => part({ name: 'Цоколь средний', plane: 'yz', L: b, W: D / 2 - 50 - zC0 - 2 * t, c: [xd, b / 2, zC0 + t + (D / 2 - 50 - zC0 - 2 * t) / 2], sec: i, notes: ['опора перегородки; ставится после стяжки перегородки (конфирматы идут снизу через дно); крепится уголками к дну'] })); }
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
    stage = it.type === 'fixed' ? 'fixed' : it.type === 'rod' ? 'rods' : 'shelves';
    if (it.type === 'shelf' || it.type === 'glass') {
      const gl = it.type === 'glass';
      const p = part(gl
        ? { name: 'Полка стеклянная', mat: 'glass', label: 'Стекло закалённое', T: 6, plane: 'xz', L: iw - 4, W: sd, c: [cx, ya + 3, shelfBack + sd / 2], sec, notes: ['кромки шлифованные' + glassEdge()] }
        : { name: 'Полка съёмная', plane: 'xz', L: iw - 2, W: sd, c: [cx, ya + t / 2, shelfBack + sd / 2], edges: { d2: eF }, sec });
      // три ряда отверстий с шагом 32; ряд, не поместившийся на опоре (полка у края), не сверлится
      const yLo = Math.max(L.y0, R.y0), yHi = Math.min(L.y0 + L.p.L, R.y0 + R.p.L);
      later.push(() => at('shelves', () => {
        const rows = [-pin.pitch, 0, pin.pitch].map(dy => ({ dy, y: ya - 5 + dy })).filter(r => r.y - pin.d / 2 >= yLo - 0.01 && r.y + pin.d / 2 <= yHi + 0.01);
        const free = (y, z) => !pierces(L.p, 'B', y - L.y0, z - L.z0, pin.d, pin.depth) && !pierces(R.p, 'A', y - R.y0, z - R.z0, pin.d, pin.depth);
        const mid = rows.find(r => r.dy === 0);
        // средний ряд держит полку: если против него гнездо эксцентрика с другой стороны, точка сдвигается вдоль глубины (спереди и сзади независимо)
        const pickZ = z0 => { if (!mid) return z0; for (const t of [0, 10, -10, 20, -20]) { const z = z0 + t; if (z >= shelfBack + 12 && z <= shelfFront - 12 && free(mid.y, z)) return z; } return z0; };
        const zs = [pickZ(shelfFront - pin.offset), pickZ(shelfBack + pin.offset)];
        for (const r of rows) for (const z of zs) if (r.dy === 0 || free(r.y, z)) onBounds(r.y, z, pin.d, pin.depth, 'полкодержатель'); // лишний ряд против гнезда пропускается
        addHw(gl ? 'Полкодержатель для стекла' : 'Полкодержатель', 4);
        for (const z of zs) for (const sx of [-1, 1]) extra({ kind: 'box', mat: 'metal', nc: true, name: 'Полкодержатель', s: [8, 6, 8], c: [sx < 0 ? xL + 4 : xR - 4, ya - 3, z], sec });
      }));
      return p;
    }
    if (it.type === 'fixed') {
      const p = part({ name: it.name || (it.auto ? 'Полка антресоли' : 'Полка стационарная'), plane: 'xz', L: iw, W: sd, c: [cx, ya + t / 2, shelfBack + sd / 2], edges: { d2: eF }, sec });
      // у общей перегородки соседние полки на одной высоте дали бы совпадающие отверстия с двух сторон: такую точку сдвигаем
      const clash = (pn, u, v) => pn.holes.some(h => (h.f === 'A' || h.f === 'B') && /конфирмат|минификс|шкант|полкодержатель|штангодержатель/.test(h.note || '') && Math.abs(h.u - u) < 12 && Math.abs(h.v - v) < 12);
      for (let v of cpos(sd)) {
        const uL = ya + t / 2 - L.y0, uR = ya + t / 2 - R.y0;
        // у шканта и минификса узел — две точки (вторая в 32 мм): проверяем обе и пробуем несколько сдвигов
        const pts = w => (P.joint === 'dowel' || P.joint === 'minifix' ? [w, Math.max(20, Math.min(sd - 20, w + (w <= sd / 2 ? 32 : -32)))] : [w]);
        const bad = w => pts(w).some(x => clash(L.p, uL, shelfBack + x - L.z0) || clash(R.p, uR, shelfBack + x - R.z0));
        if (bad(v)) {
          const dir = v + 40 <= sd - 30 ? 1 : -1;
          const cand = [dir * 40, -dir * 40];
          for (let d = 14; d <= sd; d += 2) cand.push(dir * d, -dir * d);
          v = cand.map(d => v + d).find(w => w >= 30 && w <= sd - 30 && !bad(w)) ?? v + dir * 40;
        }
        conf(L.p, 'A', uL, shelfBack + v - L.z0, p, 'w1', v, 'B');
        conf(R.p, 'B', uR, shelfBack + v - R.z0, p, 'w2', v, 'B');
      }
      return p;
    }
    if (it.type === 'rod') {
      later.push(() => at('rods', () => {
        let zc = shelfBack + sd / 2;
        const free = z => [-15, 15].every(dz => !pierces(L.p, 'B', ya - L.y0, z + dz - L.z0, 3, 10) && !pierces(R.p, 'A', ya - R.y0, z + dz - R.z0, 3, 10));
        if (!free(zc)) for (const t of [10, -10, 20, -20, 30, -30]) if (free(zc + t)) { zc += t; break; } // штанга сдвигается вдоль глубины, если держатель попал против гнезда
        extra({ kind: 'cyl', mat: 'metal', name: 'Штанга', r: 12.5, len: iw - 2, axis: 'x', c: [cx, ya, zc], sec });
        for (const sx of [-1, 1]) extra({ kind: 'cyl', mat: 'metal', nc: true, name: 'Штангодержатель', r: 20, len: 6, axis: 'x', c: [cx + sx * (iw / 2 - 3), ya, zc], sec });
        for (const dz of [-15, 15]) onBounds(ya, zc + dz, 3, 10, 'штангодержатель');
        addHw(`Штанга Ø25, L=${iw - 2} мм`); addHw('Штангодержатель', 2); addHw('Саморез 4×16 (штангодержатель)', 4);
      }));
    }
    return null;
  };

  S.forEach((s, i) => {
    const iw = s.width, cx = x0 + iw / 2, sec = i + 1;
    const L = bounds[i], R = bounds[i + 1], onBounds = mkOnBounds(L, R);
    const xL = L.p.c[0] + L.p.T / 2, xR = R.p.c[0] - R.p.T / 2, blocks = [];
    const col = { iw, cx, L, R, xL, xR, sec, onBounds };
    later = [];
    const items = [...(s.items || [])];
    if (s.split > 0 && sliding) warnings.push(`Секция ${sec}: антресоль не строится при дверях-купе`);
    if (s.split > 0 && !sliding) items.push({ type: 'fixed', y: ih - s.split - t / 2, auto: true });
    // зона деления по высоте: полка-граница и полуперегородка с двумя колонками
    let z = s.zone, zh = z ? Math.max(0, Math.min(z.h, ih - 2 * t)) : 0;
    if (z && zh < 60) { warnings.push(`Секция ${sec}: зона деления не помещается по высоте`); z = null; zh = 0; }
    const zy0 = z && z.pos === 'top' ? ih - zh : 0;
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
      else {
        const p = emit(it, col), ix = (s.items || []).indexOf(it);
        if (it.zone) zoneShelf = p;
        if (p && ix >= 0 && (it.type === 'shelf' || it.type === 'glass' || it.type === 'fixed')) Object.defineProperty(p, 'item', { value: ix });
      }
    }
    if (z) {
      const sp = Math.max(100, Math.min(z.split, iw - t - 100)), xh = xL + sp + t / 2;
      stage = 'fixed';
      const hd = part({ name: 'Полуперегородка', plane: 'yz', L: zh, W: sd, c: [xh, yB + zy0 + zh / 2, shelfBack + sd / 2], edges: { d2: eF }, sec, notes: ['делит зону секции на две колонки'] });
      const hb = { p: hd, y0: yB + zy0, z0: shelfBack, div: true };
      for (const v of cpos(sd)) {
        const zz = shelfBack + v, su = xh - (cx - iw / 2);
        if (z.pos === 'top') {
          at('top', () => conf(top, 'A', xh - topX0, zz - zC0, hd, 'w2', v, 'A'));
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
    later.forEach(f => f());
    secMeta.push({ x: cx, w: iw, sec: i });
    s._ctx = { iw, cx, L, R, onBounds, drawers, blocks, faceL: xL, faceR: xR, eL: i === 0 ? -W / 2 : L.p.c[0], eR: i === n - 1 ? W / 2 : R.p.c[0] };
    x0 += iw + t;
  });

  if (P.wallFix) {
    stage = 'final';
    if (P.type === 'kwall') { addHw('Навес кухонный регулируемый (комплект)', 2); addHw('Дюбель с шурупом 6×60 (в стену)', 2); }
    else { addHw('Анкерный уголок для крепления к стене', 2); addHw('Саморез 4×16 (уголок к корпусу)', 2); addHw('Дюбель с шурупом 6×60 (в стену)', 2); }
  }
  stage = 'doors';
  const ctx = { hw: hw_, pierces, setStage: v => { stage = v; }, extra, P, S, W, H, D, t, b, ovTop, sliding, eF, eH, zF, yB, yT, ih, shelfBack, sd, parts, extras, part, hole, addHw, warnings, body };
  addFronts(ctx);
  S.forEach(s => delete s._ctx);
  applyCutouts(P, parts, warnings);
  const dowels = [...hw].filter(([k]) => /^Шкант/.test(k)).reduce((a, [, q]) => a + q, 0);
  if (dowels) at('carcass', () => addHw('Клей ПВА столярный, 250 г', Math.ceil(dowels / 200)));
  if ((P.joint || 'confirmat') === 'confirmat') {
    const vis = [[sideL, 'A'], [sideR, 'B'], ...tops.map(tp => [tp.p, 'A'])];
    const heads = vis.reduce((a, [p, f]) => a + p.holes.filter(h => h.f === f && h.d === 7 && h.h === 'скв.').length, 0);
    if (heads) { at('final', () => addHw('Заглушка на конфирмат', heads)); for (const [p] of vis) p.notes.push('шляпки конфирматов на лицевой пласти закрыть заглушками под цвет корпуса'); }
  }
  return { parts, extras, hwx: [...hwx.values()], hw: [...hw.entries()], warnings, meta: { W, H: H + (P.cornice ? t : 0), D, yB, yT, ih, sections: secMeta } };
}

/** Вырезы проекта (P.cutouts) ложатся на детали по имени; в детали — p.cutouts = [{ kind, u0, v0, u1, v1, r, corner? }] в её координатах. */
function applyCutouts(P, parts, warnings) {
  for (const c of P.cutouts || []) {
    const targets = parts.filter(p => p.name === c.part && (!c.sec || p.sec === c.sec));
    if (!targets.length) { warnings.push(`Вырез: деталь «${c.part}»${c.sec ? ` (секция ${c.sec})` : ''} не найдена`); continue; }
    for (const p of targets) {
      let u0, u1, v0, v1;
      if (c.kind === 'notch') { [u0, u1] = c.corner[1] === '1' ? [0, c.w] : [p.L - c.w, p.L]; [v0, v1] = c.corner[3] === '1' ? [0, c.h] : [p.W - c.h, p.W]; }
      else { u0 = c.u - c.w / 2; u1 = c.u + c.w / 2; v0 = c.v - c.h / 2; v1 = c.v + c.h / 2; }
      const r1 = x => Math.round(x * 10) / 10;
      if (c.kind === 'notch' ? c.w > p.L - 20 || c.h > p.W - 20 : u0 < 10 || v0 < 10 || u1 > p.L - 10 || v1 > p.W - 10) warnings.push(`Вырез на «${p.name}»${p.sec ? ` (секция ${p.sec})` : ''} не помещается в деталь ${Math.round(p.L)}×${Math.round(p.W)} мм (до края не меньше 10 мм)`);
      (p.cutouts = p.cutouts || []).push({ kind: c.kind, u0: r1(u0), v0: r1(v0), u1: r1(u1), v1: r1(v1), r: c.r, ...(c.kind === 'notch' ? { corner: c.corner } : {}) });
    }
  }
}

export const itemName = t => ({ shelf: 'Полка', fixed: 'Полка стац.', glass: 'Полка стекло', rod: 'Штанга', drawer: 'Ящик', idrawer: 'Ящик встроенный' }[t] || t);
