// Просмотр проекта по ссылке (?t=токен): только чтение, без входа. 3D, габариты, переход к заданию на распил и КП.
import { normalize } from './rules.js';
import { build3DProject } from './build3d.js';
import { buildProject } from './project.js';
import { loadCatalog } from './catalog.js';
import { resolveHw } from './fittings.js';

const token = new URLSearchParams(location.search).get('t');
const msg = document.getElementById('msg');
const fail = text => { msg.textContent = text; msg.hidden = false; };

const r = token ? await fetch('api/share/' + encodeURIComponent(token)).then(x => (x.ok ? x.json() : null)).catch(() => null) : null;
if (!r) fail('Ссылка недействительна или отозвана.');
else {
  const stage = document.querySelector('three-d-stage'), { THREE } = await stage.ready;
  const P = normalize(r.P), cat = loadCatalog({ getItem: () => (r.catalog ? JSON.stringify(r.catalog) : null) }), proj = buildProject(P, { hwFor: p => resolveHw(cat, p) }), spec = proj.spec;
  document.title = `${r.name} — Конструктор мебели`;
  document.getElementById('name').textContent = r.name;
  document.getElementById('dims').textContent = proj.multi ? `${proj.mods.length} мод. · ${Math.round(spec.meta.W)} × ${Math.round(spec.meta.H)} × ${Math.round(spec.meta.D)} мм` : `${Math.round(spec.meta.W)} × ${P.height} × ${P.depth} мм`;
  document.getElementById('prod').href = 'production.html?share=' + encodeURIComponent(token);
  document.getElementById('kp').href = 'production.html?share=' + encodeURIComponent(token) + '#kp';
  stage.setObject(build3DProject(THREE, proj, P), { floorY: 0 });
}
