// Нижний угловой корпус «Г» с глухим углом: два крыла одинаковой глубины, общее дно и крышка с выемкой, две двери под углом 90°.
// Система координат модуля: начало в центре габарита A×B, стена крыла A сзади (z = −B/2), стена крыла B слева (x = −A/2).
// Двери неподвижные (в 3D закрыты): петли и присадка под них рассчитаны, анимации открывания нет.
import { hingeCount } from './hwparams.js';

const r1 = v => Math.round(v * 10) / 10;
const cpos = len => (len > 450 ? [50, len / 2, len - 50] : [50, len - 50]);
const HW_KIND = [[/^Конфирмат/, 'confirmat'], [/^Заглушка/, 'plug'], [/^Петля/, 'hinge'], [/^Опора/, 'leg'], [/^Клипса/, 'clip'], [/^Ручка/, 'handle'], [/^(Саморез|Винт)/, 'screw'], [/^Анкер/, 'wallFix'], [/^Дюбель/, 'wallDowel']];
const kindOf = name => (HW_KIND.find(([re]) => re.test(name)) || [0, 'other'])[1];

/** Зеркало по x: угол справа вместо слева. Грани боковин меняются местами, координаты вдоль x переворачиваются. */
export function mirrorSpecX(spec) {
  const flipC = c => [-c[0], c[1], c[2]];
  const flipHole = (h, p) => {
    if (p.plane === 'yz') return { ...h, f: h.f === 'A' ? 'B' : h.f === 'B' ? 'A' : h.f };
    const f = h.f === 'w1' ? 'w2' : h.f === 'w2' ? 'w1' : h.f;
    return { ...h, f, u: r1(p.L - h.u) };
  };
  const swapEdges = e => ({ ...e, w1: e.w2, w2: e.w1 });
  for (const p of spec.parts) {
    p.c = flipC(p.c);
    p.holes = p.holes.map(h => flipHole(h, p));
    if (p.plane !== 'yz') p.edges = swapEdges(p.edges);
    if (p.cutouts) p.cutouts = p.cutouts.map(c => (p.plane === 'yz' ? c : { ...c, u0: r1(p.L - c.u1), u1: r1(p.L - c.u0), ...(c.corner ? { corner: c.corner.replace(/w[12]/, m => (m === 'w1' ? 'w2' : 'w1')) } : {}) }));
  }
  for (const e of spec.extras) { if (e.c) e.c = flipC(e.c); if (e.a) e.a = flipC(e.a); if (e.b) e.b = flipC(e.b); }
  return spec;
}

export function buildCorner(P, hw) {
  const t = P.thickness, H = P.height, D = P.depth, A = P.sections[0].width, B = P.wingB, fT = P.frontT;
  const b = P.base === 'none' ? 0 : P.plinth, sideH = H - b, eF = P.edgeFront, eH = P.edgeHidden, legs = P.base === 'legs';
  const ox = -A / 2, oz = -B / 2, X = x => ox + x, Z = z => oz + z, bk = 4;
  const parts = [], extras = [], hwm = new Map(), hwx = new Map(), warnings = [];
  let stage = 'carcass';
  const addHw = (name, q = 1) => {
    hwm.set(name, (hwm.get(name) || 0) + q);
    const key = `${name}|${stage}`, e = hwx.get(key) || hwx.set(key, { kind: kindOf(name), name, qty: 0, stage }).get(key);
    e.qty += q;
  };
  const part = o => { const p = { kind: 'panel', mat: 'body', label: `ЛДСП ${P.bodyName}`, T: t, holes: [], grooves: [], notes: [], sec: 1, asm: stage, ...o }; p.edges = { d1: 0, d2: 0, w1: 0, w2: 0, ...(o.edges || {}) }; parts.push(p); return p; };
  const hole = (p, f, u, v, d, h, note) => p.holes.push({ f, u: r1(u), v: r1(v), d, h, note });
  const edgeHole = (p, e, s, d, h, note) => hole(p, e, e === 'w1' ? 0 : e === 'w2' ? p.L : s, e === 'd1' ? 0 : e === 'd2' ? p.W : s, d, h, note);

  if (A < D + 150 || B < D + 150) warnings.push(`Угловой корпус: крыло короче ${D + 150} мм, на двери остаётся меньше 150 мм`);

  // дно и крышка Г-образные: прямоугольник по габариту без стенок за вычетом выемки у фасадных сторон
  const lenA = A - bk - t, lenB = B - bk - t, notch = { kind: 'notch', corner: 'w2d2', u0: D - bk, v0: D - bk, u1: lenA, v1: lenB, r: 0 };
  const ell = (name, y, stg) => {
    stage = stg;
    const p = part({ name, plane: 'xz', L: lenA, W: lenB, c: [X(bk + lenA / 2), y, Z(bk + lenB / 2)], cutouts: [{ ...notch }], notes: ['Г-образная деталь: выемка у фасадного угла вырезается в раскрое'] });
    return p;
  };
  const bottom = ell('Дно Г-образное', b + t / 2, 'carcass');
  const top = ell('Крышка Г-образная', H - t / 2, 'top');

  // боковины торцов крыльев
  stage = 'carcass';
  const sideE = { w1: legs ? eH : 0 };
  const sideA = part({ name: 'Боковина крыла A', plane: 'yz', L: sideH, W: D - bk, c: [X(A - t / 2), b + sideH / 2, Z(bk + (D - bk) / 2)], edges: { ...sideE, d2: eF } });
  const sideB = part({ name: 'Боковина крыла B', plane: 'xy', L: D - bk, W: sideH, c: [X(bk + (D - bk) / 2), b + sideH / 2, Z(B - t / 2)], edges: { w2: eF, d1: legs ? eH : 0 } });

  // стяжки: дно и крышка к боковинам конфирматами (головки на наружных пластях боковин)
  let conf = 0;
  for (const pnl of [bottom, top]) {
    const low = pnl === bottom;
    for (const v of cpos(D - bk)) {
      edgeHole(pnl, 'w2', v, 5, 50, 'конфирмат'); hole(sideA, 'B', low ? t / 2 : sideH - t / 2, v, 7, 'скв.', 'конфирмат'); conf++;
    }
    for (const u of cpos(D - bk)) {
      edgeHole(pnl, 'd2', u, 5, 50, 'конфирмат'); hole(sideB, 'A', u, low ? t / 2 : sideH - t / 2, 7, 'скв.', 'конфирмат'); conf++;
    }
  }
  addHw('Конфирмат 7×50', conf); addHw('Заглушка на конфирмат', conf);

  // задние стенки из ХДФ накладные на обе стены
  stage = 'backOverlay';
  const hB = H - b - 4;
  part({ name: 'Задняя стенка крыла A', mat: 'back', label: 'ХДФ', T: 4, plane: 'xy', L: A - 4, W: hB, c: [X(A / 2), b + 2 + hB / 2, Z(bk / 2)], notes: ['крепится саморезами 3,5×16 с шагом 150 мм'] });
  part({ name: 'Задняя стенка крыла B', mat: 'back', label: 'ХДФ', T: 4, plane: 'yz', L: hB, W: B - bk - 2, c: [X(bk / 2), b + 2 + hB / 2, Z(bk + (B - bk - 2) / 2)], notes: ['крепится саморезами 3,5×16 с шагом 150 мм'] });
  addHw('Саморез 3,5×16 (для ХДФ)', Math.ceil((2 * (A + hB)) / 150) + Math.ceil((2 * (B + hB)) / 150));

  // двери: крыло A — вдоль x у фасада z = D, крыло B — вдоль z у фасада x = D; угол закрывает дверь A
  stage = 'doors';
  const y0 = b + 2, y1 = H - 2, h = y1 - y0, hp = hw.hinge, nh = hingeCount(h);
  const ys = nh === 2 ? [100, h - 100] : Array.from({ length: nh }, (_, i) => 100 + ((h - 200) * i) / (nh - 1));
  const edgesAll = { d1: eF, d2: eF, w1: eF, w2: eF };
  const ax0 = D + 1, ax1 = A - 1.5, wa = ax1 - ax0;
  const doorA = part({ name: 'Фасад двери крыла A', mat: 'front', label: `ЛДСП ${P.frontName}`, T: fT, plane: 'xy', L: wa, W: h, c: [X((ax0 + ax1) / 2), y0 + h / 2, Z(D + 1 + fT / 2)], edges: edgesAll, notes: ['петли справа (у боковины), Д1 — низ'] });
  const bz0 = D + 1 + fT + 2, bz1 = B - 1.5, wb = bz1 - bz0;
  const doorB = part({ name: 'Фасад двери крыла B', mat: 'front', label: `ЛДСП ${P.frontName}`, T: fT, plane: 'yz', L: h, W: wb, c: [X(D + 1 + fT / 2), y0 + h / 2, Z((bz0 + bz1) / 2)], edges: edgesAll, notes: ['петли у дальнего края (у боковины), Ш1 — низ'] });
  for (const y of ys) {
    hole(doorA, 'B', wa - hp.cupEdge, y, hp.cupD, hp.cupDepth, 'чашка петли');
    hole(doorB, 'A', y, wb - hp.cupEdge, hp.cupD, hp.cupDepth, 'чашка петли');
    for (const dy of [-hp.plateSpacing / 2, hp.plateSpacing / 2]) {
      hole(sideA, 'A', y0 + y + dy - b, D - hp.plateSetback - bk, hp.plateD, hp.plateDepth, 'планка петли');
      hole(sideB, 'B', D - hp.plateSetback - bk, y0 + y + dy - b, hp.plateD, hp.plateDepth, 'планка петли');
    }
  }
  const hinges = nh * 2;
  addHw(`Петля накладная ${P.hinge === 'wide' ? 165 : 110}° ${P.hinge === 'plain' ? 'без доводчика' : 'с доводчиком'}`, hinges); addHw('Саморез 3,5×16 (планка петли)', 2 * hinges);

  // ручки-скобы вертикальные у свободного края каждой двери
  if (P.handle !== 'none') {
    stage = 'handles';
    const hs = P.handleSize;
    for (const [d, free] of [[doorA, 40], [doorB, 40]]) {
      const top0 = h - 60;
      for (const s of [0, hs]) hole(d, 'A', d === doorA ? free : top0 - s, d === doorA ? top0 - s : free, 5, 'скв.', 'ручка');
      addHw(`Ручка-скоба ${hs} мм`); addHw(`Винт М4×${Math.ceil((fT + 14) / 5) * 5} (ручка-скоба)`, 2);
    }
  }

  // основание
  stage = 'base';
  if (legs) {
    const pts = [[50, 50], [A - 50, 50], [A - 50, D - 50], [D - 50, D - 50], [D - 50, B - 50], [50, B - 50]];
    for (const [x, z] of pts) extras.push({ asm: stage, kind: 'cyl', mat: 'metal', name: 'Ножка', r: 16, len: b, axis: 'y', c: [X(x), b / 2, Z(z)], sec: 1 });
    addHw(`Опора мебельная H=${b} мм`, pts.length);
    if (P.plinthStrip) {
      stage = 'final';
      const sh = b - 5, pe = { d1: eF, d2: eF };
      part({ name: 'Цокольная планка', plane: 'xy', mat: 'front', label: `ЛДСП ${P.frontName}`, T: 16, L: A - D, W: sh, c: [X(D + (A - D) / 2), 3 + sh / 2, Z(D - 50 - 8)], edges: pe, notes: ['клипсами к ножкам, утоплена на 50 мм от фасада'] });
      part({ name: 'Цокольная планка', plane: 'yz', mat: 'front', label: `ЛДСП ${P.frontName}`, T: 16, L: sh, W: B - D, c: [X(D - 50 - 8), 3 + sh / 2, Z(D + (B - D) / 2)], edges: pe, notes: ['клипсами к ножкам, утоплена на 50 мм от фасада'] });
      addHw('Клипса цокольная (к ножке)', pts.length);
    }
  }
  if (P.wallFix) { stage = 'final'; addHw('Анкерный уголок для крепления к стене', 4); addHw('Саморез 4×16 (уголок к корпусу)', 4); addHw('Дюбель с шурупом 6×60 (в стену)', 4); }

  const spec = {
    parts, extras, hwx: [...hwx.values()], hw: [...hwm.entries()], warnings,
    meta: { W: A, H, D: B, yB: b + t, yT: H - t, ih: H - b - 2 * t, sections: [{ x: 0, w: A, sec: 0 }], corner: { A, B, D } },
  };
  return P.cornerSide === 'right' ? mirrorSpecX(spec) : spec;
}
