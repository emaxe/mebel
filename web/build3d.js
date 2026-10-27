// three.js model from the furniture spec (mm → m).
import { dims, groupPose, solve } from './kinematics.js';
export { dims };
const HOLE_COL = { 35: 0xd4672a, 15: 0x8e44ad, 8: 0x2f8f5b, 7: 0x2b6cb0, 5: 0x2f2f2f, 3: 0x7a7a7a, 4: 0x7a7a7a };

/**
 * opts.asm = { shown: Set этапов, current: этап шага } — режим пошаговой сборки: рисуются только собранные этапы, текущий подсвечен, двери закрыты.
 */
/** Деталь с вырезами: контур с выемками и отверстиями-вырезами, выдавленный на толщину (мм → м). Радиус выемок в углу не показывается. */
function cutGeometry(THREE, p, k) {
  const { L, W, T } = p, cs = p.cutouts, notch = {};
  for (const c of cs) if (c.kind === 'notch' && !notch[c.corner]) notch[c.corner] = { w: c.u1 - c.u0, h: c.v1 - c.v0 };
  const n = notch, s = new THREE.Shape(), a = n.w1d1, b = n.w2d1, c2 = n.w2d2, d = n.w1d2;
  s.moveTo(a ? a.w : 0, 0); s.lineTo(b ? L - b.w : L, 0);
  if (b) { s.lineTo(L - b.w, b.h); s.lineTo(L, b.h); }
  s.lineTo(L, c2 ? W - c2.h : W);
  if (c2) { s.lineTo(L - c2.w, W - c2.h); s.lineTo(L - c2.w, W); }
  s.lineTo(d ? d.w : 0, W);
  if (d) { s.lineTo(d.w, W - d.h); s.lineTo(0, W - d.h); }
  s.lineTo(0, a ? a.h : 0);
  if (a) { s.lineTo(a.w, a.h); s.lineTo(a.w, 0); }
  for (const c of cs) if (c.kind !== 'notch') {
    const h = new THREE.Path(), r = Math.min(c.r || 0, (c.u1 - c.u0) / 2, (c.v1 - c.v0) / 2);
    h.moveTo(c.u0 + r, c.v0); h.lineTo(c.u1 - r, c.v0);
    if (r) h.absarc(c.u1 - r, c.v0 + r, r, -Math.PI / 2, 0, false);
    h.lineTo(c.u1, c.v1 - r);
    if (r) h.absarc(c.u1 - r, c.v1 - r, r, 0, Math.PI / 2, false);
    h.lineTo(c.u0 + r, c.v1);
    if (r) h.absarc(c.u0 + r, c.v1 - r, r, Math.PI / 2, Math.PI, false);
    h.lineTo(c.u0, c.v0 + r);
    if (r) h.absarc(c.u0 + r, c.v0 + r, r, Math.PI, 1.5 * Math.PI, false);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false, curveSegments: 8 });
  g.translate(-L / 2, -W / 2, -T / 2); g.scale(k, k, k);
  const eu = p.plane === 'yz' ? [0, 1, 0] : [1, 0, 0], ev = p.plane === 'xy' ? [0, 1, 0] : [0, 0, 1];
  const en = [eu[1] * ev[2] - eu[2] * ev[1], eu[2] * ev[0] - eu[0] * ev[2], eu[0] * ev[1] - eu[1] * ev[0]];
  g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(...eu), new THREE.Vector3(...ev), new THREE.Vector3(...en)));
  g.computeVertexNormals();
  return g;
}

export function build3D(THREE, spec, P, opts = {}) {
  const asm = opts.asm || null;
  const k = 1 / 1000;
  const M = {
    body: new THREE.MeshStandardMaterial({ name: 'korpus', color: P.bodyColor, roughness: 0.62 }),
    front: new THREE.MeshStandardMaterial({ name: 'fasad', color: P.frontColor, roughness: 0.5 }),
    back: new THREE.MeshStandardMaterial({ name: 'hdf', color: 0xe6e2da, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ name: 'metall', color: P.metalColor, metalness: 0.4, roughness: 0.3 }),
    mirror: new THREE.MeshStandardMaterial({ name: 'zerkalo', color: 0xdfe6ea, metalness: 0.4, roughness: 0.05 }),
    top: new THREE.MeshStandardMaterial({ name: 'stoleshnitsa', color: P.worktopColor || 0x6d6a66, roughness: 0.45 }),
    glass: new THREE.MeshStandardMaterial({ name: 'steklo', color: 0xcfe0e4, roughness: 0.05, transparent: true, opacity: 0.32 }),
  };
  const holeMats = {};
  const holeMat = d => holeMats[d] || (holeMats[d] = new THREE.MeshBasicMaterial({ name: 'prisadka_d' + d, color: HOLE_COL[d] ?? 0x333333 }));
  const root = new THREE.Group(); root.name = 'mebel';
  const groups = {};
  const hidden = g => P.hideDoors && g && (g.type === 'hinge' || g.type === 'slidex');
  const skipStage = st => asm && !asm.shown.has(st);
  const cmats = new Map();
  const colored = (k, c) => { const key = k + c; if (!cmats.has(key)) { const m = M[k].clone(); m.color.set(c); cmats.set(key, m); } return cmats.get(key); };
  const hlMats = new Map();
  // деталь текущего шага — тот же материал с оранжевой подсветкой
  const hl = (st, m) => {
    if (!asm || st !== asm.current) return m;
    if (!hlMats.has(m)) { const c = m.clone(); c.emissive = new THREE.Color(0xd4672a); c.emissiveIntensity = 0.45; hlMats.set(m, c); }
    return hlMats.get(m);
  };
  // doors, flaps and drawers open together and stop where they touch each other or the carcass
  const sol = solve(spec, asm ? 0 : P.open, { skip: hidden });

  function parentFor(g) {
    if (!g) return { obj: root, off: [0, 0, 0] };
    if (!groups[g.id]) {
      const o = new THREE.Group(); o.name = g.id;
      const pv = g.pivot || [0, 0, 0];
      o.position.set(pv[0] * k, pv[1] * k, pv[2] * k);
      const pose = groupPose(g, sol.q.get(g.id) ?? 0);
      if (pose.axis) o.rotation[pose.axis] = pose.angle;
      o.position.x += pose.d[0] * k; o.position.y += pose.d[1] * k; o.position.z += pose.d[2] * k;
      root.add(o); groups[g.id] = { obj: o, off: pv };
    }
    return groups[g.id];
  }
  let curPart = null;
  const add = (parent, name, geo, mat, c, sec) => {
    const m = new THREE.Mesh(geo, mat); m.name = name;
    m.position.set((c[0] - parent.off[0]) * k, (c[1] - parent.off[1]) * k, (c[2] - parent.off[2]) * k);
    if (sec) m.userData.section = sec - 1;
    if (curPart !== null) m.userData.part = curPart;
    parent.obj.add(m); return m;
  };
  const boxGeo = (x, y, z) => new THREE.BoxGeometry(x * k, y * k, z * k);

  spec.parts.forEach((p, i) => {
    if (hidden(p.group) || skipStage(p.asm)) return;
    curPart = i;
    const par = parentFor(p.group);
    const mat = hl(p.asm, p.color ? colored(p.mat, p.color) : M[p.mat]);
    const [sx, sy, sz] = dims(p);
    const name = translit(p.name) + '_' + (i + 1);
    if (p.style === 'shaker' || p.style === 'glass') {
      const r = p.mill ? p.mill.frameW : 70, [cx, cy, cz] = p.c;
      add(par, name + '_l', boxGeo(r, sy, sz), mat, [cx - sx / 2 + r / 2, cy, cz], p.sec);
      add(par, name + '_r', boxGeo(r, sy, sz), mat, [cx + sx / 2 - r / 2, cy, cz], p.sec);
      add(par, name + '_t', boxGeo(sx - 2 * r, r, sz), mat, [cx, cy + sy / 2 - r / 2, cz], p.sec);
      add(par, name + '_b', boxGeo(sx - 2 * r, r, sz), mat, [cx, cy - sy / 2 + r / 2, cz], p.sec);
      if (p.style === 'shaker') add(par, name + '_c', boxGeo(sx - 2 * r + 2, sy - 2 * r + 2, p.mill ? Math.max(1, sz - p.mill.depth) : sz * 0.45), mat, [cx, cy, cz - (p.mill ? p.mill.depth / 2 : sz * 0.2)], p.sec);
    } else add(par, name, p.cutouts && p.cutouts.length ? cutGeometry(THREE, p, k) : boxGeo(sx, sy, sz), mat, p.c, p.sec);

    if (P.showHoles) for (const h of p.holes) {
      if (h.f !== 'A' && h.f !== 'B') continue;
      const s = h.f === 'A' ? -1 : 1, x0 = p.c[0] - sx / 2, y0 = p.c[1] - sy / 2, z0 = p.c[2] - sz / 2;
      const geo = new THREE.CylinderGeometry(h.d / 2 * k, h.d / 2 * k, 0.0012, h.d > 10 ? 32 : 12);
      let pos, rot;
      if (p.plane === 'yz') { pos = [p.c[0] + s * (sx / 2 + 0.5), y0 + h.u, z0 + h.v]; rot = 'z'; }
      else if (p.plane === 'xz') { pos = [x0 + h.u, p.c[1] - s * (sy / 2 + 0.5), z0 + h.v]; rot = null; }
      else { pos = [x0 + h.u, y0 + h.v, p.c[2] - s * (sz / 2 + 0.5)]; rot = 'x'; }
      const m = add(par, 'otv_d' + h.d, geo, holeMat(h.d), pos, p.sec);
      if (rot === 'z') m.rotation.z = Math.PI / 2; if (rot === 'x') m.rotation.x = Math.PI / 2;
    }
  });

  curPart = null;
  const links = [];
  spec.extras.forEach(e => {
    if (hidden(e.group) || skipStage(e.asm)) return;
    const par = parentFor(e.group);
    if (e.kind === 'link') { links.push([e, par]); return; }
    let geo;
    if (e.kind === 'cyl') geo = new THREE.CylinderGeometry(e.r * k, e.r * k, e.len * k, 24);
    else if (e.kind === 'sphere') geo = new THREE.SphereGeometry(e.r * k, 24, 16);
    else geo = boxGeo(...e.s);
    const m = add(par, e.kind === 'box' ? 'profil' : e.kind === 'sphere' ? 'ruchka' : 'metall', geo, hl(e.asm, M[e.mat]), e.c, e.sec);
    if (e.axis === 'x') m.rotation.z = Math.PI / 2;
    if (e.axis === 'z') m.rotation.x = Math.PI / 2;
  });

  // rods between a fixed point and a point on a moving group (hinge arms, stays): drawn after the groups are posed
  root.updateMatrixWorld(true);
  const Y = new THREE.Vector3(0, 1, 0);
  for (const [e, par] of links) {
    const a = new THREE.Vector3(...e.a).multiplyScalar(k);
    const b = par.obj === root ? new THREE.Vector3(...e.b).multiplyScalar(k)
      : par.obj.localToWorld(new THREE.Vector3(e.b[0] - par.off[0], e.b[1] - par.off[1], e.b[2] - par.off[2]).multiplyScalar(k));
    const dir = b.clone().sub(a), len = dir.length();
    if (len < 1e-6) continue;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(e.r * k, e.r * k, len, 10), hl(e.asm, M[e.mat])); m.name = 'rychag';
    m.position.copy(a).add(b).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(Y, dir.normalize());
    if (e.sec) m.userData.section = e.sec - 1;
    root.add(m);
  }

  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    let q = o; while (q && q.userData.section === undefined) q = q.parent;
    if (q) o.userData.section = q.userData.section;
  });
  return root;
}

const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',' ':'_' };
export const translit = s => s.toLowerCase().split('').map(c => TR[c] ?? (/[\w-]/.test(c) ? c : '')).join('');

/** 3D проекта: у одного модуля — обычная сцена, у нескольких — группа со сдвигом модулей; view — open, hideDoors, showHoles. */
export function build3DProject(THREE, proj, view = {}, opts = {}) {
  const k = 1 / 1000;
  const built = proj.mods.map(m => {
    const c = build3D(THREE, m.spec, { ...m.P, open: view.open, hideDoors: view.hideDoors, showHoles: view.showHoles }, opts);
    c.traverse(o => { o.userData.mod = m.i; });
    c.userData.modRoot = m.i;
    return c;
  });
  const wt = proj.worktops && proj.worktops.length ? proj.worktops : null;
  const room = view.room && proj.frame ? view.room : null;
  if (!proj.multi && !wt && !room) return built[0];
  const grp = new THREE.Group();
  built.forEach((c, i) => { const m = proj.mods[i]; c.position.set(m.x * k, m.y * k, m.z * k); c.rotation.y = m.rot || 0; grp.add(c); });
  if (wt) {
    const c = build3D(THREE, { parts: wt, extras: [], hw: [], hwx: [], warnings: [], meta: proj.spec.meta }, { ...proj.mods[0].P, open: 0 }, opts);
    c.traverse(o => { o.userData.mod = -1; });
    grp.add(c);
  }
  if (room) grp.add(buildRoom3D(THREE, proj.frame, room));
  return grp;
}

/** Оболочка помещения: пол, стены A и B, проёмы и плинтус; не выбирается мышью (нет part и section). */
export function buildRoom3D(THREE, fr, room) {
  const k = 1 / 1000, g = new THREE.Group(), left = fr.corner !== 'R';
  const mat = (color, opacity) => new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity >= 1, roughness: 1, metalness: 0 });
  const x0 = fr.xOf(0), x1 = fr.xOf(room.w), z0 = fr.zOf(0), z1 = fr.zOf(room.d), wx = left ? x0 : x1;
  const add = (w, h, color, op, pos, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w * k, h * k), mat(color, op)); m.position.set(...pos); m.rotation.y = ry; g.add(m); return m; };
  const floor = add(room.w, room.d, 0xe6e1d7, 1, [((x0 + x1) / 2) * k, -0.002, ((z0 + z1) / 2) * k]); floor.rotation.x = -Math.PI / 2;
  add(room.w, room.h, 0xf3f1ec, 0.35, [((x0 + x1) / 2) * k, (room.h / 2) * k, (z0 - 2) * k]);
  add(room.d, room.h, 0xf3f1ec, 0.35, [(wx + (left ? -2 : 2)) * k, (room.h / 2) * k, ((z0 + z1) / 2) * k], Math.PI / 2);
  for (const o of room.openings) {
    const col = o.kind === 'door' ? 0xc8a26a : 0x8fc1e6, cy = (o.y + o.h / 2) * k;
    if (o.wall === 'A') add(o.w, o.h, col, 0.8, [fr.xOf(o.x + o.w / 2) * k, cy, (z0 - 1) * k]);
    else add(o.w, o.h, col, 0.8, [(wx + (left ? -1 : 1)) * k, cy, fr.zOf(o.x + o.w / 2) * k], Math.PI / 2);
  }
  if (room.skirt > 0) {
    const box = (w, h, d, pos) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w * k, h * k, d * k), mat(0xf7f5f0, 1)); m.position.set(...pos); g.add(m); };
    box(room.w, room.skirt, room.skirtT, [((x0 + x1) / 2) * k, (room.skirt / 2) * k, (z0 + room.skirtT / 2) * k]);
    box(room.skirtT, room.skirt, room.d, [(wx + (left ? 1 : -1) * (room.skirtT / 2)) * k, (room.skirt / 2) * k, ((z0 + z1) / 2) * k]);
  }
  g.traverse(o => { o.userData.room = true; });
  return g;
}
