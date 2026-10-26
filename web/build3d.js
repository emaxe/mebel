// three.js model from the furniture spec (mm → m).
import { dims, groupPose, solve } from './kinematics.js';
export { dims };
const HOLE_COL = { 35: 0xd4672a, 15: 0x8e44ad, 8: 0x2f8f5b, 7: 0x2b6cb0, 5: 0x2f2f2f, 3: 0x7a7a7a, 4: 0x7a7a7a };

export function build3D(THREE, spec, P) {
  const k = 1 / 1000;
  const M = {
    body: new THREE.MeshStandardMaterial({ name: 'korpus', color: P.bodyColor, roughness: 0.62 }),
    front: new THREE.MeshStandardMaterial({ name: 'fasad', color: P.frontColor, roughness: 0.5 }),
    back: new THREE.MeshStandardMaterial({ name: 'hdf', color: 0xe6e2da, roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ name: 'metall', color: P.metalColor, metalness: 0.4, roughness: 0.3 }),
    mirror: new THREE.MeshStandardMaterial({ name: 'zerkalo', color: 0xdfe6ea, metalness: 0.4, roughness: 0.05 }),
    glass: new THREE.MeshStandardMaterial({ name: 'steklo', color: 0xcfe0e4, roughness: 0.05, transparent: true, opacity: 0.32 }),
  };
  const holeMats = {};
  const holeMat = d => holeMats[d] || (holeMats[d] = new THREE.MeshBasicMaterial({ name: 'prisadka_d' + d, color: HOLE_COL[d] ?? 0x333333 }));
  const root = new THREE.Group(); root.name = 'mebel';
  const groups = {};
  const hidden = g => P.hideDoors && g && (g.type === 'hinge' || g.type === 'slidex');
  // doors, flaps and drawers open together and stop where they touch each other or the carcass
  const sol = solve(spec, P.open, { skip: hidden });

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
  const add = (parent, name, geo, mat, c, sec) => {
    const m = new THREE.Mesh(geo, mat); m.name = name;
    m.position.set((c[0] - parent.off[0]) * k, (c[1] - parent.off[1]) * k, (c[2] - parent.off[2]) * k);
    if (sec) m.userData.section = sec - 1;
    parent.obj.add(m); return m;
  };
  const boxGeo = (x, y, z) => new THREE.BoxGeometry(x * k, y * k, z * k);

  spec.parts.forEach((p, i) => {
    if (hidden(p.group)) return;
    const par = parentFor(p.group);
    const [sx, sy, sz] = dims(p);
    const name = translit(p.name) + '_' + (i + 1);
    if (p.style === 'shaker' || p.style === 'glass') {
      const r = 70, [cx, cy, cz] = p.c;
      add(par, name + '_l', boxGeo(r, sy, sz), M[p.mat], [cx - sx / 2 + r / 2, cy, cz], p.sec);
      add(par, name + '_r', boxGeo(r, sy, sz), M[p.mat], [cx + sx / 2 - r / 2, cy, cz], p.sec);
      add(par, name + '_t', boxGeo(sx - 2 * r, r, sz), M[p.mat], [cx, cy + sy / 2 - r / 2, cz], p.sec);
      add(par, name + '_b', boxGeo(sx - 2 * r, r, sz), M[p.mat], [cx, cy - sy / 2 + r / 2, cz], p.sec);
      if (p.style === 'shaker') add(par, name + '_c', boxGeo(sx - 2 * r + 2, sy - 2 * r + 2, sz * 0.45), M[p.mat], [cx, cy, cz - sz * 0.2], p.sec);
    } else add(par, name, boxGeo(sx, sy, sz), M[p.mat], p.c, p.sec);

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

  const links = [];
  spec.extras.forEach(e => {
    if (hidden(e.group)) return;
    const par = parentFor(e.group);
    if (e.kind === 'link') { links.push([e, par]); return; }
    let geo;
    if (e.kind === 'cyl') geo = new THREE.CylinderGeometry(e.r * k, e.r * k, e.len * k, 24);
    else if (e.kind === 'sphere') geo = new THREE.SphereGeometry(e.r * k, 24, 16);
    else geo = boxGeo(...e.s);
    const m = add(par, e.kind === 'box' ? 'profil' : e.kind === 'sphere' ? 'ruchka' : 'metall', geo, M[e.mat], e.c, e.sec);
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
    const m = new THREE.Mesh(new THREE.CylinderGeometry(e.r * k, e.r * k, len, 10), M[e.mat]); m.name = 'rychag';
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
