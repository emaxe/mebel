// Doors, flaps, drawers, sliding leaves and handles. Mutates ctx (parts/extras/hardware).
// Moving groups: hinge (pivot on the front edge of the door), slide (drawer, +z), slidex (sliding leaf, +x).
// Extras with nc:true are hardware drawn for realism only (not part of the collision model); kind:'link' is a rod
// between a fixed point `a` and a point `b` that rides on `group` (hinge arm, stay, gas lift).
const spread = (len, k, m) => (k === 1 ? [len / 2] : Array.from({ length: k }, (_, i) => m + ((len - 2 * m) * i) / (k - 1)));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const nz = v => String(Math.round(v * 10) / 10).replace('.', ',');

import { slideLen, hingeCount } from './hwparams.js';
import { facadeMass, liftForce, pickLift, HANDLE_MASS } from './norms.js';
export { hingeCount };
const slideName = (P, sl) => (P.push ? sl.name.replace(/ с доводчиком$/, '') + ' push-to-open' : sl.name);

// Move hinge heights (absolute y) off the shelves: the plate and arm occupy ±half around each hinge.
function placeHinges(want, lo, hi, blocks, half = 22, minGap = 80) {
  const free = y => blocks.every(([a, b]) => b <= y - half || a >= y + half);
  const out = []; let bad = false;
  for (const y of want) {
    const ok = v => v >= lo && v <= hi && free(v) && out.every(o => Math.abs(o - v) >= minGap);
    let best = ok(y) ? y : null;
    if (best === null) for (const v of blocks.flatMap(([a, b]) => [b + half, a - half])) if (ok(v) && (best === null || Math.abs(v - y) < Math.abs(best - y))) best = v;
    if (best === null) { bad = true; best = y; }
    out.push(best);
  }
  return { ys: out.sort((a, b) => a - b), bad };
}

export function addFronts(ctx) {
  const { P, S, W, H, D, t, b, ovTop, sliding, eF, eH, zF, yB, yT, ih, shelfBack, part, parts, hole, addHw, extra, setStage, warnings, body, hw, pierces } = ctx;
  const fT = P.frontT, hs = P.handleSize;
  const sl = hw.slide, hingeAng = P.hinge === 'wide' ? 165 : 110;
  const hingeSoft = P.hinge !== 'plain';
  const allE = { d1: eF, d2: eF, w1: eF, w2: eF };
  const frontLabel = st => (st === 'shaker' ? `МДФ ${P.frontName}, фрезеровка «рамка»` : st === 'glass' ? `МДФ ${P.frontName}, под стекло` : `ЛДСП ${P.frontName}`);
  const yd0 = b + 2, yd1 = (ovTop ? H - t : H) - 2;
  // front-panel span of a drawer whose front closes the opening (overlay): first/last cover the bottom/top panel
  const overlayY = d => [d.y <= 0.5 ? yd0 : d.ya + 1.5, d.y + d.h >= ih - 0.5 ? yd1 : d.ya + d.h - 1.5];

  const handleWarned = new Set();
  function handle(p, u, v, orient, group, sec) {
    if (P.handle === 'none') return;
    if (P.handle === 'bar') {
      // скоба (с запасом по концам и зазором между створками) должна лежать на фасаде, иначе отверстия уйдут за край, а ручки соседних створок сойдутся
      const along = orient === 'v' ? p.W : p.L, need = orient === 'v' ? hs + 100 : hs + 46; // вертикальная скоба стоит в 80 мм от края фасада, горизонтальная — с запасом 40 мм по концам и зазором между створками
      if (along < need && !handleWarned.has(sec + orient)) { handleWarned.add(sec + orient); warnings.push(`Секция ${sec}: ручка-скоба ${hs} мм не помещается на фасад (${Math.round(along)} мм): выберите меньшее межосевое или ручки вертикально`); }
    }
    setStage('handles');
    const x = p.c[0] - p.L / 2 + u, y = p.c[1] - p.W / 2 + v, z = p.c[2] + p.T / 2;
    const vert = orient === 'v';
    if (P.handle === 'bar') {
      for (const s of [-hs / 2, hs / 2]) {
        hole(p, 'A', vert ? u : u + s, vert ? v + s : v, 5, 'скв.', `ручка ${hs} мм`);
        extra({ kind: 'cyl', mat: 'metal', name: 'Ручка', r: 5, len: 30, axis: 'z', c: [vert ? x : x + s, vert ? y + s : y, z + 15], group, sec });
      }
      extra({ kind: 'cyl', mat: 'metal', name: 'Ручка', r: 6, len: hs + 40, axis: vert ? 'y' : 'x', c: [x, y, z + 30], group, sec });
      addHw(`Ручка-скоба ${hs} мм`); addHw(`Винт М4×${Math.ceil((p.T + 14) / 5) * 5} (ручка-скоба)`, 2);
    } else if (P.handle === 'knob') {
      hole(p, 'A', u, v, 5, 'скв.', 'ручка-кнопка');
      extra({ kind: 'cyl', mat: 'metal', name: 'Ручка', r: 6, len: 20, axis: 'z', c: [x, y, z + 10], group, sec });
      extra({ kind: 'sphere', mat: 'metal', name: 'Ручка', r: 14, c: [x, y, z + 26], group, sec });
      addHw('Ручка-кнопка'); addHw(`Винт М4×${Math.ceil((p.T + 14) / 5) * 5} (ручка-кнопка)`);
    } else if (P.handle === 'profile') {
      // edge profile: never longer than the panel, centred as requested but kept inside the panel
      const ext = vert ? p.W : p.L, len = clamp(ext - 60, 40, 400), c0 = vert ? v : u;
      const cc = ext >= len + 20 ? clamp(c0, len / 2 + 10, ext - len / 2 - 10) : ext / 2;
      const px = vert ? x : p.c[0] - p.L / 2 + cc, py = vert ? p.c[1] - p.W / 2 + cc : y;
      extra({ kind: 'box', mat: 'metal', name: 'Ручка', s: vert ? [14, len, 22] : [len, 14, 22], c: [px, py, z + 11], group, sec });
      // два глухих отверстия под саморезы с обратной стороны, по 15 мм от концов профиля
      const lu = vert ? u : cc, lv = vert ? cc : v, ds = len / 2 - 15;
      for (const s of [-ds, ds]) hole(p, 'B', vert ? lu : lu + s, vert ? lv + s : lv, 3, Math.min(10, p.T - 4), 'ручка-профиль: саморез');
      p.notes.push(`ручка-профиль ${Math.round(len)} мм: центр ${nz(lu)}/${nz(lv)} мм, ${vert ? 'вертикально' : 'горизонтально'}; саморезы с обратной стороны`);
      addHw(`Ручка-профиль ${Math.round(len)} мм`); addHw('Саморез 3×16 (ручка-профиль)', 2);
    }
  }

  // Несущая панель откидного фасада: неподвижная горизонтальная деталь, чья верхняя (фасад откидывается вниз) или нижняя грань лежит на высоте y и накрывает точку (x, z).
  const findSupport = (y, down, x, z) => parts.find(q => !q.group && q.plane === 'xz' && Math.abs(x - q.c[0]) <= q.L / 2 && Math.abs(z - q.c[2]) <= q.W / 2 && Math.abs((down ? q.c[1] + q.T / 2 : q.c[1] - q.T / 2) - y) <= 1);

  // cup + mounting plate + arm of one hinge. Plate sits at (px, py, D/2-37), cup on the back of the door at (cx_, cy_).
  function hingeHw(sec, group, plate, cup, hp) {
    const zb = D / 2 + 1;
    extra({ kind: 'box', mat: 'metal', nc: true, name: 'Планка петли', s: plate.s, c: [plate.x, plate.y, D / 2 - hp.plateSetback], sec });
    extra({ kind: 'cyl', mat: 'metal', nc: true, name: 'Чашка петли', r: hp.cupD / 2, len: hp.cupDepth, axis: 'z', c: [cup.x, cup.y, zb + hp.cupDepth / 2], group, sec });
    extra({ kind: 'cyl', mat: 'metal', nc: true, name: 'Чашка петли', r: 20, len: 1, axis: 'z', c: [cup.x, cup.y, zb - 0.5], group, sec });
    extra({ kind: 'link', mat: 'metal', nc: true, r: 4, a: [plate.ax, plate.ay, D / 2 - (hp.plateSetback - 7)], b: [cup.x, cup.y, zb - 1], group, sec });
  }

  function door({ sec, c, x0, y0, w, h, kind, style, bound, upper, k, sup }) {
    const zb = D / 2 + 1, zf = zb + fT, z = zb + fT / 2, cx = x0 + w / 2, cy = y0 + h / 2;
    const flap = kind === 'down' || kind === 'up';
    // параметры петли: накладная, полунакладная (на перегородке) или для откидного фасада — у каждой своя модель
    const hp = flap ? hw.hingeFlap : bound.div ? hw.hingeHalf : hw.hinge;
    setStage(flap ? 'flaps' : 'doors');
    const pivot = kind === 'left' ? [x0, cy, zf] : kind === 'right' ? [x0 + w, cy, zf] : [cx, kind === 'down' ? y0 : y0 + h, zf];
    const group = { id: `door_${sec}_${k}`, type: 'hinge', axis: flap ? 'x' : 'y', dir: kind === 'left' ? -1 : kind === 'right' ? 1 : kind === 'down' ? 1 : -1, pivot, flap, maxAngle: flap ? 90 : P.hinge === 'wide' ? 165 : 90 };
    const p = part({ name: flap ? 'Фасад откидной' : 'Фасад двери', mat: 'front', label: frontLabel(style), T: fT, plane: 'xy', L: w, W: h, c: [cx, cy, z], edges: style === 'shaker' || style === 'glass' ? {} : allE, style, sec, group });
    const mm = hw.mill, win = [w - 2 * mm.frameW, h - 2 * mm.frameW];
    if (style === 'shaker') {
      p.notes.push(`фрезеровка рамки ${mm.frameW} мм`, 'МДФ: кромка не нужна, торцы красятся или обтягиваются плёнкой');
      p.mill = { kind: 'shaker', face: 'A', frameW: mm.frameW, window: win, depth: mm.recessDepth, cornerR: mm.cornerR };
    }
    if (style === 'glass') {
      p.notes.push(`фрезеровка под стекло, рамка ${mm.frameW} мм`, 'МДФ: кромка не нужна, торцы красятся или обтягиваются плёнкой');
      p.mill = { kind: 'glass', face: 'B', frameW: mm.frameW, window: win, rebate: [win[0] + 2 * mm.glassOverlap, win[1] + 2 * mm.glassOverlap], rebateDepth: mm.rebateDepth, cornerR: mm.cornerR };
      const ge = (mm.glassChamfer ? `, фаска ${mm.glassChamfer}×45°` : '') + (mm.glassCornerR ? `, углы R${mm.glassCornerR}` : '');
      const gw = w - 2 * (mm.frameW - mm.glassOverlap), gh = h - 2 * (mm.frameW - mm.glassOverlap);
      if (gw < 10 || gh < 10) warnings.push(`Секция ${sec}: фасад ${Math.round(w)}×${Math.round(h)} мм слишком мал для окна под стекло, стекло не создано`);
      else part({ name: 'Стекло фасада', mat: 'glass', label: 'Стекло матовое', T: 4, plane: 'xy', L: gw, W: gh, c: [cx, cy, z - fT / 2 + 4], sec, group, notes: ['вставка в фасад, кромка шлифованная' + ge] });
    }
    if (style === 'mirror') {
      if (w - 120 >= 30 && h - 120 >= 30) part({ name: 'Зеркало', mat: 'mirror', label: 'Зеркало', T: 4, plane: 'xy', L: w - 120, W: h - 120, c: [cx, cy, z + fT / 2 + 2], sec, group, notes: ['клеится на фасад, кромка шлифованная'] });
      else warnings.push(`Секция ${sec}: фасад ${Math.round(w)}×${Math.round(h)} мм слишком мал для зеркала, оно не поставлено`);
    }

    if (!flap) {
      const left = kind === 'left', nh = hingeCount(h);
      const { ys, bad } = placeHinges(spread(h, nh, hp.endOffset).map(v => y0 + v), y0 + 50, y0 + h - 50, c.blocks);
      if (bad) warnings.push(`Секция ${sec}: петля двери попадает на полку — сдвиньте полку`);
      const xf = left ? c.faceL : c.faceR, cupX = left ? x0 + hp.cupEdge : x0 + w - hp.cupEdge, sg = left ? 1 : -1;
      for (const y of ys) {
        hole(p, 'B', left ? hp.cupEdge : w - hp.cupEdge, y - y0, hp.cupD, hp.cupDepth, 'чашка петли');
        for (const dy of [-hp.plateSpacing / 2, hp.plateSpacing / 2]) hole(bound.p, left ? 'B' : 'A', y + dy - bound.y0, D / 2 - hp.plateSetback - bound.z0, hp.plateD, hp.plateDepth, 'планка петли');
        hingeHw(sec, group, { s: [3, 42, 24], x: xf + sg * 1.5, y, ax: xf + sg * 3, ay: y }, { x: cupX, y }, hp);
      }
      addHw(`Петля ${bound.div ? 'полунакладная' : 'накладная'} ${hingeAng}° ${hingeSoft ? 'с доводчиком' : 'без доводчика'}`, nh);
      addHw('Саморез 3,5×16 (планка петли)', 2 * nh);
      if (P.push) { setStage('handles'); addHw('Толкатель push-to-open', h > 1600 ? 2 : 1); }
      const hv = h > 1200 ? clamp(1000 - y0, 150 + hs / 2, h - 150 - hs / 2) : upper ? 80 + hs / 2 : h - 80 - hs / 2;
      // a horizontal bar sits fully inside its own door: on double doors the two bars must not meet over the gap
      const edge = P.handleOrient === 'h' && P.handle === 'bar' ? hs / 2 + 40 : 40, hu = w >= 2 * edge ? (left ? w - edge : edge) : w / 2;
      handle(p, hu, P.handleOrient === 'v' ? hv : clamp(hv, 40, h - 40), P.handleOrient, group, sec);
    } else {
      const nh = w > 900 ? 3 : 2, down = kind === 'down';
      const cupY = down ? y0 + hp.cupEdge : y0 + h - hp.cupEdge, sg = down ? 1 : -1;
      for (const u of spread(w, nh, hp.endOffset)) {
        hole(p, 'B', u, down ? hp.cupEdge : h - hp.cupEdge, hp.cupD, hp.cupDepth, 'чашка петли');
        hingeHw(sec, group, { s: [40, 3, 24], x: x0 + u, y: sup + sg * 1.5, ax: x0 + u, ay: sup + sg * 3 }, { x: x0 + u, y: cupY }, hp);
        // отверстия под ответную планку на несущей панели: пара вдоль x, грань сверху (откидной вниз) или снизу (подъёмный)
        const zp = D / 2 - hp.plateSetback, sp = findSupport(sup, down, x0 + u, zp);
        if (sp) for (const dx of [-hp.plateSpacing / 2, hp.plateSpacing / 2]) hole(sp, down ? 'A' : 'B', x0 + u + dx - (sp.c[0] - sp.L / 2), zp - (sp.c[2] - sp.W / 2), hp.plateD, hp.plateDepth, 'планка петли откидного');
        else if (!p.notes.includes('ответные планки петель — разметка по месту')) { p.notes.push('ответные планки петель — разметка по месту'); warnings.push(`Секция ${sec}: нет опорной панели под планки откидного фасада`); }
      }
      addHw(kind === 'up' ? 'Петля для откидного фасада (вверх)' : 'Петля для откидного фасада (вниз)', nh);
      addHw('Саморез 3,5×16 (планка петли)', 2 * nh);
      if (kind === 'up') {
        const mass = facadeMass({ w, h, T: fT, style, frameW: hw.mill.frameW }) + (P.handle === 'none' ? 0 : HANDLE_MASS), f = liftForce(mass), n = pickLift(f);
        p.notes.push(`масса фасада ${mass.toFixed(1)} кг: газлифты 2 × ${n ?? '150+'} Н`);
        if (n === null) warnings.push(`Секция ${sec}: подъёмный фасад ${mass.toFixed(1)} кг тяжелее, чем держат газлифты 150 Н (нужно ${Math.ceil(f)} Н на каждый): разделите фасад или сделайте дверь`);
        addHw(`Газлифт подъёмный ${n ?? 150}N`, 2);
      } else addHw('Стабилизатор откидного фасада', 2);
      addHw('Саморез 4×16 (крепление стабилизатора)', 8);
      // stays on both side walls: from the wall to a bracket on the back of the flap
      const yS = placeHinges([down ? y0 + 0.7 * h : y0 + h - 0.7 * h], y0 + 30, y0 + h - 30, c.blocks, 14, 0).ys[0];
      for (const sx of [-1, 1]) {
        const xw = sx < 0 ? c.faceL : c.faceR, xb = xw - sx * 8;
        extra({ kind: 'box', mat: 'metal', nc: true, name: 'Кронштейн', s: [20, 30, 3], c: [xb, yS, zb - 1.5], group, sec });
        extra({ kind: 'link', mat: 'metal', nc: true, r: 3, a: [xw - sx * 1.5, yS, D / 2 - 30], b: [xb, yS, zb - 3], group, sec });
        // крепление стабилизатора или газлифта к боковой опоре: два отверстия по системе 32
        const wall = sx < 0 ? c.L : c.R;
        for (const dy of [-16, 16]) hole(wall.p, sx < 0 ? 'B' : 'A', yS + dy - wall.y0, D / 2 - 30 - wall.z0, 5, 12, kind === 'up' ? 'крепление газлифта' : 'крепление стабилизатора');
      }
      if (P.push) { setStage('handles'); addHw('Толкатель push-to-open', 1); }
      handle(p, w / 2, down ? h - 50 : 50, 'h', group, sec);
    }
  }

  // hinged doors per section
  if (!sliding) S.forEach((s, i) => {
    if (s.door === 'none') return;
    const c = s._ctx, sec = i + 1, span = c.eR - c.eL;
    const vis = c.drawers.filter(d => d.type === 'drawer');
    const lo = s.drawerFronts === 'overlay' && vis.length ? Math.max(yd0, ...vis.map(d => overlayY(d)[1] + 3)) : yd0;
    // [from, to, upper, support under the zone (flap down hinges on it), support above the zone (flap up)]
    const zones = s.split > 0
      ? [[lo, yT - s.split - 1.5, false, yB, yT - s.split - t / 2], [yT - s.split + 1.5, yd1, true, yT - s.split + t / 2, yT]]
      : [[lo, yd1, false, yB, yT]];
    let k = 0;
    for (const [z0, z1, upper, supDown, supUp] of zones) {
      const h = z1 - z0;
      if (h < 100) { warnings.push(`Секция ${sec}: нет места для двери`); continue; }
      if (s.door === 'double') {
        const w = span / 2 - 3;
        door({ sec, c, x0: c.eL + 1.5, y0: z0, w, h, kind: 'left', style: s.frontStyle, bound: c.L, upper, k: ++k });
        door({ sec, c, x0: c.eL + span / 2 + 1.5, y0: z0, w, h, kind: 'right', style: s.frontStyle, bound: c.R, upper, k: ++k });
      } else {
        const kind = { left: 'left', right: 'right', flapDown: 'down', flapUp: 'up' }[s.door];
        door({ sec, c, x0: c.eL + 1.5, y0: z0, w: span - 3, h, kind, style: s.frontStyle, bound: kind === 'right' ? c.R : c.L, upper, k: ++k, sup: kind === 'down' ? supDown : supUp });
      }
    }
  });

  // drawers: visible ones ('drawer') and built-in ones ('idrawer', always behind the door of their section)
  S.forEach((s, i) => {
    const c = s._ctx, sec = i + 1;
    if (!c.drawers.length) return;
    const overlayMode = !sliding && s.drawerFronts === 'overlay';
    const behindOf = d => !sliding && (d.type === 'idrawer' || (s.door !== 'none' && !overlayMode));
    if (!sliding && s.door === 'none' && c.drawers.some(d => d.type === 'idrawer')) warnings.push(`Секция ${sec}: встроенный ящик без двери виден спереди — добавьте дверь`);
    let shallow = false;
    const bs = c.drawers.filter(behindOf);
    let spL, spR, sp;
    const zSpB = D / 2 - Math.max(25 + fT + 4, ...[hw.hinge, hw.hingeHalf].map(h => h.plateSetback + 12 + 1)); // front end of spacers: behind the hinge plates
    if (bs.length) {
      setStage('drawers');
      // spacers keep the slides clear of the hinge plates behind the door
      sp = { lo: Math.min(...bs.map(d => d.ya)), hi: Math.max(...bs.map(d => d.ya + d.h)) };
      const mk = x => part({ name: 'Проставка под направляющие', plane: 'yz', L: sp.hi - sp.lo, W: zSpB - shelfBack, c: [x, (sp.lo + sp.hi) / 2, shelfBack + (zSpB - shelfBack) / 2], edges: { d2: eH }, sec, notes: ['крепится к боковине саморезами 4×30 изнутри'] });
      spL = mk(c.faceL + t / 2); spR = mk(c.faceR - t / 2);
      addHw('Саморез 4×30 (проставка)', 8);
    }

    c.drawers.forEach((d, k) => {
      setStage('drawerBox');
      const behind = behindOf(d), overlay = overlayMode && d.type === 'drawer';
      const zr0 = overlay ? D / 2 + 1 : zF - (behind ? 25 : 0) - fT; // front of the box = back of the front panel
      const zSp1 = zr0 - 4, avail = zSp1 - shelfBack - 10, rl = slideLen(sl, avail);
      if (avail < sl.lens[0]) shallow = true;
      const side = behind ? 2 * t : 0;
      // точка крепления сдвигается вдоль глубины на 8–16 мм, если с обратной стороны перегородки в этом месте уже есть глубокое гнездо (шкант, эксцентрик)
      const mountFree = (y, zz) => (behind
        ? !pierces(spL, 'B', y - sp.lo, zz - shelfBack, sl.holeD, sl.holeDepth) && !pierces(spR, 'A', y - sp.lo, zz - shelfBack, sl.holeD, sl.holeDepth)
        : !pierces(c.L.p, 'B', y - c.L.y0, zz - c.L.z0, sl.holeD, sl.holeDepth) && !pierces(c.R.p, 'A', y - c.R.y0, zz - c.R.z0, sl.holeD, sl.holeDepth));
      const mount = (y, z0) => {
        const z = [0, 8, -8, 16, -16].map(t => z0 + t).find(zz => mountFree(y, zz)) ?? z0;
        return behind
          ? (hole(spL, 'B', y - sp.lo, z - shelfBack, sl.holeD, sl.holeDepth, 'направляющая ящика'), hole(spR, 'A', y - sp.lo, z - shelfBack, sl.holeD, sl.holeDepth, 'направляющая ящика'))
          : c.onBounds(y, z, sl.holeD, sl.holeDepth, 'направляющая ящика');
      };
      const group = { id: `drawer_${sec}_${k + 1}`, type: 'slide', travel: rl * sl.tr };
      const mid = { id: `rail_${sec}_${k + 1}`, type: 'slide', travel: rl * sl.tr / 2, follow: group.id };
      const iw = c.iw, h = d.h, ya = d.ya;
      let fx = c.cx, fL = iw - 4 - side, fy0 = ya + 2, fy1 = ya + h - 2;
      if (overlay) { fx = (c.eL + c.eR) / 2; fL = c.eR - c.eL - 3; [fy0, fy1] = overlayY(d); }
      const fr = part({ name: d.type === 'idrawer' ? 'Фасад ящика встроенного' : behind ? 'Фасад ящика внутреннего' : 'Фасад ящика', mat: 'front', label: `ЛДСП ${P.frontName}`, T: fT, plane: 'xy', L: fL, W: fy1 - fy0, c: [fx, (fy0 + fy1) / 2, zr0 + fT / 2], edges: allE, sec, group, asm: 'drawers', notes: ['крепится к коробу 4 саморезами 4×25 изнутри'] });
      const bw = iw - sl.gap - side, bh = Math.max(70, h - 60), yb0 = ya + 20;
      if (yb0 + bh > ya + h + 0.5) warnings.push(`Секция ${sec}: ящик ${Math.round(h)} мм слишком низкий для короба (нужно от 90 мм)`);
      const bt = 16, sideE = { w2: eH };
      const us = bh > 100 ? [25, bh - 25] : [bh / 2];
      if (bw - 2 * bt < 60) warnings.push(`Секция ${sec}: ящик слишком узкий: стенки короба ${Math.round(bw - 2 * bt)} мм, на конфирмат нужно не меньше 60 мм (увеличьте ширину секции)`);
      const front = part({ name: 'Передняя стенка ящика', plane: 'xy', T: bt, label: body, L: bw - 2 * bt, W: bh, c: [c.cx, yb0 + bh / 2, zr0 - bt / 2], edges: { d2: eH }, sec, group });
      const back = part({ name: 'Задняя стенка ящика', plane: 'xy', T: bt, label: body, L: bw - 2 * bt, W: bh, c: [c.cx, yb0 + bh / 2, zr0 - rl + bt / 2], edges: { d2: eH }, sec, group });
      const yh = yb0 + Math.min(sl.mountY, bh / 2);
      for (const sx of [-1, 1]) {
        const sp2 = part({ name: 'Боковина ящика', plane: 'yz', T: bt, label: body, L: bh, W: rl, c: [c.cx + sx * (bw / 2 - bt / 2), yb0 + bh / 2, zr0 - rl / 2], edges: sideE, sec, group });
        for (const u of us) {
          hole(sp2, sx < 0 ? 'A' : 'B', u, rl - bt / 2, 7, 'скв.', 'конфирмат'); hole(front, sx < 0 ? 'w1' : 'w2', sx < 0 ? 0 : front.L, u, 5, 50, 'конфирмат');
          hole(sp2, sx < 0 ? 'A' : 'B', u, bt / 2, 7, 'скв.', 'конфирмат'); hole(back, sx < 0 ? 'w1' : 'w2', sx < 0 ? 0 : back.L, u, 5, 50, 'конфирмат');
          addHw('Конфирмат 7×50', 2);
        }
        // three-section ball-bearing slide: fixed rail on the wall/spacer, middle rail at half travel, inner rail on the box
        const xm = sx < 0 ? c.faceL + side / 2 : c.faceR - side / 2, w3 = sl.gap / 2 / 3;
        const rail = (n, g, zc, len) => extra({ kind: 'box', mat: 'metal', nc: true, name: 'Направляющая', asm: 'drawers', s: [w3, 45, len], c: [xm - sx * (n + 0.5) * w3, yh, zc], group: g, sec });
        if (sl.rail === 'three') { rail(0, undefined, zSp1 - rl / 2, rl); rail(1, mid, zSp1 - rl / 2 - 5, rl - 10); rail(2, group, zSp1 - rl / 2, rl); }
        else if (sl.rail === 'side') extra({ kind: 'box', mat: 'metal', nc: true, name: 'Направляющая', asm: 'drawers', s: [10, 14, rl], c: [xm - sx * 5.5, yh, zSp1 - rl / 2], group, sec });
        else extra({ kind: 'box', mat: 'metal', nc: true, name: 'Направляющая', asm: 'drawers', s: [10, 12, rl], c: [c.cx + sx * (bw / 2 - 8), yb0 - 6, zSp1 - rl / 2], group, sec });
      }
      part({ name: 'Дно ящика', mat: 'back', label: 'ХДФ', T: 4, plane: 'xz', L: bw, W: rl, c: [c.cx, yb0 - 2, zr0 - rl / 2], sec, group, notes: ['крепится к коробу гвоздями/саморезами снизу'] });
      addHw('Саморез 3×16 (дно ящика)', Math.ceil((2 * (bw + rl)) / 150));
      for (const dz of [sl.mountFront, sl.mountMid || rl / 2, rl - sl.mountRear]) mount(yh, zSp1 - dz);
      setStage('drawers');
      addHw(`Направляющие ${slideName(P, sl)} L=${rl} мм (пара)`);
      addHw('Саморез 4×25 (фасад ящика)', 4);
      // behind a door there are only ~25 mm: a protruding handle would go through the door, so the grip is milled
      if (behind || sliding) fr.notes.push(`захват — выемка под пальцы (ручка не ставится: ящик за ${sliding ? 'дверями-купе' : 'дверью'})`);
      else handle(fr, fr.L / 2, fr.W / 2, 'h', group, sec);
    });
    if (shallow) warnings.push(`Секция ${sec}: мала глубина для ящика`);
  });

  // sliding wardrobe doors
  if (sliding) {
    setStage('kupe');
    const cnt = Math.max(2, P.slidingDoors), ovl = 25, inner = W - 2 * t;
    const dw = (inner + ovl * (cnt - 1)) / cnt, sh = yT - yB - 20;
    const zT = [D / 2 - 55, D / 2 - 20]; // back and front track
    // top rail: base plate with three flanges, the leaves run between them; bottom rail: two ridges under the leaves
    extra({ kind: 'box', mat: 'metal', name: 'Рельс купе верхний', s: [inner, 6, 90], c: [0, yT - 3, D / 2 - 45] });
    for (const [zc, th] of [[D / 2 - 68, 2], [D / 2 - 37.5, 4], [D / 2 - 7, 2]]) extra({ kind: 'box', mat: 'metal', name: 'Рельс купе верхний', s: [inner, 14, th], c: [0, yT - 13, zc] });
    for (const zc of zT) extra({ kind: 'box', mat: 'metal', name: 'Рельс купе нижний', s: [inner, 10, 8], c: [0, yB + 5, zc] });
    addHw(`Рельс купе верхний L=${inner} мм`); addHw(`Рельс купе нижний L=${inner} мм`); addHw('Саморез 4×30 (рельсы купе)', 2 * Math.ceil(inner / 200));
    const st = P.slidingStyle;
    for (let k = 0; k < cnt; k++) {
      const frontTrack = k % 2 === 1;
      const x = -W / 2 + t + dw / 2 + k * (dw - ovl), zc = zT[frontTrack ? 1 : 0], yc = (yT + yB) / 2;
      const group = { id: `kupe_${k + 1}`, type: 'slidex', travel: frontTrack ? -(dw - ovl) : 0 };
      const fill = st === 'mirror' ? { mat: 'mirror', label: 'Зеркало', T: 4 } : st === 'glass' ? { mat: 'glass', label: 'Стекло матовое', T: 4 } : { mat: 'front', label: `ЛДСП ${P.frontName}`, T: 10 };
      part({ name: 'Вставка двери-купе', plane: 'xy', ...fill, L: Math.round(dw - 26), W: sh - 70, c: [x, yc, zc], group, notes: ['вставка в профиль купе'] });
      for (const s of [-1, 1]) {
        extra({ kind: 'box', mat: 'metal', name: 'Профиль купе', s: [14, sh, 24], c: [x + s * (dw / 2 - 7), yc, zc], group });
        extra({ kind: 'box', mat: 'metal', name: 'Профиль купе', s: [dw, 35, 22], c: [x, yc + s * (sh / 2 - 17.5), zc], group });
        extra({ kind: 'box', mat: 'metal', nc: true, name: 'Каретка', s: [30, 4, 14], c: [x + s * (dw / 2 - 50), yT - 8, zc], group });
      }
      addHw(`Профиль купе вертикальный L=${sh} мм`, 2); addHw(`Профиль купе горизонтальный L=${Math.round(dw - 28)} мм`, 2); addHw('Ролики двери-купе (комплект)');
    }
  }
}
