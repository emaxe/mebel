// Kinematics of doors, flaps, drawers and sliding leaves (mm, y-up, z front+).
// groupPose() is the single source of the motion; solve() runs all groups at once and stops any part
// the moment it touches another one, so nothing passes through anything.
export function dims(p) {
  return p.plane === 'yz' ? [p.T, p.L, p.W] : p.plane === 'xz' ? [p.L, p.T, p.W] : [p.L, p.W, p.T];
}

const RAD = Math.PI / 180;
const EPS = 0.3; // collider shrink: parts that merely touch are not in collision

export function groupPose(g, q) {
  if (g.type === 'hinge') return { axis: g.axis, angle: q * (g.maxAngle ?? 90) * RAD * g.dir, d: [0, 0, 0] };
  if (g.type === 'slide') return { axis: null, angle: 0, d: [0, 0, g.travel * q] };
  if (g.type === 'slidex') return { axis: null, angle: 0, d: [g.travel * q, 0, 0] };
  return { axis: null, angle: 0, d: [0, 0, 0] };
}

const rotCols = (axis, a) => {
  const c = Math.cos(a), s = Math.sin(a);
  if (axis === 'y') return [[c, 0, -s], [0, 1, 0], [s, 0, c]]; // columns of R_y (three.js convention)
  if (axis === 'x') return [[1, 0, 0], [0, c, s], [0, -s, c]]; // columns of R_x
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
};
const apply = (cols, p) => [
  cols[0][0] * p[0] + cols[1][0] * p[1] + cols[2][0] * p[2],
  cols[0][1] * p[0] + cols[1][1] * p[1] + cols[2][1] * p[2],
  cols[0][2] * p[0] + cols[1][2] * p[1] + cols[2][2] * p[2],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** World position of point p (given at q = 0) belonging to group g at progress q. */
export function transformPoint(g, q, p) {
  if (!g) return p;
  const { axis, angle, d } = groupPose(g, q), pv = g.pivot || [0, 0, 0];
  const r = apply(rotCols(axis, angle), [p[0] - pv[0], p[1] - pv[1], p[2] - pv[2]]);
  return [r[0] + pv[0] + d[0], r[1] + pv[1] + d[1], r[2] + pv[2] + d[2]];
}

function obbHit(a, b) {
  const R = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], AR = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { R[i][j] = dot(a.ax[i], b.ax[j]); AR[i][j] = Math.abs(R[i][j]) + 1e-9; }
  const tw = [b.c[0] - a.c[0], b.c[1] - a.c[1], b.c[2] - a.c[2]];
  const t = [dot(tw, a.ax[0]), dot(tw, a.ax[1]), dot(tw, a.ax[2])];
  const ea = a.h, eb = b.h;
  let ra, rb;
  for (let i = 0; i < 3; i++) {
    ra = ea[i]; rb = eb[0] * AR[i][0] + eb[1] * AR[i][1] + eb[2] * AR[i][2];
    if (Math.abs(t[i]) > ra + rb) return false;
  }
  for (let j = 0; j < 3; j++) {
    ra = ea[0] * AR[0][j] + ea[1] * AR[1][j] + ea[2] * AR[2][j]; rb = eb[j];
    if (Math.abs(t[0] * R[0][j] + t[1] * R[1][j] + t[2] * R[2][j]) > ra + rb) return false;
  }
  ra = ea[1] * AR[2][0] + ea[2] * AR[1][0]; rb = eb[1] * AR[0][2] + eb[2] * AR[0][1];
  if (Math.abs(t[2] * R[1][0] - t[1] * R[2][0]) > ra + rb) return false;
  ra = ea[1] * AR[2][1] + ea[2] * AR[1][1]; rb = eb[0] * AR[0][2] + eb[2] * AR[0][0];
  if (Math.abs(t[2] * R[1][1] - t[1] * R[2][1]) > ra + rb) return false;
  ra = ea[1] * AR[2][2] + ea[2] * AR[1][2]; rb = eb[0] * AR[0][1] + eb[1] * AR[0][0];
  if (Math.abs(t[2] * R[1][2] - t[1] * R[2][2]) > ra + rb) return false;
  ra = ea[0] * AR[2][0] + ea[2] * AR[0][0]; rb = eb[1] * AR[1][2] + eb[2] * AR[1][1];
  if (Math.abs(t[0] * R[2][0] - t[2] * R[0][0]) > ra + rb) return false;
  ra = ea[0] * AR[2][1] + ea[2] * AR[0][1]; rb = eb[0] * AR[1][2] + eb[2] * AR[1][0];
  if (Math.abs(t[0] * R[2][1] - t[2] * R[0][1]) > ra + rb) return false;
  ra = ea[0] * AR[2][2] + ea[2] * AR[0][2]; rb = eb[0] * AR[1][1] + eb[1] * AR[1][0];
  if (Math.abs(t[0] * R[2][2] - t[2] * R[0][2]) > ra + rb) return false;
  ra = ea[0] * AR[1][0] + ea[1] * AR[0][0]; rb = eb[1] * AR[2][2] + eb[2] * AR[2][1];
  if (Math.abs(t[1] * R[0][0] - t[0] * R[1][0]) > ra + rb) return false;
  ra = ea[0] * AR[1][1] + ea[1] * AR[0][1]; rb = eb[0] * AR[2][2] + eb[2] * AR[2][0];
  if (Math.abs(t[1] * R[0][1] - t[0] * R[1][1]) > ra + rb) return false;
  ra = ea[0] * AR[1][2] + ea[1] * AR[0][2]; rb = eb[0] * AR[2][1] + eb[1] * AR[2][0];
  if (Math.abs(t[1] * R[0][2] - t[0] * R[1][2]) > ra + rb) return false;
  return true;
}

const IDENT = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
function place(col, q) {
  const g = col.g;
  if (!g) return col.w0 || (col.w0 = box(col.c, col.ax0, col.h));
  const { axis, angle, d } = groupPose(g, q), pv = g.pivot || [0, 0, 0], R = rotCols(axis, angle);
  const r = apply(R, [col.c[0] - pv[0], col.c[1] - pv[1], col.c[2] - pv[2]]);
  return box([r[0] + pv[0] + d[0], r[1] + pv[1] + d[1], r[2] + pv[2] + d[2]], R, col.h);
}
function box(c, ax, h) {
  const e = [0, 1, 2].map(k => Math.abs(ax[0][k]) * h[0] + Math.abs(ax[1][k]) * h[1] + Math.abs(ax[2][k]) * h[2]);
  return { c, ax, h, lo: [c[0] - e[0], c[1] - e[1], c[2] - e[2]], hi: [c[0] + e[0], c[1] + e[1], c[2] + e[2]] };
}
const overlap = (a, b, m = 0) => a.lo[0] <= b.hi[0] + m && a.hi[0] >= b.lo[0] - m && a.lo[1] <= b.hi[1] + m && a.hi[1] >= b.lo[1] - m && a.lo[2] <= b.hi[2] + m && a.hi[2] >= b.lo[2] - m;

function collect(spec, skip) {
  const cols = [], all = new Map();
  const add = (c, half, name, g, sec) => {
    if (g) all.set(g.id, g);
    if (g && skip(g)) return;
    cols.push({ c, h: half.map(v => Math.max(0.05, v - EPS)), name, g: g || null, sec, ax0: IDENT });
  };
  for (const p of spec.parts) add(p.c, dims(p).map(v => v / 2), p.name, p.group, p.sec);
  for (const e of spec.extras) {
    if (e.group) all.set(e.group.id, e.group);
    if (e.nc || e.kind === 'link') continue;
    let half;
    if (e.kind === 'cyl') half = e.axis === 'x' ? [e.len / 2, e.r, e.r] : e.axis === 'z' ? [e.r, e.r, e.len / 2] : [e.r, e.len / 2, e.r];
    else if (e.kind === 'sphere') half = [e.r, e.r, e.r];
    else half = e.s.map(v => v / 2);
    add(e.c, half, e.name || (e.kind === 'sphere' ? 'Ручка' : 'Металл'), e.group, e.sec);
  }
  cols.push({ c: [0, -50, 0], h: [20000, 50, 20000], name: 'Пол', g: null, sec: 0, ax0: IDENT });
  return { cols, all };
}

/**
 * Open every moving group to `open` (0…1) at once. A group that touches something stops there.
 * Returns { q: Map(groupId → progress), limits: [{ g, q, by: {name, sec} }] }.
 */
export function solve(spec, open, opts = {}) {
  const skip = opts.skip || (() => false);
  const { cols, all } = collect(spec, skip);
  const q = new Map();
  for (const g of all.values()) q.set(g.id, 0);
  if (open <= 0) return { q, limits: [] };

  const movers = new Map();
  cols.forEach((c, i) => { if (c.g) (movers.get(c.g.id) || movers.set(c.g.id, { g: c.g, idx: [] }).get(c.g.id)).idx.push(i); });
  const cur = cols.map(c => place(c, 0));

  // Broad phase: swept AABBs over the whole range, candidate pairs, and pairs already touching when closed.
  const swept = cols.map((c, i) => {
    if (!c.g) return cur[i];
    const s = { lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9] };
    for (let k = 0; k <= 16; k++) { const w = place(c, (open * k) / 16); for (let a = 0; a < 3; a++) { s.lo[a] = Math.min(s.lo[a], w.lo[a]); s.hi[a] = Math.max(s.hi[a], w.hi[a]); } }
    return s;
  });
  const cand = new Map(), skipPair = new Set();
  for (const m of movers.values()) for (const i of m.idx) {
    const list = [];
    for (let j = 0; j < cols.length; j++) {
      if (cols[j].g && cols[j].g.id === m.g.id) continue;
      if (!overlap(swept[i], swept[j], 6)) continue;
      if (obbHit(cur[i], cur[j])) skipPair.add(i * 100000 + j);
      else list.push(j);
    }
    cand.set(i, list);
  }

  const hitTest = (m, qn) => {
    for (const i of m.idx) {
      const w = place(cols[i], qn);
      for (const j of cand.get(i)) if (overlap(w, cur[j], 0) && obbHit(w, cur[j])) return cols[j];
    }
    return null;
  };
  const commit = (m, qn) => { q.set(m.g.id, qn); for (const i of m.idx) cur[i] = place(cols[i], qn); };

  // Step size: at most ~3 mm of travel per iteration so thin parts cannot be skipped.
  let reach = 0;
  for (const m of movers.values()) {
    let r = 0;
    if (m.g.type === 'hinge') {
      const pv = m.g.pivot;
      for (const i of m.idx) { const c = cols[i]; r = Math.max(r, Math.hypot(c.c[0] - pv[0], c.c[1] - pv[1], c.c[2] - pv[2]) + Math.hypot(...c.h)); }
      r *= (m.g.maxAngle ?? 90) * RAD;
    } else r = Math.abs(m.g.travel);
    reach = Math.max(reach, r * open);
  }
  const S = Math.min(400, Math.max(30, Math.ceil(reach / 3))), dq = open / S;
  const order = [...movers.values()].sort((a, b) => (a.g.type === 'slide') - (b.g.type === 'slide'));
  const blocked = new Map();
  let idle = 0;
  for (let it = 0; it < S * 3 && idle < 12; it++) {
    let moved = false, pending = false;
    for (const m of order) {
      const q0 = q.get(m.g.id);
      if (q0 >= open - 1e-9) continue;
      const goal = Math.min(open, q0 + dq);
      const hit = hitTest(m, goal);
      if (!hit) { commit(m, goal); blocked.delete(m.g.id); moved = true; pending = true; continue; }
      let lo = q0, hi = goal;
      for (let k = 0; k < 6; k++) { const mid = (lo + hi) / 2; if (hitTest(m, mid)) hi = mid; else lo = mid; }
      if (lo > q0 + 1e-7) { commit(m, lo); moved = true; }
      blocked.set(m.g.id, hit); pending = true;
    }
    if (!pending) break;
    idle = moved ? 0 : idle + 1;
  }

  const limits = [];
  for (const m of order) {
    const v = q.get(m.g.id);
    if (v < open - 0.01) limits.push({ g: m.g, q: v, by: blocked.get(m.g.id) ? { name: blocked.get(m.g.id).name, sec: blocked.get(m.g.id).sec } : null });
  }
  for (const g of all.values()) if (g.follow && q.has(g.follow)) q.set(g.id, q.get(g.follow));
  return { q, limits };
}

/** Exhaustive check (no broad phase): pairs of colliders that intersect at the poses `qmap` but not when closed. */
export function collisions(spec, qmap, opts = {}) {
  const { cols } = collect(spec, opts.skip || (() => false));
  const closed = cols.map(c => place(c, 0)), now = cols.map(c => place(c, c.g ? qmap.get(c.g.id) ?? 0 : 0));
  const out = [];
  for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
    const a = cols[i], b = cols[j];
    if (!a.g && !b.g) continue;
    if (a.g && b.g && a.g.id === b.g.id) continue;
    if (!(overlap(now[i], now[j]) && obbHit(now[i], now[j]))) continue;
    if (overlap(closed[i], closed[j]) && obbHit(closed[i], closed[j])) continue;
    out.push([a.name + (a.sec ? ` (с.${a.sec})` : ''), b.name + (b.sec ? ` (с.${b.sec})` : '')]);
  }
  return out;
}

/** Design-time defects: moving parts that already intersect something else while everything is closed. */
export function closedOverlaps(spec, opts = {}) {
  const { cols } = collect(spec, opts.skip || (() => false)), w = cols.map(c => place(c, 0)), out = [];
  for (let i = 0; i < cols.length; i++) for (let j = 0; j < cols.length; j++) {
    const a = cols[i], b = cols[j];
    if (!a.g || i === j || (b.g && b.g.id === a.g.id) || (b.g && j < i)) continue;
    if (overlap(w[i], w[j]) && obbHit(w[i], w[j])) out.push([a.name + (a.sec ? ` (с.${a.sec})` : ''), b.name + (b.sec ? ` (с.${b.sec})` : '')]);
  }
  return out;
}

/** Doors and drawers that cannot open fully (progress < 97%), as {text, sec, by}. */
export function kinProblems(spec) {
  const secOf = new Map();
  spec.parts.forEach(p => { if (p.group && !secOf.has(p.group.id)) secOf.set(p.group.id, p.sec); });
  return solve(spec, 1, { skip: g => g.type === 'slidex' }).limits.filter(l => l.q < 0.97).map(l => {
    const g = l.g, sec = secOf.get(g.id), what = g.type === 'hinge' ? (g.flap ? 'откидной фасад' : 'дверь') : 'ящик';
    const how = g.type === 'hinge' ? `открывается только на ${Math.round(l.q * (g.maxAngle ?? 90))}°` : `выдвигается только на ${Math.round(l.q * 100)}%`;
    const by = l.by ? (l.by.name === 'Пол' ? ' — упирается в пол' : ` — мешает «${l.by.name}»${l.by.sec ? ` (секция ${l.by.sec})` : ''}`) : '';
    return { text: `Секция ${sec}: ${what} ${how}${by}`, sec, by: l.by, g };
  });
}

