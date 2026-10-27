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

/** Группы нижних модулей, над которыми лежит столешница: [[mod, mod, …], …] в порядке раскладки. */
export function worktopRuns(mods) {
  const runs = [];
  let cur = null, prev = null;
  for (const m of mods) {
    if (m.over) continue;
    const base = m.P.type === 'kbase' && !m.y;
    if (!base) { cur = null; prev = m; continue; }
    const gapOk = cur && prev && prev === cur[cur.length - 1] && m.left - (prev.left + prev.W) < SPLIT_GAP;
    if (gapOk) cur.push(m); else { cur = [m]; runs.push(cur); }
    prev = m;
  }
  return runs;
}

/** Детали-столешницы в координатах общей спецификации (mods — результат buildProject после раскладки). */
export function worktopParts(mods, wt) {
  if (!wt) return [];
  const parts = [];
  worktopRuns(mods).forEach((run, ri) => {
    const left = Math.min(...run.map(m => m.x - m.W / 2)) - wt.side, right = Math.max(...run.map(m => m.x + m.W / 2)) + wt.side;
    const zBack = Math.min(...run.map(m => m.z - m.D / 2)), depth = Math.max(...run.map(m => m.D)) + wt.front;
    const yTop = Math.max(...run.map(m => m.y + m.H)), L = right - left;
    const cuts = [];
    const list = ri === 0 ? wt.cutouts : [];
    for (const c of list) {
      const u0 = clamp(c.x, 0, Math.max(0, L - 10)), u1 = Math.min(L, u0 + c.w), v1 = clamp(depth - c.y, 10, depth), v0 = Math.max(0, v1 - c.h);
      if (u1 - u0 >= 10 && v1 - v0 >= 10) cuts.push({ kind: 'hole', u0, v0, u1, v1, r: Math.min(c.r, (u1 - u0) / 2, (v1 - v0) / 2), what: CUTOUT_PRESETS[c.kind].label });
    }
    const p = {
      kind: 'panel', mat: 'top', label: `Столешница ${wt.T} мм`, T: wt.T, name: 'Столешница', plane: 'xz', L, W: depth, c: [(left + right) / 2, yTop + wt.T / 2, zBack + depth / 2],
      holes: [], grooves: [], sec: 0, asm: 'final', edges: {},
      notes: [`свес спереди ${wt.front} мм, по бокам ${wt.side} мм`, 'торцы закрыть торцевой планкой, стык со стеной — плинтус или герметик'],
    };
    if (cuts.length) { p.cutouts = cuts.map(({ what, ...c }) => c); p.notes.push(...cuts.map(c => `вырез «${c.what}» ${Math.round(c.u1 - c.u0)}×${Math.round(c.v1 - c.v0)} мм`)); }
    parts.push(p);
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
