// Столешница кухни: P.countertop = { T, front, side, cutouts: [{ kind, w, h, x, y, r }] }. Без DOM.
// Перекрывает подряд идущие нижние модули (kbase на полу, не «над предыдущим»); проём между группами больше SPLIT_GAP начинает новую столешницу.
export const SPLIT_GAP = 100;
export const WORKTOP_DEFAULT = { T: 38, front: 30, side: 0, skirtH: 0, apron: 0, cutouts: [] };
export const SKIRT_T = 16; // толщина пристеночного бортика, мм
export const APRON_T = 4; // фартук из ХДФ, мм
export const APRON_MAX_LEN = 2780; // длиннее лист ХДФ не режется: фартук делится на части
export const CUTOUT_PRESETS = { sink: { label: 'Мойка', w: 500, h: 400, r: 20 }, hob: { label: 'Варочная панель', w: 560, h: 490, r: 8 }, free: { label: 'Вырез', w: 100, h: 100, r: 0 } };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : d);

/** Приводит описание столешницы к допустимому виду; пустое или выключенное — undefined. */
export function normalizeWorktop(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return undefined;
  const out = {
    T: clamp(Math.round(num(w.T, 38)), 16, 60),
    front: clamp(Math.round(num(w.front, 30)), 0, 100),
    side: clamp(Math.round(num(w.side, 0)), 0, 100),
    skirtH: num(w.skirtH, 0) >= 20 ? clamp(Math.round(num(w.skirtH, 0)), 20, 150) : 0,
    apron: num(w.apron, 0) >= 100 ? clamp(Math.round(num(w.apron, 0)), 100, 1000) : 0,
    cutouts: (Array.isArray(w.cutouts) ? w.cutouts : []).filter(c => c && typeof c === 'object').slice(0, 12).map(c => ({
      kind: typeof c.kind === 'string' && CUTOUT_PRESETS[c.kind] ? c.kind : 'free',
      w: clamp(Math.round(num(c.w, 100)), 20, 2000), h: clamp(Math.round(num(c.h, 100)), 20, 1000),
      x: clamp(Math.round(num(c.x, 0)), 0, 6000), y: clamp(Math.round(num(c.y, 30)), 0, 1000), r: clamp(Math.round(num(c.r, 0)), 0, 100),
    })),
  };
  if (typeof w.color === 'string' && /^#[0-9a-f]{6}$/i.test(w.color)) out.color = w.color;
  return out;
}

/** Группы нижних модулей, над которыми лежит столешница: [[mod, mod, …], …]; ряды вдоль разных стен не смешиваются. */
export function worktopRuns(mods) {
  const runs = [];
  let cur = null, prev = null;
  for (const m of mods) {
    if (m.over) continue;
    const base = (m.P.type === 'kbase' || m.P.type === 'kfill' || m.P.type === 'kcorner') && !m.y;
    if (!base) { cur = null; prev = m; continue; }
    const gapOk = cur && prev && prev === cur[cur.length - 1] && prev.run === m.run && m.s - (prev.s + prev.W) < SPLIT_GAP;
    if (gapOk) cur.push(m); else { cur = [m]; runs.push(cur); }
    prev = m;
  }
  return runs.filter(r => r.some(m => m.P.type === 'kbase' || m.P.type === 'kcorner'));
}

/** Детали-столешницы в координатах общей спецификации (mods — результат buildProject после раскладки). */
export function worktopParts(mods, wt) {
  if (!wt) return [];
  const parts = [], runs = worktopRuns(mods), frontEdge = {}, hasTurned = runs.some(r => r[0].run === 1), dEff = m => (m.spec.meta.corner ? m.spec.meta.corner.D : m.D);
  runs.forEach((run, ri) => {
    const turned = run[0].run === 1, yTop = Math.max(...run.map(m => m.y + m.H)), depth = Math.max(...run.map(dEff)) + wt.front;
    let c, L, W, cuts = [], wall;
    if (!turned) {
      const far = run[0].run === 2, sg = far ? -1 : 1;
      let left = Math.min(...run.map(m => m.x - m.W / 2)) - wt.side, right = Math.max(...run.map(m => m.x + m.W / 2)) + wt.side;
      const zBack = far ? Math.max(...run.map(m => m.z + m.D / 2)) : Math.min(...run.map(m => m.z - m.D / 2));
      if (far && frontEdge.x !== undefined) { if (frontEdge.dir > 0) left = Math.max(left, frontEdge.x); else right = Math.min(right, frontEdge.x); }
      L = right - left; W = depth; c = [(left + right) / 2, yTop + wt.T / 2, zBack + (sg * depth) / 2];
      wall = { axis: 'x', a0: left + wt.side, a1: right - wt.side, at: zBack, sign: sg };
      if (!far) frontEdge.z = Math.max(frontEdge.z ?? -Infinity, zBack + depth);
      if (ri === 0) for (const k of wt.cutouts) {
        const u0 = clamp(k.x, 0, Math.max(0, L - 10)), u1 = Math.min(L, u0 + k.w), v1 = clamp(depth - k.y, 10, depth), v0 = Math.max(0, v1 - k.h);
        if (u1 - u0 >= 10 && v1 - v0 >= 10) cuts.push({ kind: 'hole', fixture: k.kind, u0, v0, u1, v1, r: Math.min(k.r, (u1 - u0) / 2, (v1 - v0) / 2), what: CUTOUT_PRESETS[k.kind].label });
      }
    } else {
      const m0 = run[0], right = m0.rot < 0;
      const zEnd = Math.max(...run.map(m => m.z + m.W / 2)) + wt.side;
      const zStart = frontEdge.z !== undefined ? frontEdge.z : Math.min(...run.map(m => m.z - m.W / 2)) - wt.side;
      const xBack = right ? Math.max(...run.map(m => m.x + m.D / 2)) : Math.min(...run.map(m => m.x - m.D / 2));
      L = depth; W = zEnd - zStart;
      c = [right ? xBack - depth / 2 : xBack + depth / 2, yTop + wt.T / 2, (zStart + zEnd) / 2];
      wall = { axis: 'z', a0: Math.min(...run.map(m => m.z - m.W / 2)), a1: zEnd - wt.side, at: xBack, sign: right ? -1 : 1 };
      frontEdge.x = right ? xBack - depth : xBack + depth; frontEdge.dir = right ? -1 : 1;
    }
    if (W < 20 || L < 20) return;
    const p = {
      kind: 'panel', mat: 'top', label: `Столешница ${wt.T} мм`, T: wt.T, name: 'Столешница', plane: 'xz', L, W, c,
      holes: [], grooves: [], sec: 0, asm: 'final', edges: {},
      notes: [`свес спереди ${wt.front} мм, по бокам ${wt.side} мм`, 'торцы закрыть торцевой планкой, стык со стеной — плинтус или герметик'],
    };
    if (turned) p.notes.push('вторая столешница угловой кухни: стык с первой встык под 90°, стяжка столешничными стяжками');
    if (cuts.length) { p.cutouts = cuts.map(({ what, ...k }) => k); p.notes.push(...cuts.map(k => `вырез «${k.what}» ${Math.round(k.u1 - k.u0)}×${Math.round(k.v1 - k.v0)} мм`)); }
    parts.push(p);
    parts.push(...wallParts(wt, wall, yTop, mods, run));
    // угловой модуль без второго ряда: крыло B закрывает вторая плита встык с первой
    const cm = !turned && !hasTurned ? run.find(m => m.spec.meta.corner) : null;
    if (cm) {
      const B = cm.D, left = cm.P.cornerSide !== 'right', wallX = left ? cm.x - cm.W / 2 : cm.x + cm.W / 2, zBack = cm.z - cm.D / 2, zStart = zBack + depth, zEnd = zBack + B;
      if (zEnd - zStart >= 20) {
        const q = { ...p, L: depth, W: zEnd - zStart, c: [left ? wallX + depth / 2 : wallX - depth / 2, yTop + wt.T / 2, (zStart + zEnd) / 2], notes: [...p.notes.filter(n => !/вырез/.test(n)), 'крыло B углового модуля: стык с первой столешницей встык под 90°, стяжка столешничными стяжками'] };
        delete q.cutouts;
        parts.push(q);
      }
    }
  });
  return parts;
}

/** Бортик по задней кромке столешницы и фартук из ХДФ над ней: вдоль стены ряда (axis x — стена A, z — стена B). */
function wallParts(wt, wall, yTop, mods, run) {
  const out = [], len = wall.a1 - wall.a0, y0 = yTop + wt.T, base = { holes: [], grooves: [], sec: 0, asm: 'final', edges: {} };
  if (len < 20) return out;
  const place = (plane, L, W, T, yc, off) => (plane === 'xy' ? { plane, L, W, T, c: [(wall.a0 + wall.a1) / 2, yc, wall.at + (wall.sign || 1) * off] } : { plane, L, W, T, c: [wall.at + wall.sign * off, yc, (wall.a0 + wall.a1) / 2] });
  if (wt.skirtH) {
    const g = place(wall.axis === 'x' ? 'xy' : 'yz', wall.axis === 'x' ? len : wt.skirtH, wall.axis === 'x' ? wt.skirtH : len, SKIRT_T, y0 + wt.skirtH / 2, SKIRT_T / 2);
    out.push({ ...base, ...g, kind: 'panel', mat: 'top', strip: true, name: 'Бортик столешницы', label: `Бортик столешницы ${SKIRT_T} мм`, notes: [`высота ${wt.skirtH} мм по задней кромке, крепится к столешнице и стене; торцы и стык со стеной — герметик`] });
  }
  if (wt.apron) {
    const pieces = Math.ceil(len / APRON_MAX_LEN), step = len / pieces, yA = y0 + wt.skirtH;
    for (let i = 0; i < pieces; i++) {
      const a0 = wall.a0 + i * step, a1 = a0 + step, mid = (a0 + a1) / 2, off = SKIRT_T + APRON_T / 2;
      const c = wall.axis === 'x' ? [mid, yA + wt.apron / 2, wall.at + (wall.sign || 1) * off] : [wall.at + wall.sign * off, yA + wt.apron / 2, mid];
      out.push({ ...base, kind: 'panel', mat: 'back', name: 'Фартук', label: 'ХДФ', T: APRON_T, plane: wall.axis === 'x' ? 'xy' : 'yz', L: wall.axis === 'x' ? step : wt.apron, W: wall.axis === 'x' ? wt.apron : step, c, notes: [`стеновая панель над столешницей высотой ${wt.apron} мм${pieces > 1 ? `, часть ${i + 1} из ${pieces}` : ''}; клеится на стену или крепится на жидкие гвозди`] });
    }
  }
  return out;
}

/** Предупреждения по столешнице: перекрывающиеся вырезы, вырез у самого края (меньше 30 мм остаётся перемычки). */
export function worktopWarnings(parts) {
  const out = [];
  for (const p of parts) {
    const cs = p.cutouts || [];
    cs.forEach((a, i) => {
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1) out.push(`Столешница: вырезы ${i + 1} и ${j + 1} перекрываются`);
      }
      if (a.u0 < 30 || p.L - a.u1 < 30 || a.v0 < 30 || p.W - a.v1 < 30) out.push(`Столешница: вырез ${i + 1} ближе 30 мм к краю — перемычка может сломаться`);
    });
  }
  return out;
}

const FIXTURE_NAME = { sink: 'Мойка кухонная врезная', hob: 'Варочная панель' };

/**
 * Покупные приборы в вырезах столешницы: extras для 3D (мм, общие координаты) и позиции фурнитуры для списка покупок.
 * Мойка — чаша со смесителем, варочная панель — плита с четырьмя конфорками.
 */
export function worktopFixtures(parts) {
  const extras = [], hwx = [], hobs = [];
  for (const p of parts) {
    if (p.name !== 'Столешница') continue;
    const top = p.c[1] + p.T / 2;
    for (const c of p.cutouts || []) {
      if (!FIXTURE_NAME[c.fixture]) continue;
      const w = c.u1 - c.u0, h = c.v1 - c.v0, cx = p.c[0] - p.L / 2 + (c.u0 + c.u1) / 2, cz = p.c[2] - p.W / 2 + (c.v0 + c.v1) / 2;
      const name = `${FIXTURE_NAME[c.fixture]} ${Math.round(w)}×${Math.round(h)} мм`;
      const e = o => extras.push({ asm: 'final', ...o });
      if (c.fixture === 'sink') {
        const bowl = Math.min(180, p.T + 140);
        e({ kind: 'box', mat: 'steel', s: [w - 30, bowl, h - 30], c: [cx, top - 12 - bowl / 2, cz] });
        e({ kind: 'cyl', mat: 'metal', r: 16, len: 240, c: [cx, top + 120, cz - h / 2 + 60], axis: 'y' });
        e({ kind: 'cyl', mat: 'metal', r: 10, len: 150, c: [cx, top + 235, cz - h / 2 + 125], axis: 'z' });
      } else {
        hobs.push({ x: cx, z: cz, w, h, top });
        e({ kind: 'box', mat: 'dark', s: [w + 20, 6, h + 20], c: [cx, top + 3, cz] });
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) e({ kind: 'cyl', mat: 'steel', r: Math.min(w, h) * 0.17, len: 1.5, c: [cx + dx * w * 0.24, top + 6.8, cz + dz * h * 0.24], axis: 'y' });
      }
      hwx.push({ kind: 'appliance', name, qty: 1, stage: 'final' });
    }
  }
  return { extras, hwx, hobs };
}

export const HOOD_GAP = [650, 850]; // расстояние от варочной панели до низа вытяжки, мм: электрическая плита от 650, газовая от 750

/** Вытяжки над варочными панелями: mods — модули после раскладки, hobs — из worktopFixtures. Только ряд вдоль стены A (без поворота). */
export function hoodWarnings(mods, hobs) {
  const out = [], hoods = [];
  for (const m of mods) {
    if (m.rot) continue;
    for (const e of m.spec.extras) if (e.kind === 'box' && e.name === 'Вытяжка' && e.mat === 'steel') hoods.push({ x: m.x + e.c[0], w: e.s[0], bottom: m.y + e.c[1] - e.s[1] / 2 });
  }
  for (const hd of hoods) {
    const hob = hobs.find(h => Math.abs(h.x - hd.x) < (h.w + hd.w) / 2);
    if (!hob) { if (hobs.length) out.push('Вытяжка: стоит не над варочной панелью'); continue; }
    const gap = Math.round(hd.bottom - hob.top);
    if (gap < HOOD_GAP[0]) out.push(`Вытяжка: до варочной панели ${gap} мм, меньше ${HOOD_GAP[0]} мм — поднимите модуль`);
    else if (gap > HOOD_GAP[1]) out.push(`Вытяжка: до варочной панели ${gap} мм, больше ${HOOD_GAP[1]} мм — опустите модуль`);
  }
  return out;
}
