// Столешница кухни: P.countertop = { T, front, side, cutouts: [{ kind, w, h, x, y, r }] }. Без DOM.
// Перекрывает подряд идущие нижние модули (kbase на полу, не «над предыдущим»); проём между группами больше SPLIT_GAP начинает новую столешницу.
export const SPLIT_GAP = 100;
export const WORKTOP_DEFAULT = { T: 38, front: 30, side: 0, cutouts: [] };
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
    cutouts: (Array.isArray(w.cutouts) ? w.cutouts : []).filter(c => c && typeof c === 'object').slice(0, 12).map(c => ({
      kind: typeof c.kind === 'string' && CUTOUT_PRESETS[c.kind] ? c.kind : 'free',
      w: clamp(Math.round(num(c.w, 100)), 20, 2000), h: clamp(Math.round(num(c.h, 100)), 20, 1000),
      x: clamp(Math.round(num(c.x, 0)), 0, 6000), y: clamp(Math.round(num(c.y, 30)), 0, 1000), r: clamp(Math.round(num(c.r, 0)), 0, 100),
    })),
  };
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
    let c, L, W, cuts = [];
    if (!turned) {
      const left = Math.min(...run.map(m => m.x - m.W / 2)) - wt.side, right = Math.max(...run.map(m => m.x + m.W / 2)) + wt.side, zBack = Math.min(...run.map(m => m.z - m.D / 2));
      L = right - left; W = depth; c = [(left + right) / 2, yTop + wt.T / 2, zBack + depth / 2];
      frontEdge.z = Math.max(frontEdge.z ?? -Infinity, zBack + depth);
      if (ri === 0) for (const k of wt.cutouts) {
        const u0 = clamp(k.x, 0, Math.max(0, L - 10)), u1 = Math.min(L, u0 + k.w), v1 = clamp(depth - k.y, 10, depth), v0 = Math.max(0, v1 - k.h);
        if (u1 - u0 >= 10 && v1 - v0 >= 10) cuts.push({ kind: 'hole', u0, v0, u1, v1, r: Math.min(k.r, (u1 - u0) / 2, (v1 - v0) / 2), what: CUTOUT_PRESETS[k.kind].label });
      }
    } else {
      const m0 = run[0], right = m0.rot < 0;
      const zEnd = Math.max(...run.map(m => m.z + m.W / 2)) + wt.side;
      const zStart = frontEdge.z !== undefined ? frontEdge.z : Math.min(...run.map(m => m.z - m.W / 2)) - wt.side;
      const xBack = right ? Math.max(...run.map(m => m.x + m.D / 2)) : Math.min(...run.map(m => m.x - m.D / 2));
      L = depth; W = zEnd - zStart;
      c = [right ? xBack - depth / 2 : xBack + depth / 2, yTop + wt.T / 2, (zStart + zEnd) / 2];
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
