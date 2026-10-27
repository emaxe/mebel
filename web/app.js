import { buildSpec, isDrawer } from './model.js';
import { build3DProject } from './build3d.js';
import { toCSV, toDXF, groupParts, nest, partKey, sawSize } from './export.js';
import { toCutCSV, toDrillJSON } from './export-cut.js';
import { nestMapDXF } from './dxf.js';
import { checkBuild, panelIssues } from './check.js';
import { assemblySteps } from './assembly.js';
import { modelsFor, selKey, variantOf, resolveHw, KIND_LABELS } from './fittings.js';
import { HW_PARAM_DEFS, HW_DEFAULTS } from './hwparams.js';
import { dimensions } from './dims.js';
import { buildProject, moduleList, addModule, duplicateModule, removeModule, moveModule, setModuleProps, cabinetOf, moduleCount } from './project.js';
import { orientLines, edgeNames, machiningRows } from './partinfo.js';
import { autoFixAsync, kinProblems } from './autofix.js';
import { MIN_DRAWER_H, FILL_LABELS, rulesOf, makePreset, normalize, fillItems, innerH, autoShelves, stepShelves, fitWidth, totalWidth, sectionOfMessage, moveItem, autoDrawers, packDrawers, redistribute, fitSections, clamp } from './rules.js';
import { loadCatalog, saveCatalog, sanitizeCatalog, sheetFor, isTextured, DEFAULT_CATALOG, CATALOG_KEY, catalogHooks } from './catalog.js';
import { loadProjects, saveProjects, newId, uniqueName, projectFile, parseProjectFile, hooks, PROJECTS_KEY, CURRENT_KEY, LEGACY_KEY, NAME_KEY } from './projects.js';
import { putThumb, getThumb, getLocalThumb, delThumb, setRemote } from './thumbs.js';
import { createApi } from './api.js';
import { createSync } from './sync.js';
import { initAccount } from './account.js';

const stage = document.querySelector('three-d-stage');
const { THREE } = await stage.ready;

let cat = loadCatalog();
const woods = () => cat.decors.map(d => [d.name, d.color]);
const METAL = [['Хром', '#c8ccd0'], ['Латунь', '#c9a25a'], ['Чёрный', '#2a2a2a']];
const STYLES = [['flat', 'Гладкий'], ['shaker', 'Рамочный'], ['mirror', 'Зеркало'], ['glass', 'Стекло']];
const TYPES = [['wardrobe', 'Шкаф'], ['rack', 'Стеллаж'], ['nightstand', 'Тумба'], ['dresser', 'Комод'], ['tv', 'ТВ-тумба']];

// ── проекты: список в localStorage, текущий дублируется в 'mebel-v3' для production.html
let { db, cur } = loadProjects();
// первый запуск: проектов нет — временная заготовка, в хранилище не пишется, пока пользователь не создаст проект
let placeholder = false;
const usePlaceholder = () => { placeholder = true; cur = newId(); db[cur] = { name: 'Новый проект', updated: Date.now(), P: makePreset('wardrobe') }; };
if (!cur) usePlaceholder();
let root = normalize(db[cur].P), active = 0, P = root, proj = null;
root.asmStep = 0; // пошаговая сборка в 3D — режим просмотра, при открытии проекта выключен
let sel = 0, selPartKey = null, partBox = null, model, spec, outline, asmSteps = [], hwp;
let sync = null, account = null; // сервер необязателен: без него приложение остаётся локальным
const savedEl = document.getElementById('saved');
let savedTimer;
let saveTimer = 0, pendingSave = false;
const save = () => {
  clearTimeout(saveTimer); pendingSave = false;
  if (placeholder || !db[cur]) return;
  db[cur].P = root; db[cur].updated = Date.now();
  const ok = saveProjects(db, cur);
  savedEl.textContent = ok ? '✓ Сохранено' : 'Не сохранено: нет места';
  savedEl.className = 'saved ' + (ok ? 'ok' : 'err');
  clearTimeout(savedTimer); if (ok) savedTimer = setTimeout(() => (savedEl.className = 'saved'), 1500);
};
const saveSoon = () => { pendingSave = true; clearTimeout(saveTimer); saveTimer = setTimeout(save, 300); };
addEventListener('pagehide', () => { if (pendingSave) save(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && pendingSave) save(); });

// ── отмена и повтор: каждая правка — один шаг (перетаскивание ползунка тоже один); параметры вида (открыть двери и т. п.) не записываются
const hist = [], redoSt = [];
let editing = null;
const undoBtn = document.getElementById('undo'), redoBtn = document.getElementById('redo');
const syncUndo = () => { undoBtn.disabled = !hist.length; redoBtn.disabled = !redoSt.length; };
const stack = (a, j) => { a.push(j); if (a.length > 60) a.shift(); };
/** Запомнить состояние до правки (один раз за жест); endEdit убирает запись, если ничего не изменилось. */
const beginEdit = () => { if (editing === null) { editing = JSON.stringify(root); stack(hist, editing); redoSt.length = 0; syncUndo(); } };
const endEdit = () => { if (editing === null) return; if (JSON.stringify(root) === editing) hist.pop(); editing = null; syncUndo(); };
const snap = () => { stack(hist, JSON.stringify(root)); redoSt.length = 0; syncUndo(); };
const restore = j => {
  const keep = { open: root.open, hideDoors: root.hideDoors, showHoles: root.showHoles, asmStep: root.asmStep };
  root = normalize({ ...JSON.parse(j), ...keep }); active = Math.min(active, moduleCount(root) - 1); P = cabinetOf(root, active); sel = Math.min(sel, P.sections.length - 1); kinKey = ''; selPartKey = null;
  drawAll(); render(true); syncUndo();
};
const undo = () => { const j = hist.pop(); if (!j) return; stack(redoSt, JSON.stringify(root)); restore(j); };
const redo = () => { const j = redoSt.pop(); if (!j) return; stack(hist, JSON.stringify(root)); restore(j); };
undoBtn.onclick = undo; redoBtn.onclick = redo;
const act = fn => (...a) => { beginEdit(); try { fn(...a); } finally { endEdit(); } };
addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
  const t = e.target, typing = t && (t.isContentEditable || /^(textarea|select)$/i.test(t.tagName) || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox'));
  if (typing || document.getElementById('dlg').open || document.getElementById('projDlg').open) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});

let secClip = null;
addEventListener('keydown', e => {
  if (e.altKey) return;
  const t = e.target, mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
  const typing = t && (t.isContentEditable || /^(textarea|select|input)$/i.test(t.tagName));
  const free = !t || t === document.body || t.tagName === 'THREE-D-STAGE' || t.tagName === 'CANVAS';
  if (document.getElementById('dlg').open || document.getElementById('projDlg').open) return;
  if (e.key === 'Escape' && selPartKey && !typing) { selPartKey = null; highlight(); return; }
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && selPartKey && !typing && !mod) {
    const p = spec.parts.find(x => partIdOf(x) === selPartKey);
    if (p && p.item !== undefined) {
      e.preventDefault();
      const sc = P.sections[p.sec - 1], it = sc.items[p.item], dir = e.key === 'ArrowUp' ? 1 : -1;
      const nv = moveItem(sc, p.item, it.y + dir * (e.shiftKey ? 1 : 32), { ...shelfOpts(e.shiftKey), step: e.shiftKey ? 0 : 32 });
      if (nv !== it.y) { act(() => { it.y = nv; })(); drawSections(); render(false); }
      return;
    }
  }
  const redraw = () => { drawSections(); render(true); };
  const insert = json => { if (P.sections.length >= R().maxSec) return false; act(() => { P.sections.splice(sel + 1, 0, JSON.parse(json)); sel++; })(); redraw(); return true; };
  if (!mod && free && (e.key === 'Delete' || e.key === 'Backspace') && P.sections.length > 1) { e.preventDefault(); act(() => { P.sections.splice(sel, 1); sel = Math.max(0, sel - 1); })(); redraw(); }
  else if (!mod && free && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { const n = sel + (e.key === 'ArrowLeft' ? -1 : 1); if (n >= 0 && n < P.sections.length) { e.preventDefault(); select(n); } }
  else if (mod && !typing && k === 'c' && !String(getSelection()).length) { secClip = JSON.stringify(P.sections[sel]); e.preventDefault(); }
  else if (mod && !typing && k === 'v' && secClip) { if (insert(secClip)) e.preventDefault(); }
  else if (mod && !typing && k === 'd') { e.preventDefault(); insert(JSON.stringify(P.sections[sel])); }
});

// what the current project actually contains: controls for absent things are hidden
const R = () => rulesOf(P);
const hinged = () => P.doorType !== 'sliding';
const items = () => P.sections.flatMap(s => s.items);
const hasDrawers = () => items().some(i => isDrawer(i.type));
const hasHingedDoors = () => hinged() && P.sections.some(s => s.door !== 'none');
const hasDoors = () => hasHingedDoors() || P.doorType === 'sliding';
const hasShelves = () => items().some(i => i.type === 'shelf' || i.type === 'glass');
const hasMoving = () => hasDoors() || hasDrawers();

// ── kinematic warnings: what stops when everything is opened (cached until the construction changes)
// раскрой нужен панели, чтобы сказать «деталь не помещается на лист» (листы и обрезка — из справочника)
const nestFor = spec => nest(groupParts(spec), { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: cat.cut.kerf, trim: cat.cut.trim, minOffcut: cat.cut.minOffcut, stock: cat.stock });
let kinKey = '', kinWarn = [], buildIssues = [], fixNote = null;
/** Одинаковые строки сворачиваются в одну с числом повторов: «… (×3)». */
const dedupe = list => { const m = new Map(); for (const t of list) m.set(t, (m.get(t) || 0) + 1); return [...m].map(([t, n]) => (n > 1 ? `${t} (×${n})` : t)); };
/** Ключ конструкции: что не влияет на панель замечаний (вид и цвета), в него не входит. */
const panelKey = () => { const { open, hideDoors, showHoles, asmStep, bodyColor, bodyName, frontColor, frontName, metalColor, ...rest } = P; return JSON.stringify(rest); };
function kinematicWarnings() {
  const key = panelKey();
  if (key === kinKey) return kinWarn;
  kinKey = key;
  kinWarn = dedupe(kinProblems(spec).map(k => k.text));
  // проверка собираемости: ошибки присадки, пересечения, висящие детали (кинематику показывает своя часть панели)
  try { buildIssues = dedupe(panelIssues(checkBuild(spec, P, { skipKin: true, hw: hwp, N: nestFor(spec) })).map(f => (f.level === 'error' ? '✕ ' : '! ') + f.text)); } catch (e) { buildIssues = []; console.error(e); }
  if (buildIssues.length > 6) buildIssues = [...buildIssues.slice(0, 6), `…и ещё ${buildIssues.length - 6}`];
  if (kinWarn.length > 6) kinWarn = [...kinWarn.slice(0, 6), `…и ещё ${kinWarn.length - 6}`];
  return kinWarn;
}
let fixing = false;
async function fixAll() {
  if (fixing) return;
  fixing = true; beginEdit();
  const btn = document.querySelector('.fixbtn'); if (btn) { btn.disabled = true; btn.textContent = 'Исправляю…'; }
  try { fixNote = await autoFixAsync(P, { hw: hwp }); } finally { fixing = false; endEdit(); }
  if (fixNote.partial) fixNote.log.push('время подбора вышло: нажмите ещё раз, чтобы продолжить');
  kinKey = '';
  drawAll(); render(false);
}

let panelTimer = 0, panelNote = null;
function renderWarn(full) {
  const w = document.getElementById('warn'), ready = full || panelKey() === kinKey;
  const calc = ready ? kinematicWarnings() : [], issues = ready ? buildIssues : [];
  const others = proj && proj.multi ? dedupe(proj.mods.filter(m => m.i !== active).flatMap(m => m.spec.warnings.map(w => `${m.name}: ${w}`))) : [];
  const all = [...dedupe(spec.warnings), ...calc], note = panelNote;
  if (full) panelNote = null;
  w.innerHTML = '';
  if (note && note.log.length) { const d = el('div', 'fixed'); d.textContent = 'Исправлено: ' + note.log.join('; '); w.append(d); }
  const has = all.length > 0 || issues.length > 0 || others.length > 0;
  if (note && !note.log.length && has) w.append(el('div', 'fixed', 'Автоматически исправить не удалось — измените параметры вручную.'));
  const line = x => {
    const d = el('div', '', x), i = sectionOfMessage(x, P.sections.length);
    if (i !== null) {
      d.classList.add('link'); d.tabIndex = 0; d.title = `Показать секцию ${i + 1}`;
      const go = () => { setTab('sections'); select(i); };
      d.onclick = go; d.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    }
    return d;
  };
  all.forEach(x => w.append(line(x)));
  others.forEach(x => w.append(el('div', '', x)));
  issues.forEach(x => w.append(line(x)));
  if (!ready) w.append(el('div', 'hint2', 'Проверяю конструкцию…'));
  if (has) { const b = el('button', 'fixbtn', 'Исправить автоматически'); b.title = 'Раздвинет перекрывающиеся элементы, сдвинет полки от петель, подберёт ручки и фасады так, чтобы всё открывалось'; b.onclick = fixAll; w.append(b); }
  w.style.display = w.childNodes.length ? '' : 'none';
}
const composeModel = asm => build3DProject(THREE, proj, root, { asm });
function render(frame) {
  normalize(root);
  active = Math.min(active, moduleCount(root) - 1); P = cabinetOf(root, active);
  sel = Math.min(sel, P.sections.length - 1);
  hwp = resolveHw(cat, P);
  proj = buildProject(root, { hwFor: p => resolveHw(cat, p) });
  spec = proj.mods[active].spec;
  saveSoon();
  let asm = null;
  if (root.asmStep > 0) {
    asmSteps = assemblySteps(spec, groupParts(spec), P);
    root.asmStep = clamp(root.asmStep, 1, Math.max(1, asmSteps.length));
    asm = { shown: new Set(asmSteps.slice(0, root.asmStep).map(s => s.stage)), current: asmSteps[root.asmStep - 1].stage };
  }
  model = composeModel(asm);
  stage.setObject(model, { keepCamera: !frame, floorY: 0 });
  drawAsmBar();
  const m = spec.meta, pm = proj.spec.meta;
  const wi = document.getElementById('totalW'); if (wi && document.activeElement !== wi) wi.value = Math.round(m.W);
  document.getElementById('dims').textContent = proj.multi
    ? `${moduleCount(root)} мод. · ${Math.round(pm.W)} × ${Math.round(pm.H)} × ${Math.round(pm.D)} мм · деталей: ${proj.spec.parts.length}`
    : `${Math.round(m.W)} × ${P.height} × ${P.depth} мм · деталей: ${spec.parts.length}`;
  drawHeader(); scheduleThumb();
  if (fixNote) { panelNote = fixNote; fixNote = null; }
  renderWarn(false); // сразу то, что считается мгновенно; кинематика, проверка и раскрой — после паузы, пока тянут ползунок
  clearTimeout(panelTimer); panelTimer = setTimeout(() => renderWarn(true), 200);
  document.querySelectorAll('[data-when]').forEach(e => (e.style.display = e._when() ? '' : 'none'));
  highlight();
}
const partIdOf = p => (p.item !== undefined ? `item|${p.sec}|${p.item}` : `${p.name}|${p.sec}|${p.c.map(v => Math.round(v)).join(',')}`);
const partCard = document.getElementById('partcard');
function hidePartCard() { partCard.hidden = true; partCard.textContent = ''; }
function showPartCard(p) {
  const n = v => String(Math.round(v * 10) / 10).replace('.', ',');
  const g = groupParts(spec).find(x => partKey(x) === partKey(p)), saw = sawSize(p), e = edgeNames(p.plane);
  partCard.textContent = '';
  const head = el('div', 'pc-head'), close = el('button', 'pc-close', '×'); close.title = 'Снять выделение (Esc)';
  close.onclick = () => { selPartKey = null; highlight(); };
  head.append(el('b', '', p.name), close); partCard.append(head);
  const row = (k, v) => { if (v === '' || v == null) return; const r = el('div', 'pc-row'); r.append(el('span', '', k), el('span', '', v)); partCard.append(r); };
  row('В спецификации', g ? `№${g.no}${g.qty > 1 ? `, всего ${g.qty} шт.` : ''}` : '');
  row('Секция', p.sec ? String(p.sec) : '');
  row('Материал', p.label ? `${p.label}, ${n(p.T)} мм` : '');
  row('Размер', `${n(p.L)} × ${n(p.W)} мм`);
  if (saw.L !== p.L || saw.W !== p.W) row('Пильный', `${n(saw.L)} × ${n(saw.W)} мм`);
  const edges = Object.entries(p.edges || {}).filter(([, v]) => v).map(([k, v]) => `${e[k]} ${n(v)}`);
  row('Кромка', edges.join('; '));
  row('Отверстий', p.holes.length ? String(p.holes.length) : '');
  row('Пазов', p.grooves.length ? String(p.grooves.length) : '');
  const mach = machiningRows(p).map(m => m.title);
  row('Фрезеровка', mach.join('; '));
  for (const t of p.notes || []) row('', t);
  if (p.item !== undefined) row('', 'Перетащите вверх или вниз, либо стрелками ↑ ↓ (Shift — по 1 мм, Alt — без привязки к 32)');
  partCard.hidden = false;
}
function partOutline() {
  const sc = stage._scene;
  if (partBox) { sc.remove(partBox); partBox.geometry.dispose(); partBox = null; }
  const idx = selPartKey ? spec.parts.findIndex(p => partIdOf(p) === selPartKey) : -1;
  if (idx < 0) { selPartKey = null; hidePartCard(); return; }
  model.updateMatrixWorld(true);
  const box = new THREE.Box3();
  model.traverse(o => { if (o.isMesh && o.userData.part === idx && (o.userData.mod || 0) === active) box.expandByObject(o); });
  if (box.isEmpty()) { hidePartCard(); return; }
  const size = box.getSize(new THREE.Vector3()).addScalar(0.006), c = box.getCenter(new THREE.Vector3());
  partBox = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), new THREE.LineBasicMaterial({ color: 0x2a6fd4, depthTest: false, transparent: true }));
  partBox.position.copy(c); partBox.renderOrder = 11; sc.add(partBox);
  showPartCard(spec.parts[idx]);
}
const dimSvg = document.getElementById('dimsvg'), dimBox = document.getElementById('dimlabels');
const dimPrefs = (() => { try { return { on: localStorage.getItem('mebel-dims') !== '0' }; } catch { return { on: true }; } })();
let dimEls = [], dimKey = '';
const NS = 'http://www.w3.org/2000/svg';
function applyDim(edit, v) {
  const R_ = rulesOf(P);
  if (edit.k === 'W') act(() => fitWidth(P, v))();
  else if (edit.k === 'height') act(() => { const old = P.height; P.height = clamp(v, ...R_.height); if (P.fit) fitSections(P, innerH({ ...P, height: old }), innerH(P), P.fitMode); })();
  else if (edit.k === 'depth') act(() => { P.depth = clamp(v, ...R_.depth); })();
  else if (edit.k === 'sec') act(() => { P.sections[edit.i].width = clamp(v, ...R_.secW); })();
  drawAll(); render(true);
}
function buildDims() {
  dimBox.textContent = ''; dimSvg.textContent = ''; dimEls = []; dimKey = '';
  if (!dimPrefs.on || !spec) return;
  const am = proj.mods[active];
  for (const item of dimensions(spec, P, sel, { off: [am.x, am.y, am.z], total: proj.multi ? proj.spec.meta : null })) {
    const lines = ['ext', 'ext', 'main'].map(c => { const l = document.createElementNS(NS, 'line'); if (c === 'ext') l.setAttribute('class', 'ext'); else if (item.kind === 'gap') l.setAttribute('class', 'gap'); dimSvg.append(l); return l; });
    const btn = el('button', item.kind === 'gap' ? 'gap' : '', String(item.value));
    btn.title = item.edit ? 'Нажмите, чтобы ввести размер' : 'Просвет между полками';
    if (item.edit) btn.onclick = () => {
      if (btn.querySelector('input')) return;
      const inp = Object.assign(el('input'), { type: 'number', value: item.value, step: 1 });
      let done = false;
      const finish = ok => { if (done) return; done = true; const v = Math.round(+inp.value); if (ok && inp.value !== '' && Number.isFinite(v) && v !== item.value) applyDim(item.edit, v); else buildDims(); };
      inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); };
      inp.onblur = () => finish(true);
      btn.textContent = ''; btn.append(inp); inp.focus(); inp.select();
    };
    dimBox.append(btn); dimEls.push({ item, lines, btn });
  }
  placeDims();
}
function placeDims() {
  if (!dimEls.length || !model || !stage._camera) return;
  const cam = stage._camera, w = stage.clientWidth, h = stage.clientHeight, k = 1 / 1000;
  const key = cam.matrixWorld.elements.join() + '|' + w + 'x' + h + '|' + model.position.y + '|' + cam.zoom;
  if (key === dimKey) return;
  dimKey = key; model.updateMatrixWorld(true); cam.updateMatrixWorld(true);
  const proj = pt => { const v = new THREE.Vector3(pt[0] * k, pt[1] * k, pt[2] * k); model.localToWorld(v); v.project(cam); return v.z > 1 || v.z < -1 ? null : [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]; };
  for (const { item: it, lines, btn } of dimEls) {
    const add = (p, o) => [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
    const A = proj(it.a), B = proj(it.b), A2 = proj(add(it.a, it.off)), B2 = proj(add(it.b, it.off));
    const len = A2 && B2 ? Math.hypot(A2[0] - B2[0], A2[1] - B2[1]) : 0;
    const show = A && B && A2 && B2 && len > (it.kind === 'gap' ? 26 : 34);
    btn.style.display = show ? '' : 'none'; lines.forEach(l => (l.style.display = show ? '' : 'none'));
    if (!show) continue;
    const set = (l, p, q) => { l.setAttribute('x1', p[0]); l.setAttribute('y1', p[1]); l.setAttribute('x2', q[0]); l.setAttribute('y2', q[1]); };
    set(lines[0], A, A2); set(lines[1], B, B2); set(lines[2], A2, B2);
    btn.style.left = (A2[0] + B2[0]) / 2 + 'px'; btn.style.top = (A2[1] + B2[1]) / 2 + 'px';
  }
}
stage.onFrame = placeDims;
function highlight() {
  const sc = stage._scene; if (outline) { sc.remove(outline); outline.geometry.dispose(); }
  partOutline(); buildDims();
  const m = spec.meta, s = m.sections[sel]; if (!s) return;
  const k = 1 / 1000;
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry((s.w - 6) * k, (m.ih - 6) * k, (m.D + 40) * k)), new THREE.LineBasicMaterial({ color: 0xd4672a, depthTest: false, transparent: true }));
  const am = proj.mods[active];
  outline.position.set((s.x + am.x) * k, ((m.yB + m.yT) / 2 + am.y) * k + model.position.y, 0.02 + am.z * k);
  outline.renderOrder = 10; sc.add(outline);
}

// ── generic controls (c.hint → "?" tooltip next to the label)
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const tip = text => { const t = el('span', 'tip', '?'); t.dataset.tip = text; t.tabIndex = 0; t.setAttribute('role', 'note'); return t; };
function control(c, obj, onChange) {
  const row = el('div', 'row');
  if (c.when) { row.dataset.when = 1; row._when = () => c.when(obj); }
  const lab = el('div', 'lab'), name = el('span', '', c.l); if (c.hint && c.l) name.append(tip(c.hint)); lab.append(name); const out = el('b'); lab.append(out);
  if (c.l) row.append(lab);
  if (c.hint && !c.l) row.title = c.hint;
  if (c.tog) {
    row.classList.add('tog');
    const cb = Object.assign(el('input'), { type: 'checkbox', checked: !!obj[c.k] });
    cb.onchange = () => { if (!c.nohist) beginEdit(); const old = obj[c.k]; obj[c.k] = cb.checked; onChange(c, false, old); if (!c.nohist) endEdit(); };
    row.append(cb);
  } else if (c.sel) {
    const s = el('select');
    c.sel.forEach(([v, l]) => s.append(new Option(l, v, false, obj[c.k] === v)));
    s.onchange = () => { if (!c.nohist) beginEdit(); const old = obj[c.k]; obj[c.k] = s.value; onChange(c, false, old); if (!c.nohist) endEdit(); };
    row.append(s);
  } else if (c.seg || c.sw) {
    const wrap = el('div', c.seg ? 'seg' : 'sw');
    (c.seg || c.sw).forEach(([a, b]) => {
      const val = c.seg ? a : b, btn = el('button');
      if (c.seg) btn.textContent = b; else { btn.style.background = b; btn.title = a; }
      btn.classList.toggle('on', obj[c.k] === val);
      btn.onclick = () => { if (!c.nohist) beginEdit(); const old = obj[c.k]; obj[c.k] = val; if (c.sw) obj[c.k.replace('Color', 'Name')] = a; wrap.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === btn)); onChange(c, false, old); if (!c.nohist) endEdit(); };
      wrap.append(btn);
    });
    row.append(wrap);
  } else {
    const r = Object.assign(el('input'), { type: 'range', min: c.min, max: c.max, step: c.step, value: obj[c.k] });
    const num = !c.fmt && c.u === 'мм' ? Object.assign(el('input', 'num'), { type: 'number', min: c.min, max: c.max, step: 1, value: obj[c.k] }) : null;
    if (num) out.append(num, ' мм');
    const show = () => { if (num) num.value = obj[c.k]; else out.textContent = c.fmt ? c.fmt(obj[c.k]) : obj[c.k] + (c.u ? ' ' + c.u : ''); };
    show();
    if (num) num.onchange = () => {
      const v = Math.round(+num.value);
      if (!Number.isFinite(v) || num.value === '') { show(); return; }
      const nv = clamp(v, c.min, c.max);
      if (!c.nohist) beginEdit();
      const old = obj[c.k]; obj[c.k] = nv; r.value = nv; show(); onChange(c, false, old);
      if (!c.nohist) endEdit();
    };
    r.oninput = () => { if (!c.nohist) beginEdit(); const old = obj[c.k]; obj[c.k] = +r.value; show(); onChange(c, true, old); };
    r.onchange = () => { onChange(c, false); if (!c.nohist) endEdit(); };
    row.append(r);
  }
  return row;
}

// ── вырезы в деталях: список карточек, правка по индексу (после render список пересоздаётся нормализацией)
function cutoutsEditor() {
  const box = el('div', 'cutbox');
  const sample = name => spec && spec.parts.find(p => p.name === name && !p.group);
  const names = () => [...new Set((spec ? spec.parts : []).filter(p => !p.group).map(p => p.name))];
  const edit = (i, key, val) => { act(() => { if (P.cutouts[i]) P.cutouts[i][key] = val; })(); render(false); draw(); };
  const num = (i, key, label, hint) => {
    const r = el('label', 'cutf'), inp = Object.assign(el('input'), { type: 'number', value: P.cutouts[i][key], step: 'any' });
    inp.onchange = () => edit(i, key, +inp.value);
    r.append(el('span', '', label), inp); if (hint) r.title = hint; return r;
  };
  const draw = () => {
    box.innerHTML = '';
    box.append(el('div', 'hint2', 'Вырезы под розетки, кабели, трубы и плинтус. Идут в задание, чертёж детали, DXF и 3D. Вырез — прямоугольник с центром в точке (X, Y), выемка — угол детали. Координаты в системе детали (см. подсказку под выбором).'));
    P.cutouts.forEach((c, i) => {
      const card = el('div', 'cutcard'), top = el('div', 'cutrow');
      const part = el('select'); [...new Set([c.part, ...names()])].forEach(n => part.append(new Option(n, n, false, n === c.part))); part.onchange = () => edit(i, 'part', part.value);
      const kind = el('select'); [['hole', 'Вырез'], ['notch', 'Выемка в углу']].forEach(([v, l]) => kind.append(new Option(l, v, false, v === c.kind))); kind.onchange = () => edit(i, 'kind', kind.value);
      const del = el('button', 'x', '✕'); del.title = 'Удалить вырез'; del.onclick = () => { act(() => P.cutouts.splice(i, 1))(); render(false); draw(); };
      top.append(part, kind, del); card.append(top);
      const sp = sample(c.part);
      card.append(el('div', 'hint2', sp ? `Деталь ${Math.round(sp.L)}×${Math.round(sp.W)} мм (Ш — длина, Д — ширина). ${orientLines(sp)[0]}` : 'Такой детали в изделии сейчас нет: вырез не применится.'));
      const row = el('div', 'cutrow');
      row.append(num(i, 'w', c.kind === 'notch' ? 'Размер по Ш, мм' : 'Ширина, мм'), num(i, 'h', c.kind === 'notch' ? 'Размер по Д, мм' : 'Высота, мм'), num(i, 'r', 'Радиус, мм', 'Скругление углов выреза или внутреннего угла выемки'));
      if (c.kind === 'notch') {
        const cs = el('select'); [['w1d1', 'угол Ш1·Д1'], ['w2d1', 'угол Ш2·Д1'], ['w1d2', 'угол Ш1·Д2'], ['w2d2', 'угол Ш2·Д2']].forEach(([v, l]) => cs.append(new Option(l, v, false, v === c.corner))); cs.onchange = () => edit(i, 'corner', cs.value);
        row.append(cs);
      } else row.append(num(i, 'u', 'Центр от Ш1, мм', 'Расстояние от торца Ш1 до центра выреза вдоль длины'), num(i, 'v', 'Центр от Д1, мм', 'Расстояние от кромки Д1 до центра выреза вдоль ширины'));
      row.append(num(i, 'sec', 'Секция (0 — везде)'));
      card.append(row); box.append(card);
    });
    const add = el('button', 'mini', '+ Добавить вырез');
    add.onclick = () => act(() => {
      const name = names().includes('Задняя стенка') ? 'Задняя стенка' : names()[0] || 'Задняя стенка', sp = sample(name);
      P.cutouts.push({ part: name, sec: 0, kind: 'hole', w: 60, h: 60, r: 10, u: sp ? sp.L / 2 : 100, v: sp ? sp.W / 2 : 100, corner: 'w1d1' });
      render(false); draw();
    })();
    box.append(add);
  };
  draw();
  return box;
}

// выбор модели фурнитуры по категориям: строка появляется, если категория есть в изделии и в справочнике больше одной модели
function fittingRows() {
  const rows = [], keys = new Set((cat.fittings || []).map(f => selKey(f.kind, f.variant)));
  for (const key of keys) {
    const [kind, variant = ''] = key.split(':'), list = modelsFor(cat, kind, variant);
    if (list.length < 2) continue;
    rows.push({ obj: 'fittings', k: key, l: `Модель: ${KIND_LABELS[kind] || kind}${variant ? ' · ' + variant : ''}`, sel: list.map(m => [m.id, `${m.brand ? m.brand + ' ' : ''}${m.name || KIND_LABELS[kind]}${m.art ? ' (' + m.art + ')' : ''}`]), when: () => (spec.hwx || []).some(e => e.kind === kind && variantOf(e, P) === variant), hint: 'Модель попадёт в список покупок и смету. Список моделей и цены — в справочнике.' });
  }
  return rows;
}
// ── global settings (ranges and visibility follow the furniture type)
let widthMsg = '';
function widthRow() {
  const row = el('div', 'row'), lab = el('div', 'lab'), name = el('span', '', 'Общая ширина');
  name.append(tip('Ширина всего изделия по внешним граням. Секции подгоняются пропорционально, пока каждая остаётся в допустимых пределах: так можно вписать шкаф в нишу.'));
  const out = el('b'), num = Object.assign(el('input', 'num'), { type: 'number', id: 'totalW', step: 1, value: Math.round(totalWidth(P)) });
  out.append(num, ' мм'); lab.append(name, out); row.append(lab);
  const note = el('div', 'hintline');
  const limits = () => { const [lo, hi] = rulesOf(P).secW, n = P.sections.length, t = P.thickness; return [n * lo + (n + 1) * t, n * hi + (n + 1) * t]; };
  const range = () => { const [a, b] = limits(); note.textContent = `Возможно ${a}–${b} мм при ${P.sections.length} секц.`; };
  if (widthMsg) note.textContent = widthMsg; else range();
  num.min = limits()[0]; num.max = limits()[1];
  num.onchange = () => {
    const v = Math.round(+num.value);
    if (!Number.isFinite(v) || num.value === '') { num.value = Math.round(totalWidth(P)); return; }
    act(() => fitWidth(P, v))();
    const got = Math.round(totalWidth(P));
    widthMsg = got === v ? '' : `Запрошено ${v} мм, возможно ${got} мм (пределы секций).`;
    drawAll(); render(true); widthMsg = '';
  };
  row.append(note);
  return row;
}

const globalDefs = () => {
  const r = R();
  return [
    ['Корпус', [
      { k: 'fit', l: 'Подстраивать под размеры', tog: 1, hint: 'Включено: при изменении высоты, толщины ЛДСП или основания полки, штанги и ящики пересчитываются вместе с размером. Выключено: всё остаётся на своих высотах (что не помещается — ужимается).' },
      { k: 'fitMode', l: 'Как подстраивать', seg: [['prop', 'Пропорционально'], ['even', 'Равномерно']], when: () => P.fit, hint: 'Пропорционально — каждый элемент сохраняет относительное положение, ящики меняют высоту вместе с изделием. Равномерно — количество полок и ящиков то же, но они заново раскладываются поровну.' },
      { custom: widthRow },
      { k: 'height', l: 'Высота', min: r.height[0], max: r.height[1], step: 10, u: 'мм', frame: 1, scale: 1, hint: `Полная высота изделия вместе с цоколем или ножками. Для этого типа: ${r.height[0]}–${r.height[1]} мм.` },
      { k: 'depth', l: 'Глубина', min: r.depth[0], max: r.depth[1], step: 10, u: 'мм', frame: 1, hint: `Глубина корпуса без фасадов и ручек. Для этого типа: ${r.depth[0]}–${r.depth[1]} мм. От глубины зависит длина направляющих ящиков.` },
      { k: 'thickness', l: 'Толщина ЛДСП', seg: [[16, '16'], [18, '18'], [22, '22'], [25, '25']], scale: 1, hint: 'Толщина плиты корпуса. Меняет внутренние размеры и пильные размеры всех деталей.' },
      { k: 'joint', l: 'Крепёж корпуса', seg: [['confirmat', 'Конфирмат'], ['minifix', 'Эксцентрик'], ['dowel', 'Шкант']], hint: 'Конфирмат — стяжка 7×50, шляпка видна на боковинах. Эксцентрик (минификс) — штифт + стяжка Ø15, снаружи отверстий нет, плюс шкант для точности. Шкант — только шканты Ø8 (на клей).' },
      { k: 'topType', l: 'Крышка', seg: [['inset', 'Между боковинами'], ['overlay', 'Накладная']], hint: 'Между боковинами — крышка встаёт между боковин, торцы боковин не видны сверху. Накладная — лежит сверху и может выступать (свес).' },
      { k: 'topOverhang', l: 'Свес крышки', min: 0, max: 50, step: 1, u: 'мм', when: () => P.topType === 'overlay', hint: 'На сколько крышка выступает вперёд и в стороны.' },
      { k: 'base', l: 'Основание', seg: [['plinth', 'Цоколь'], ['legs', 'Ножки'], ['none', 'Нет']], frame: 1, scale: 1, hint: 'Цоколь — рама из ЛДСП под корпусом (отступ 50 мм от фасада). Ножки — регулируемые опоры. Нет — корпус стоит прямо на полу.' },
      { k: 'plinth', l: 'Высота основания', min: 40, max: 200, step: 5, u: 'мм', when: () => P.base !== 'none', scale: 1, hint: 'Высота цоколя или ножек. Чем выше основание, тем меньше внутренняя высота.' },
      { k: 'backType', l: 'Задняя стенка', seg: [['groove', 'ХДФ в паз'], ['overlay', 'ХДФ накладная'], ['none', 'Нет']], hint: 'ХДФ в паз — стенка утоплена в паз, аккуратнее. Накладная — прибивается сзади. Нет — без задней стенки.' },
      { k: 'cornice', l: 'Карниз', tog: 1, when: () => r.cornice, hint: 'Декоративная планка поверх крышки шкафа.' },
      { k: 'shelfSetback', l: 'Отступ полок от фасада', min: 0, max: 60, step: 1, u: 'мм', when: hasShelves, hint: 'На сколько полки не доходят до переднего края. Нужен, чтобы полка не задевала петли и закрытую дверь.' },
      { k: 'hatShelf', l: 'Шляпная полка (для шаблонов)', min: 150, max: 600, step: 10, u: 'мм', when: () => r.items.includes('rod'), hint: 'Высота зоны над штангой. Используется шаблонами «Штанга…» при заполнении секции.' },
    ]],
    ['Двери и фасады', [
      { k: 'doorType', l: 'Система дверей', seg: [['hinged', 'Распашные / по секциям'], ['sliding', 'Купе']], when: () => r.sliding, rebuild: 1, hint: 'Распашные — у каждой секции своя дверь. Купе — общие раздвижные полотна на весь шкаф; ящики за ними открываются только если полотно сдвинуто.' },
      { k: 'slidingDoors', l: 'Полотен купе', min: 2, max: 5, step: 1, when: () => P.doorType === 'sliding', hint: 'Количество раздвижных полотен. Они чередуются по двум направляющим.' },
      { k: 'slidingStyle', l: 'Заполнение купе', seg: STYLES, when: () => P.doorType === 'sliding', hint: 'Что вставлено в профиль полотна: ЛДСП, зеркало или стекло.' },
      { k: 'frontT', l: 'Толщина фасада', seg: [[16, '16'], [19, '19'], [22, '22']], hint: 'Толщина фасадов дверей и ящиков.' },
      { k: 'handle', l: 'Ручки', seg: [['bar', 'Скоба'], ['knob', 'Кнопка'], ['profile', 'Профиль'], ['none', 'Нет / Push']], when: hasMoving, hint: 'Профиль — накладная планка, не длиннее фасада. Нет / Push — открывание нажатием. На ящиках за дверью и за купе ручек нет: там делается выемка под пальцы.' },
      { k: 'handleSize', l: 'Межосевое ручки', seg: [[96, '96'], [128, '128'], [160, '160'], [192, '192'], [256, '256']], when: () => hasMoving() && P.handle === 'bar', hint: 'Расстояние между центрами крепёжных отверстий скобы.' },
      { k: 'handleOrient', l: 'Ручки на дверях', seg: [['v', 'Вертикально'], ['h', 'Горизонтально']], when: () => hasHingedDoors() && P.handle !== 'none' && P.handle !== 'knob', hint: 'Направление скобы или профиля на распашных дверях. На ящиках ручки всегда горизонтальные.' },
    ], hasMoving],
    ['Фурнитура', [
      { k: 'slide', l: 'Направляющие ящиков', seg: [['ball', 'Шариковые'], ['ballSoft', 'С доводчиком'], ['hidden', 'Скрытые'], ['roller', 'Роликовые']], when: hasDrawers, hint: 'Скрытые полного выдвижения: короб уже на 42 мм, ход 100%. Роликовые: проще и дешевле, ход 75%. С доводчиком: плавное закрывание.' },
      { k: 'hinge', l: 'Петли', seg: [['soft', '110° с доводчиком'], ['plain', '110° без'], ['wide', '165°']], when: hasHingedDoors, hint: '165° открывают дверь почти до боковины; соседняя дверь может мешать, предупреждения покажут.' },
      { k: 'push', l: 'Push-to-open', tog: 1, when: () => P.handle === 'none' && hasMoving(), hint: 'Открывание нажатием: на двери ставится толкатель, ящики идут на направляющих push-to-open; петли без доводчика.' },
      { k: 'wallFix', l: 'Крепление к стене', tog: 1, hint: 'Анкерные уголки сзади под крышкой: высокое изделие не опрокинется.' },
      ...fittingRows(),
    ]],
    ['Вырезы', [{ custom: cutoutsEditor }]],
    ['Кромка', [
      { k: 'edgeFront', l: 'Лицевые торцы', seg: [[0.4, '0,4'], [1, '1'], [2, '2']], hint: 'Толщина кромки ПВХ на видимых торцах. Кромка 1 мм и толще вычитается из пильного размера.' },
      { k: 'edgeHidden', l: 'Скрытые торцы', seg: [[0, 'Нет'], [0.4, '0,4'], [1, '1']], hint: 'Кромка на торцах, которых не видно.' },
    ]],
    ['Цвета', [
      { k: 'bodyColor', l: 'Корпус', sw: woods() },
      { k: 'frontColor', l: 'Фасады', sw: woods(), when: hasMoving },
      { k: 'metalColor', l: 'Фурнитура', sw: METAL },
    ]],
  ];
};
const viewDefs = () => [
  // параметры вида в историю не попадают (nohist)
  { nohist: 1, k: 'open', l: 'Открыть двери и ящики', min: 0, max: 1, step: 0.01, fmt: v => Math.round(v * 100) + '%', when: hasMoving, hint: 'Всё открывается одновременно и останавливается там, где деталь во что-то упирается. Что именно мешает, написано в предупреждениях.' },
  { nohist: 1, k: 'hideDoors', l: 'Скрыть двери', tog: 1, when: hasDoors, hint: 'Убирает двери и купе, чтобы увидеть наполнение.' },
  { nohist: 1, k: 'showHoles', l: 'Показать присадку (отверстия)', tog: 1, hint: 'Цветные маркеры отверстий: Ø35 — чашки петель, Ø7 и Ø5 — конфирматы и полкодержатели.' },
];
function onGlobal(c, live, old) {
  if (['push', 'handle', 'hinge', 'slide'].includes(c.k)) { normalize(P); drawGlobal(); }
  if (c.scale && P.fit && old !== undefined) fitSections(P, innerH({ ...P, [c.k]: old }), innerH(P), P.fitMode);
  render(!live && (c.frame || c.k === 'cornice'));
  if (c.rebuild || c.scale) drawSections();
}

// ── sections + item editor
const ITEM_TYPES = [['shelf', 'Полка съёмная'], ['fixed', 'Полка стационарная'], ['glass', 'Полка стекло'], ['rod', 'Штанга'], ['drawer', 'Ящик'], ['idrawer', 'Ящик встроенный']];
const DOORS = [['none', 'Нет'], ['left', 'Левая'], ['right', 'Правая'], ['double', 'Двойная'], ['flapDown', 'Откидная ↓'], ['flapUp', 'Подъёмная ↑']];
const AF = { mode: 'even', n: 0, step: 350, zone: 0, s32: true, all: false };
const AF_MODES = [['even', 'Полки равномерно', 'shelf'], ['step', 'Полки с шагом', 'shelf'], ['dEq', 'Ящики равные', 'drawer'], ['dGr', 'Ящики нарастающие', 'drawer'], ['pack', 'Уложить ящики', 'drawer'], ['redist', 'Распределить имеющиеся', 'any']];
const AF_HINT = {
  even: 'Заменяет съёмные полки на заданное количество, равномерно по свободной высоте. Ящики, стационарные полки и зона одежды под штангой остаются на месте.',
  step: 'Заполняет все свободные промежутки полками с заданным просветом между ними.',
  dEq: 'Заменяет ящики на стопку одинаковых ящиков от дна секции до заданной высоты.',
  dGr: 'Стопка ящиков, где нижние выше верхних (как в комоде). Сумма высот равна заданной зоне.',
  pack: 'Сдвигает ящики вниз без зазоров, не меняя их высоту.',
  redist: 'Не меняет количество: полки раскладываются поровну в свободных промежутках, ящики выравниваются по высоте в одну стопку.',
};

// small vertical diagram of what is inside the section
function scheme(s, H) {
  const NS = 'http://www.w3.org/2000/svg', W = 62, Hh = 176, k = (Hh - 4) / H, t = P.thickness;
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('width', W); svg.setAttribute('height', Hh); svg.classList.add('schm');
  const add = (tag, a) => { const e = document.createElementNS(NS, tag); for (const n in a) e.setAttribute(n, a[n]); svg.append(e); return e; };
  add('rect', { x: 1, y: 1, width: W - 2, height: Hh - 2, fill: '#fff', stroke: '#c9c3b6' });
  const Y = (y, h) => Hh - 2 - (y + h) * k;
  for (const it of s.items) {
    if (it.type === 'rod') add('line', { x1: 4, x2: W - 4, y1: Y(it.y, 0), y2: Y(it.y, 0), stroke: '#8c9096', 'stroke-width': 3, 'stroke-linecap': 'round' });
    else if (isDrawer(it.type)) add('rect', { x: 4, y: Y(it.y, it.h) + 0.5, width: W - 8, height: Math.max(2, it.h * k - 1), fill: it.type === 'idrawer' ? '#efe7d6' : '#d9c4a0', stroke: '#8a6f4c', 'stroke-dasharray': it.type === 'idrawer' ? '3 2' : '' });
    else add('rect', { x: 3, y: Y(it.y, t), width: W - 6, height: Math.max(2, (it.type === 'glass' ? 6 : t) * k), fill: it.type === 'glass' ? '#a9cbd6' : it.type === 'fixed' ? '#6e4b33' : '#9b7b55' });
  }
  if (s.zone) { // зона деления: полка-граница, полуперегородка и полки колонок
    const z = s.zone, y0 = z.pos === 'top' ? H - z.h : 0, kx = (W - 6) / s.width, xd = 3 + z.split * kx;
    add('rect', { x: 3, y: Y(z.pos === 'top' ? y0 - t : z.h, t), width: W - 6, height: Math.max(2, t * k), fill: '#6e4b33' });
    add('rect', { x: xd, y: Y(y0, z.h), width: Math.max(2, t * kx), height: z.h * k, fill: '#8a6f4c' });
    for (const [list, xa, xb] of [[z.left, 3, xd], [z.right, xd + Math.max(2, t * kx), W - 3]]) for (const it of list) add('rect', { x: xa, y: Y(y0 + it.y, t), width: xb - xa, height: Math.max(2, t * k), fill: it.type === 'glass' ? '#a9cbd6' : '#9b7b55' });
  }
  if (hinged() && s.door !== 'none') {
    const a = { stroke: '#d4672a', 'stroke-width': 2, fill: 'none' };
    if (s.door === 'left' || s.door === 'double') add('line', { ...a, x1: 1.5, x2: 1.5, y1: 3, y2: Hh - 3 });
    if (s.door === 'right' || s.door === 'double') add('line', { ...a, x1: W - 1.5, x2: W - 1.5, y1: 3, y2: Hh - 3 });
    if (s.door === 'flapDown') add('line', { ...a, x1: 3, x2: W - 3, y1: Hh - 2, y2: Hh - 2 });
    if (s.door === 'flapUp') add('line', { ...a, x1: 3, x2: W - 3, y1: 2, y2: 2 });
  }
  svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Схема наполнения секции');
  const ti = document.createElementNS(NS, 'title'); ti.textContent = 'Схема секции: полки, штанги и ящики по высоте (пунктир — встроенные ящики за дверью, оранжевая линия — дверь)'; svg.prepend(ti);
  return svg;
}
function sectionSummary(s) {
  const c = t => s.items.filter(i => i.type === t).length, parts = [`${s.width} мм`];
  if (hinged()) parts.push({ none: 'без двери', left: 'дверь левая', right: 'дверь правая', double: 'двойная дверь', flapDown: 'откидная дверь', flapUp: 'подъёмная дверь' }[s.door]);
  const sh = c('shelf') + c('glass') + c('fixed'); if (sh) parts.push(`полок: ${sh}`);
  if (c('rod')) parts.push(`штанг: ${c('rod')}`);
  if (c('drawer')) parts.push(`ящиков: ${c('drawer')}`);
  if (s.zone) parts.push(`зона ${s.zone.pos === 'top' ? 'вверху' : 'внизу'} ${s.zone.h} мм`);
  if (c('idrawer')) parts.push(`встроенных: ${c('idrawer')}`);
  return parts.join(' · ');
}

// деление секции по высоте: внизу или вверху зона с полуперегородкой и двумя колонками со своими полками
function zoneControls(card, s, H) {
  const t = P.thickness;
  const setZone = v => {
    if (v === 'none') { s.zone = null; return; }
    if (s.zone) { s.zone.pos = v; return; }
    s.zone = { pos: v, h: clamp(Math.round((H * 0.3) / 10) * 10, 200, Math.max(200, H - 250)), split: Math.round((s.width - t) / 20) * 10, left: [], right: [] };
  };
  const chz = (c, live) => { if (!live) drawSections(); render(false); };
  card.append(control({ k: 'zpos', l: 'Деление по высоте', seg: [['none', 'Нет'], ['bottom', 'Внизу'], ['top', 'Вверху']], hint: 'Зона делится вертикальной полуперегородкой на две колонки со своими полками (обувь, бельё, стопки). Зона отделена от основной части секции стационарной полкой; элементы основной части, попавшие в зону, удаляются.' },
    { get zpos() { return s.zone ? s.zone.pos : 'none'; }, set zpos(v) { setZone(v); } }, chz));
  if (!s.zone) return;
  const z = s.zone;
  card.append(control({ k: 'h', l: 'Высота зоны', min: 150, max: Math.max(150, H - 250), step: 10, u: 'мм', hint: 'Свободная высота зоны от дна секции (или до крышки) до стационарной полки-границы.' }, z, chz));
  card.append(control({ k: 'split', l: 'Ширина левой колонки', min: 100, max: Math.max(100, s.width - t - 100), step: 10, u: 'мм', hint: 'Внутренняя ширина левой колонки; правая получается за вычетом толщины полуперегородки.' }, z, chz));
  for (const [k, title] of [['left', 'Левая колонка'], ['right', 'Правая колонка']]) {
    const list = z[k], virt = { get items() { return z[k]; }, set items(v) { z[k] = v; } };
    card.append(el('div', 'sub', `${title}: полок ${list.length}`));
    const rows = el('div', 'items');
    [...list].sort((a, b) => b.y - a.y).forEach(it => {
      const rw = el('div', 'item');
      const ty = el('select'); [['shelf', 'Полка съёмная'], ['fixed', 'Полка стационарная'], ['glass', 'Полка стекло']].forEach(([v, l]) => ty.append(new Option(l, v, false, it.type === v)));
      ty.onchange = act(() => { it.type = ty.value; drawSections(); render(false); });
      const y = Object.assign(el('input'), { type: 'number', value: it.y, step: 10, min: 0, max: z.h, title: 'Высота от низа зоны, мм' });
      y.onchange = act(() => { it.y = +y.value; drawSections(); render(false); });
      const del = el('button', 'x', '✕'); del.title = 'Удалить полку'; del.onclick = act(() => { list.splice(list.indexOf(it), 1); drawSections(); render(false); });
      rw.append(ty, y, el('span'), del); rows.append(rw);
    });
    card.append(rows);
    const acts = el('div', 'acts');
    const b1 = el('button', '', '+ Полка'); b1.title = 'Добавить полку и разложить все полки колонки равномерно'; b1.onclick = act(() => { autoShelves(virt, z.h, t, { n: list.length + 1, s32: false }); drawSections(); render(false); });
    const b2 = el('button', '', 'Равномерно'); b2.disabled = !list.length; b2.title = 'Разложить имеющиеся полки поровну по высоте зоны'; b2.onclick = act(() => { autoShelves(virt, z.h, t, { n: list.length, s32: false }); drawSections(); render(false); });
    acts.append(b1, b2); card.append(acts);
  }
}

function drawSections() {
  const r = R(), box = document.getElementById('secs'); box.innerHTML = '';
  const strip = el('div', 'strip');
  P.sections.forEach((s, i) => {
    const b = el('button', i === sel ? 'on' : ''); b.style.flex = s.width + ' 1 0'; b.title = 'Выбрать секцию ' + (i + 1);
    b.innerHTML = `${i + 1}<span>${s.width}</span>`; b.onclick = () => select(i); strip.append(b);
  });
  box.append(strip);
  const acts = el('div', 'acts');
  const action = (label, fn, dis, title) => { const b = el('button', '', label); b.disabled = !!dis; b.title = title; b.onclick = act(fn); acts.append(b); };
  const clone = o => JSON.parse(JSON.stringify(o));
  const full = P.sections.length >= r.maxSec;
  action('+ Секция', () => { const s = clone(P.sections[sel]); s.items = fillItems(r.fills[0], P); P.sections.splice(sel + 1, 0, s); sel++; drawSections(); render(true); }, full, full ? `Для этого типа не больше ${r.maxSec} секций` : 'Добавить секцию справа от выбранной (с первым шаблоном наполнения)');
  action('Копия', () => { P.sections.splice(sel + 1, 0, clone(P.sections[sel])); sel++; drawSections(); render(true); }, full, 'Скопировать выбранную секцию вместе с наполнением');
  action('←', () => { const a = P.sections; [a[sel - 1], a[sel]] = [a[sel], a[sel - 1]]; sel--; drawSections(); render(false); }, sel === 0, 'Сдвинуть секцию влево');
  action('→', () => { const a = P.sections; [a[sel + 1], a[sel]] = [a[sel], a[sel + 1]]; sel++; drawSections(); render(false); }, sel === P.sections.length - 1, 'Сдвинуть секцию вправо');
  action('Удалить', () => { P.sections.splice(sel, 1); sel = Math.max(0, sel - 1); drawSections(); render(true); }, P.sections.length <= 1, 'Удалить выбранную секцию');
  box.append(acts);

  const s = P.sections[sel], card = el('div', 'card'), H = innerH(P);
  const hasD = () => s.items.some(i => i.type === 'drawer');
  card.append(el('h3', '', `Секция ${sel + 1}`));
  card.append(el('div', 'sumline', sectionSummary(s)));
  const ch = (c, live) => { if (c.k === 'width' && live) { const lb = strip.children[sel]; lb.style.flex = s.width + ' 1 0'; lb.querySelector('span').textContent = s.width; } else drawSections(); render(!live && c.k === 'width'); };
  card.append(control({ k: 'width', l: 'Ширина (внутренняя)', min: r.secW[0], max: r.secW[1], step: 10, u: 'мм', hint: `Ширина между стенками секции, ${r.secW[0]}–${r.secW[1]} мм для этого типа. Общая ширина изделия = сумма секций + толщины стенок.` }, s, ch));
  card.append(control({ k: 'width', l: '', hint: 'Типовые ширины', seg: [400, 450, 500, 600, 800, 1000].filter(v => v >= r.secW[0] && v <= r.secW[1]).map(v => [v, String(v)]) }, s, ch));
  card.append(control({ k: 'door', l: 'Дверь', seg: DOORS.filter(([k]) => r.doors.includes(k) || k === 'none'), when: () => hinged() && r.doors.length > 0, hint: 'Распашная дверь на петлях. Откидная ↓ открывается вниз, подъёмная ↑ — вверх на газлифтах. Для купе двери общие и задаются в «Двери и фасады».' }, s, ch));
  card.append(control({ k: 'frontStyle', l: 'Фасад', seg: STYLES, when: () => hinged() && s.door !== 'none', hint: 'Гладкий — сплошная плита; Рамочный — фрезеровка «рамка»; Зеркало и Стекло — вставка в раму.' }, s, ch));
  const behind = s.door !== 'none';
  card.append(control({ k: 'drawerFronts', l: 'Фасады ящиков', seg: [['inset', behind ? 'За дверью' : 'В проёме'], ['overlay', behind ? 'Накладные, дверь выше' : 'Накладные']], when: () => hinged() && hasD() && s.door !== 'flapDown' && s.door !== 'flapUp', hint: 'В проёме — фасад ящика вровень с корпусом (если есть дверь, ящики спрятаны за ней). Накладные — фасады закрывают торцы корпуса и сами служат лицом секции; дверь начинается выше ящиков. Встроенные ящики всегда за дверью.' }, s, ch));
  const mz = control({ k: 'mezz', l: 'Антресоль (отдельная дверь сверху)', tog: 1, when: () => r.mezz && hinged(), hint: 'Верхняя часть секции получает свою дверь и стационарную полку-разделитель.' }, { get mezz() { return s.split > 0; }, set mezz(v) { s.split = v ? 450 : 0; } }, ch);
  card.append(mz);
  card.append(control({ k: 'split', l: 'Высота антресоли', min: 250, max: Math.max(250, H - 300), step: 10, u: 'мм', when: () => r.mezz && hinged() && s.split > 0, hint: 'Высота верхней зоны с отдельной дверью.' }, s, ch));

  if (r.zone) zoneControls(card, s, H);

  const row = el('div', 'secrow'); row.append(scheme(s, H));
  const col = el('div', 'fillcol'); col.append(el('div', 'sub', 'Наполнение'));
  const fills = el('div', 'seg small');
  r.fills.forEach(k => {
    const b = el('button', '', FILL_LABELS[k]);
    b.title = k === 'idrawers' ? 'Два ящика, спрятанных за дверью секции, и полки над ними. Если двери нет — она будет добавлена.' : 'Заменить всё содержимое секции этим шаблоном';
    b.onclick = act(() => {
      s.items = fillItems(k, P);
      if (k === 'idrawers' && hinged() && s.door === 'none' && r.doors.includes('left')) s.door = s.width >= 600 && r.doors.includes('double') ? 'double' : 'left';
      drawSections(); render(false);
    });
    fills.append(b);
  });
  col.append(fills); col.append(el('div', 'hint2', 'Шаблон заменяет содержимое секции. Ошибку можно отменить кнопкой «Отменить» вверху.'));
  row.append(col); card.append(row);

  // item list with column headers
  card.append(el('div', 'sub', `Элементы (внутр. высота секции ${H} мм)`));
  const head = el('div', 'ihead'); ['Элемент', 'от дна, мм', 'высота, мм', ''].forEach(x => head.append(el('span', '', x))); head.title = 'Высота каждого элемента отсчитывается от дна секции. Высота нужна только ящикам (это высота фасада).';
  const list = el('div', 'items');
  [...s.items].sort((a, b) => b.y - a.y).forEach(it => {
    const rw = el('div', 'item');
    const t = el('select'); ITEM_TYPES.filter(([k]) => r.items.includes(k)).forEach(([k, l]) => t.append(new Option(l, k, false, it.type === k)));
    t.title = it.type === 'idrawer' ? 'Встроенный ящик спрятан за дверью секции: ручки нет, сначала открывается дверь' : 'Тип элемента';
    t.onchange = act(() => {
      it.type = t.value; if (isDrawer(it.type) && !it.h) it.h = 180;
      if (it.type === 'idrawer' && hinged() && s.door === 'none' && r.doors.includes('left')) s.door = 'left';
      drawSections(); render(false);
    });
    const y = Object.assign(el('input'), { type: 'number', value: it.y, step: 10, min: 0, max: H, title: 'Высота от дна секции, мм' });
    y.onchange = act(() => { it.y = +y.value; drawSections(); render(false); });
    rw.append(t, y);
    if (isDrawer(it.type)) {
      const h = Object.assign(el('input'), { type: 'number', value: it.h, step: 10, min: MIN_DRAWER_H, max: 500, title: 'Высота фасада ящика, мм' });
      h.onchange = act(() => { it.h = +h.value; drawSections(); render(false); });
      rw.append(h);
    } else rw.append(el('span'));
    const del = el('button', 'x', '✕'); del.title = 'Удалить элемент'; del.onclick = act(() => { s.items.splice(s.items.indexOf(it), 1); drawSections(); render(false); });
    rw.append(del); list.append(rw);
  });
  if (s.items.length) card.append(head);
  if (!s.items.length) list.append(el('div', 'hint', 'Секция пустая — добавьте элементы или выберите шаблон.'));
  card.append(list);

  const add = el('div', 'acts');
  const freeY = h => { const occ = s.items.map(i => [i.y, i.y + (isDrawer(i.type) ? i.h : 20)]).sort((a, b) => a[0] - b[0]); let best = [0, H], prev = 0; for (const [a, b] of [...occ, [H, H]]) { if (a - prev > best[1] - best[0] || best === null) best = [prev, a]; prev = Math.max(prev, b); } return Math.round((best[0] + best[1] - h) / 2); };
  const addIt = type => {
    const top = Math.max(0, ...s.items.filter(i => isDrawer(i.type)).map(i => i.y + i.h));
    s.items.push(isDrawer(type) ? { type, y: top, h: 180 } : { type, y: freeY(type === 'rod' ? 0 : P.thickness) });
    if (type === 'idrawer' && hinged() && s.door === 'none' && r.doors.includes('left')) s.door = 'left';
    drawSections(); render(false);
  };
  [['+ Полка', 'shelf', 'Добавить съёмную полку в самое свободное место'], ['+ Штанга', 'rod', 'Добавить штангу для одежды'], ['+ Ящик', 'drawer', 'Добавить ящик над уже стоящими'], ['+ Встроенный', 'idrawer', 'Добавить ящик, спрятанный за дверью секции (дверь добавится, если её нет)']].filter(([, k]) => r.items.includes(k)).forEach(([l, k, ti]) => { const b = el('button', '', l); b.title = ti; b.onclick = act(() => addIt(k)); add.append(b); });
  card.append(add);

  // auto-fill: evenly spread shelves, shelves at a pitch, stacks of drawers, spread what is already there
  const modes = AF_MODES.filter(([, , need]) => need === 'any' || r.items.includes(need));
  if (modes.length) {
    if (!modes.some(m => m[0] === AF.mode)) AF.mode = modes[0][0];
    if (!AF.n) AF.n = Math.max(1, Math.round(H / 350) - 1);
    if (!AF.zone || AF.zone > H) AF.zone = Math.min(H, r.rod || r.sliding ? 720 : H);
    card.append(el('div', 'sub', 'Автозаполнение и выравнивание'));
    const af = c => control(c, AF, () => {});
    card.append(control({ k: 'mode', l: '', seg: modes.map(m => [m[0], m[1]]), hint: AF_HINT[AF.mode] }, AF, () => drawSections()));
    card.append(el('div', 'hint2', AF_HINT[AF.mode]));
    const shelfMode = AF.mode === 'even' || AF.mode === 'step' || AF.mode === 'redist', dMode = AF.mode === 'dEq' || AF.mode === 'dGr';
    if (AF.mode === 'even') card.append(af({ k: 'n', l: 'Количество полок', min: 1, max: 12, step: 1, hint: 'Сколько съёмных полок должно быть в секции.' }));
    if (AF.mode === 'step') card.append(af({ k: 'step', l: 'Шаг между полками (просвет)', min: 150, max: 600, step: 10, u: 'мм', hint: 'Свободная высота между соседними полками.' }));
    if (dMode) { card.append(af({ k: 'n', l: 'Количество ящиков', min: 1, max: 10, step: 1, hint: `Сколько ящиков в стопке. Высота ограничена ${MIN_DRAWER_H}–500 мм на ящик.` })); card.append(af({ k: 'zone', l: 'Высота зоны ящиков (снизу)', min: 160, max: H, step: 10, u: 'мм', hint: 'До какой высоты от дна секции тянется стопка ящиков.' })); }
    if (shelfMode) card.append(af({ k: 's32', l: 'Система 32 (высоты кратны 32 мм)', tog: 1, hint: 'Высоты полок привязываются к шагу 32 мм, чтобы отверстия полкодержателей ложились в общий ряд.' }));
    card.append(af({ k: 'all', l: 'Ко всем секциям', tog: 1, hint: 'Применить к каждой секции изделия, а не только к выбранной.' }));
    const acts2 = el('div', 'acts');
    const go = el('button', 'pri', AF.mode === 'redist' ? 'Распределить' : 'Заполнить'); go.title = 'Применить. Действие можно отменить кнопкой «Отменить» вверху.';
    go.onclick = act(() => {
      const t = P.thickness;
      for (const x of AF.all ? P.sections : [s]) {
        const glassOnly = x.items.some(i => i.type === 'glass') && !x.items.some(i => i.type === 'shelf');
        const type = glassOnly && r.items.includes('glass') ? 'glass' : 'shelf';
        if (AF.mode === 'even') autoShelves(x, H, t, { n: AF.n, type, s32: AF.s32 });
        else if (AF.mode === 'step') stepShelves(x, H, t, { step: AF.step, type, s32: AF.s32 });
        else if (AF.mode === 'dEq') autoDrawers(x, H, t, { n: AF.n, zone: AF.zone });
        else if (AF.mode === 'dGr') autoDrawers(x, H, t, { n: AF.n, zone: AF.zone, graded: true });
        else if (AF.mode === 'redist') redistribute(x, H, t, { s32: AF.s32 });
        else packDrawers(x);
      }
      drawSections(); render(false);
    });
    acts2.append(go); card.append(acts2);
  }
  const acts3 = el('div', 'acts');
  const all = el('button', '', 'Скопировать секцию во все'); all.title = 'Перенести наполнение, стиль фасада, антресоль и режим фасадов ящиков выбранной секции во все остальные';
  all.onclick = act(() => { P.sections.forEach((x, i) => { if (i !== sel) { x.items = JSON.parse(JSON.stringify(s.items)); x.frontStyle = s.frontStyle; x.split = s.split; x.drawerFronts = s.drawerFronts; } }); drawSections(); render(false); });
  acts3.append(all); card.append(acts3);
  box.append(card);
  box.querySelectorAll('[data-when]').forEach(e => (e.style.display = e._when() ? '' : 'none'));
}
function select(i) { sel = i; drawSections(); highlight(); }

function drawGlobal() {
  const ctl = document.getElementById('controls');
  const was = new Map([...ctl.querySelectorAll('details')].map(d => [d.querySelector('summary').textContent, d.open]));
  ctl.innerHTML = '';
  for (const [title, rows, groupWhen] of globalDefs()) {
    const d = el('details'); d.open = was.has(title) ? was.get(title) : title === 'Корпус';
    if (groupWhen) { d.dataset.when = 1; d._when = groupWhen; }
    d.append(el('summary', '', title));
    rows.forEach(c => d.append(c.custom ? c.custom() : control(c, c.obj === 'fittings' ? (P.fittings || (P.fittings = {})) : P, onGlobal)));
    ctl.append(d);
  }
  const v = document.getElementById('view'); v.innerHTML = '';
  viewDefs().forEach(c => v.append(control(c, root, () => render(false))));
  v.append(control({ k: 'on', l: 'Размеры', tog: 1, nohist: 1, hint: 'Габариты, ширины секций и просветы между полками выбранной секции. Нажмите на число, чтобы ввести новый размер.' }, dimPrefs, () => { try { localStorage.setItem('mebel-dims', dimPrefs.on ? '1' : '0'); } catch { /* без сохранения */ } buildDims(); }));
  v.append(asmBox); drawAsmBar();
}

// ── модули проекта: несколько корпусов в одном проекте
const modsBox = document.getElementById('mods');
const keepColorsOf = () => ({ bodyColor: P.bodyColor, bodyName: P.bodyName, frontColor: P.frontColor, frontName: P.frontName, metalColor: P.metalColor });
function afterModuleChange(frame = true) {
  active = Math.max(0, Math.min(active, moduleCount(root) - 1)); P = cabinetOf(root, active);
  sel = 0; selPartKey = null; kinKey = '';
  drawAll(); render(frame);
}
function setActive(i) { if (i === active) return; active = i; afterModuleChange(false); }
function resetActive() {
  const fresh = makePreset(P.type, keepColorsOf());
  if (active === 0) {
    const { modules, modName, modY, open, hideDoors, showHoles, asmStep } = root;
    for (const k of Object.keys(root)) delete root[k];
    Object.assign(root, fresh, { open, hideDoors, showHoles, asmStep });
    if (modules) root.modules = modules; if (modName) root.modName = modName; if (modY) root.modY = modY;
  } else root.modules[active - 1].P = fresh;
  P = cabinetOf(root, active);
}
async function askAddModule() {
  let type = 'wardrobe';
  const body = el('div', 'dbody'), types = el('div', 'ptypes');
  TYPES.forEach(([k, l]) => {
    const b = el('button', 'ptype' + (k === type ? ' on' : '')); b.append(el('b', '', l), el('span', '', TYPE_INFO[k]));
    b.onclick = () => { type = k; types.querySelectorAll('.ptype').forEach(x => x.classList.toggle('on', x === b)); };
    types.append(b);
  });
  body.append(el('p', 'hint2', 'Новый корпус встанет справа от выбранного. Цвета возьмутся из текущего корпуса.'), types);
  if (!(await modal('Добавить модуль', body, { ok: 'Добавить' }))) return;
  act(() => { const i = addModule(root, makePreset(type, keepColorsOf()), { name: typeLabel(type), after: active }); if (i >= 0) active = i; })();
  afterModuleChange(true);
}
function drawModules() {
  modsBox.textContent = '';
  const list = moduleList(root), multi = list.length > 1;
  const strip = el('div', 'modstrip');
  list.forEach(m => {
    const c = cabinetOf(root, m.i), b = el('button', 'modchip' + (m.i === active ? ' on' : ''), m.name);
    b.title = `${typeLabel(c.type)}: ${c.height} × ${c.depth} мм`; b.onclick = () => setActive(m.i);
    strip.append(b);
  });
  const add = el('button', 'modchip add', '+ Модуль'); add.title = moduleCount(root) >= 12 ? 'Не больше 12 модулей' : 'Добавить корпус справа от выбранного: кухня, гарнитур, стенка из нескольких шкафов';
  add.disabled = moduleCount(root) >= 12; add.onclick = askAddModule; strip.append(add);
  modsBox.append(strip);
  if (!multi) return;
  const cur = list[active], card = el('div', 'modcard');
  const field = (label, value, min, max, apply, hint) => {
    const lab = el('label', '', label), inp = Object.assign(el('input'), { type: 'number', value, min, max, step: 1 });
    if (hint) lab.title = hint;
    inp.onchange = () => { const v = Math.round(+inp.value); if (!Number.isFinite(v) || inp.value === '') { inp.value = value; return; } act(() => apply(Math.max(min, Math.min(max, v))))(); drawModules(); render(true); };
    lab.append(inp); return lab;
  };
  const name = Object.assign(el('input', 'modname'), { type: 'text', value: cur.name, maxLength: 40, ariaLabel: 'Название модуля' });
  name.onchange = () => { const v = name.value.trim(); if (!v) { name.value = cur.name; return; } act(() => setModuleProps(root, active, { name: v }))(); drawModules(); };
  const row1 = el('div', 'modrow'); row1.append(name);
  const row2 = el('div', 'modrow');
  if (active > 0) row2.append(field('Зазор слева, мм', cur.gap, 0, 2000, v => setModuleProps(root, active, { gap: v }), 'Расстояние до предыдущего модуля'));
  row2.append(field('Подъём над полом, мм', cur.y, 0, 3000, v => setModuleProps(root, active, { y: v }), 'Для навесных корпусов'));
  const acts = el('div', 'modrow acts');
  const btn = (t, title, fn, dis) => { const b = el('button', '', t); b.title = title; b.disabled = !!dis; b.onclick = fn; acts.append(b); };
  const moved = dir => { act(() => { active = moveModule(root, active, dir); })(); afterModuleChange(false); };
  btn('←', 'Сдвинуть модуль влево', () => moved(-1), active === 0);
  btn('→', 'Сдвинуть модуль вправо', () => moved(1), active === list.length - 1);
  btn('Копия', 'Дублировать модуль', () => { act(() => { const i = duplicateModule(root, active); if (i >= 0) active = i; })(); afterModuleChange(true); }, moduleCount(root) >= 12);
  btn('Удалить', 'Убрать модуль из проекта', () => { act(() => { removeModule(root, active); })(); afterModuleChange(true); });
  card.append(row1, row2, acts); modsBox.append(card);
}

// ── пошаговая сборка в 3D: степпер на плашке «Вид»
const asmBox = el('div', 'asmbox');
function drawAsmBar() {
  asmBox.innerHTML = '';
  if (!root.asmStep) {
    const b = el('button', 'asmbtn', 'Сборка по шагам'); b.title = 'Показать, как собирается изделие: деталь за деталью, текущий шаг подсвечен';
    b.onclick = () => { root.asmStep = 1; render(false); };
    asmBox.append(b); return;
  }
  const n = asmSteps.length, s = asmSteps[root.asmStep - 1];
  if (!s) return;
  const top = el('div', 'asmrow');
  const prev = el('button', 'asmbtn', '‹'), next = el('button', 'asmbtn', '›'), off = el('button', 'asmbtn', '✕');
  prev.disabled = root.asmStep <= 1; next.disabled = root.asmStep >= n; off.title = 'Выйти из режима сборки';
  prev.onclick = () => { root.asmStep--; render(false); }; next.onclick = () => { root.asmStep++; render(false); }; off.onclick = () => { root.asmStep = 0; render(false); };
  top.append(prev, el('b', '', `Шаг ${root.asmStep} из ${n}: ${s.title}`), next, off);
  asmBox.append(top, el('div', 'asmtext', s.text.join(' ')));
}
function drawAll() { drawModules(); drawSections(); drawGlobal(); }

// ── exports
const download = (data, name, type) => { const a = el('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const stamp = () => (proj.multi ? `proekt_${moduleCount(root)}mod_${Math.round(proj.spec.meta.W)}x${Math.round(proj.spec.meta.H)}x${Math.round(proj.spec.meta.D)}` : `${P.type}_${Math.round(spec.meta.W)}x${P.height}x${P.depth}`);
// снимок 3D без рамки выбранной секции, уменьшенный до maxW (КП хранит снимок в localStorage, карточка проекта — миниатюру в IndexedDB)
function shot(maxW) {
  const c = stage._renderer.domElement, k = Math.min(1, maxW / c.width), o = document.createElement('canvas');
  o.width = Math.round(c.width * k); o.height = Math.round(c.height * k);
  if (outline) outline.visible = false;
  if (partBox) partBox.visible = false;
  stage._renderer.render(stage._scene, stage._camera);
  const g = o.getContext('2d'); g.fillStyle = '#f0eee6'; g.fillRect(0, 0, o.width, o.height);
  g.drawImage(c, 0, 0, o.width, o.height);
  if (outline) outline.visible = true;
  if (partBox) partBox.visible = true;
  return o;
}
const snapshot = () => shot(1000).toDataURL('image/jpeg', 0.82);
let thumbTimer;
const saveThumbNow = () => {
  clearTimeout(thumbTimer);
  if (placeholder || !spec || !db[cur]) return;
  const id = cur;
  try { shot(360).toBlob(b => b && putThumb(id, b).then(() => sync && sync.markThumb(id)), 'image/jpeg', 0.8); } catch { /* без миниатюры карточка покажет заглушку */ }
};
const scheduleThumb = () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(saveThumbNow, 1500); };
const openProd = hash => {
  save();
  try { localStorage.setItem('mebel-preview', snapshot()); } catch { /* снимок не поместился: КП откроется без картинки */ }
  window.open('production.html' + hash, '_blank');
};
const EXPORTS = {
  prod: () => openProd(''),
  kp: () => openProd('#kp'),
  labels: () => openProd('#labels'),
  asm: () => openProd('#asm'),
  buy: () => openProd('#buy'),
  csv: () => download(toCSV(proj.spec, proj.multi ? `Проект из ${moduleCount(root)} модулей ${Math.round(proj.spec.meta.W)} × ${Math.round(proj.spec.meta.H)} × ${Math.round(proj.spec.meta.D)} мм` : `${typeLabel(P.type)} ${Math.round(spec.meta.W)} × ${P.height} × ${P.depth} мм`), stamp() + '.csv', 'text/csv;charset=utf-8'),
  dxf: () => download(toDXF(proj.spec), stamp() + '.dxf', 'application/dxf'),
  cutcsv: () => download(toCutCSV(groupParts(proj.spec), { textured: l => isTextured(cat, l) }), stamp() + '_raskroy.csv', 'text/csv;charset=utf-8'),
  cutmap: () => download(nestMapDXF(nestFor(proj.spec)), stamp() + '_karta_raskroya.dxf', 'application/dxf'),
  drill: () => download(toDrillJSON(groupParts(proj.spec), { project: db[cur] ? db[cur].name : '', modules: moduleList(root).map(m => ({ name: m.name, type: cabinetOf(root, m.i).type })) }), stamp() + '_operacii.json', 'application/json'),
  obj: () => stage._runExport('obj'),
  glb: () => stage._runExport('glb'),
  cat: () => openCatalog(),
};
document.querySelectorAll('[data-x]').forEach(b => (b.onclick = () => { closeMenus(); EXPORTS[b.dataset.x](); }));

const rayAt = e => {
  const r = stage.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage._camera);
  return ray;
};
const pickAt = e => rayAt(e).intersectObject(model, true).find(h => h.object.userData.section !== undefined || h.object.userData.part !== undefined);
const frontY = e => {
  const m = spec.meta, k = 1 / 1000, am = proj.mods[active];
  model.updateMatrixWorld(true);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -model.localToWorld(new THREE.Vector3(0, 0, (am.z + m.D / 2) * k)).z);
  const pt = rayAt(e).ray.intersectPlane(plane, new THREE.Vector3());
  return pt ? model.worldToLocal(pt).y / k - am.y : null;
};
let drag = null;
const dragItem = d => P.sections[d.sec].items[d.i];
const shelfOpts = alt => ({ t: P.thickness, ih: spec.meta.ih, step: alt ? 0 : 32 });
stage.addEventListener('pointerdown', e => {
  if (e.button !== 0 || !selPartKey) return;
  const hit = pickAt(e), p = hit && hit.object.userData.part !== undefined ? spec.parts[hit.object.userData.part] : null;
  if (!p || p.item === undefined || partIdOf(p) !== selPartKey || (hit.object.userData.mod || 0) !== active) return;
  const y0 = frontY(e);
  if (y0 === null) return;
  drag = { sec: p.sec - 1, i: p.item, y0, base: dragItem({ sec: p.sec - 1, i: p.item }).y, moved: false };
  stage._controls.enabled = false; beginEdit();
}, true);
addEventListener('pointermove', e => {
  if (!drag) return;
  const y = frontY(e); if (y === null) return;
  const it = dragItem(drag), nv = moveItem(P.sections[drag.sec], drag.i, drag.base + (y - drag.y0), shelfOpts(e.altKey));
  if (nv === it.y) return;
  it.y = nv; drag.moved = true; render(false);
});
const endDrag = () => {
  if (!drag) return;
  stage._controls.enabled = true; endEdit();
  if (drag.moved) drawSections();
  drag = null;
};
addEventListener('pointerup', endDrag);
addEventListener('pointercancel', endDrag);

let down;
stage.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY]));
stage.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const hit = pickAt(e), mi = hit ? hit.object.userData.mod || 0 : active;
  const pi = hit && hit.object.userData.part, sc = hit && hit.object.userData.section;
  if (mi !== active) { active = mi; P = cabinetOf(root, mi); sel = 0; kinKey = ''; drawAll(); render(false); }
  selPartKey = pi !== undefined && spec.parts[pi] ? partIdOf(spec.parts[pi]) : null;
  if (sc !== undefined) select(sc); else highlight();
});

// ── диалоги
const dlg = document.getElementById('dlg');
function modal(title, body, { ok = 'ОК', cancel = 'Отмена', wide = false, extra = [] } = {}) {
  return new Promise(res => {
    dlg.innerHTML = ''; dlg.classList.toggle('wide', wide);
    const foot = el('div', 'dfoot'), bok = el('button', 'pri', ok), bc = el('button', '', cancel);
    extra.forEach(b => foot.append(b));
    foot.append(el('span', 'grow'));
    if (cancel) foot.append(bc);
    foot.append(bok);
    dlg.append(el('h3', '', title), body, foot);
    let done = false;
    const fin = v => { if (done) return; done = true; if (dlg.open) dlg.close(); res(v); };
    bok.onclick = () => fin(true); bc.onclick = () => fin(false); dlg.onclose = () => fin(false);
    dlg.showModal();
  });
}
async function askText(title, value) {
  const i = Object.assign(el('input', 'dtext'), { type: 'text', value, maxLength: 60 });
  i.onkeydown = e => { if (e.key === 'Enter') dlg.querySelector('.pri').click(); };
  const body = el('div', 'dbody'); body.append(i);
  const p = modal(title, body, { ok: 'Готово' }); i.focus(); i.select();
  return (await p) ? i.value.trim() || null : null;
}
const info = (title, text) => { const b = el('div', 'dbody'); b.append(el('p', '', text)); return modal(title, b, { ok: 'Понятно', cancel: '' }); };

// ── проекты
const typeLabel = k => (TYPES.find(t => t[0] === k) || ['', ''])[1];
const TYPE_INFO = { wardrobe: 'Штанги, полки, ящики; распашные двери или купе', rack: 'Открытые полки без дверей', nightstand: 'Невысокая тумба: ящики, полки, дверь', dresser: 'Широкая стопка ящиков', tv: 'Низкая и широкая, с нишами и ящиками' };
const projDlg = document.getElementById('projDlg'), pm = document.getElementById('pm'), xm = document.getElementById('xm'), am = document.getElementById('am');
const keepColors = () => ({ bodyColor: P.bodyColor, bodyName: P.bodyName, frontColor: P.frontColor, frontName: P.frontName, metalColor: P.metalColor });
function drawHeader() {
  document.getElementById('pname').textContent = db[cur].name;
  document.getElementById('tbadge').textContent = typeLabel(P.type);
}
/** Закрыть меню шапки и меню карточек. */
function closeMenus() { [pm, xm, am, ...projDlg.querySelectorAll('.menu')].forEach(m => (m.hidden = true)); }
const toggleMenu = (m, e) => { e.stopPropagation(); const was = m.hidden; closeMenus(); m.hidden = !was; };
addEventListener('click', e => { if (![pm, xm, am].some(m => m.contains(e.target)) && !e.target.closest('.dots')) closeMenus(); });
document.getElementById('pmenu').onclick = e => toggleMenu(pm, e);
document.getElementById('xmenu').onclick = e => toggleMenu(xm, e);

/** skipSave: текущий проект уже удалён, сохранять его параметры нельзя. */
function openProject(id, skipSave) {
  if (!skipSave) { saveThumbNow(); save(); }
  cur = id; if (!placeholder) saveProjects(db, cur);
  root = normalize(db[id].P); root.asmStep = 0; active = 0; P = root; selPartKey = null; hist.length = 0; redoSt.length = 0; editing = null; sel = 0; kinKey = ''; fixNote = null;
  if (projDlg.open) projDlg.close();
  drawAll(); render(true); syncUndo();
}
function addProject(name, Pn) {
  const id = newId();
  if (placeholder) { delete db[cur]; placeholder = false; saveThumbNow(); } else { saveThumbNow(); save(); }
  db[id] = { name: uniqueName(db, name), updated: Date.now(), P: Pn };
  openProject(id, true);
}
const fileIn = Object.assign(el('input'), { type: 'file', accept: '.json,application/json' });
fileIn.onchange = async () => {
  const f = fileIn.files[0]; fileIn.value = ''; if (!f) return;
  try { const { name, P: Pn } = parseProjectFile(await f.text()); addProject(name, normalize(Pn)); }
  catch (err) { info('Не удалось открыть проект', err.message); }
};
const fileName = id => db[id].name.replace(/[\\/:*?"<>|]+/g, '_') + '.json';
const PM = {
  async rename(id = cur) { const n = await askText('Название проекта', db[id].name); if (n) { db[id].name = n; if (id === cur) save(); else saveProjects(db, cur); drawHeader(); if (projDlg.open) drawProjDlg(); } },
  async saveas(id = cur) { if (id === cur) save(); const n = await askText('Дублировать проект', uniqueName(db, db[id].name)); if (n) addProject(n, JSON.parse(JSON.stringify(db[id].P))); },
  share(id = cur) { account && account.openShare(id); },
  versions(id = cur) { account && account.openVersions(id); },
  reset() { snap(); resetActive(); sel = 0; drawAll(); render(true); },
  export(id = cur) { if (id === cur) save(); download(projectFile(db, id), fileName(id), 'application/json'); },
  async del(id = cur) {
    const b = el('div', 'dbody'); b.append(el('p', '', `Проект «${db[id].name}» будет удалён без возможности восстановления.`));
    if (!(await modal('Удалить проект?', b, { ok: 'Удалить' }))) return;
    delete db[id]; delThumb(id);
    if (id === cur) {
      if (Object.keys(db).length) openProject(Object.keys(db)[0], true);
      else { // удалён последний проект: чистим и старый ключ, иначе loadProjects вернёт его обратно
        for (const k of [PROJECTS_KEY, CURRENT_KEY, LEGACY_KEY, NAME_KEY]) try { localStorage.removeItem(k); } catch { /* ничего */ }
        usePlaceholder(); openProject(cur, true); showProjects(); sync && sync.touch();
      }
    } else saveProjects(db, cur);
    if (projDlg.open) drawProjDlg();
  },
};
document.getElementById('pname').onclick = () => PM.rename();
document.querySelectorAll('[data-pm]').forEach(b => (b.onclick = () => { closeMenus(); PM[b.dataset.pm](); }));
document.getElementById('bproj').onclick = () => showProjects();

// экран проектов: карточки с миниатюрами; первый запуск и удаление последнего проекта сразу ведут к созданию
let projMode = 'list', projQuery = '', newType = 'wardrobe', newName = '', nameTouched = false, thumbUrls = [];
function showProjects() {
  saveThumbNow(); save();
  projMode = placeholder ? 'new' : 'list'; projQuery = ''; newType = 'wardrobe'; nameTouched = false; newName = uniqueName(db, typeLabel(newType));
  drawProjDlg();
  if (!projDlg.open) projDlg.showModal();
}
projDlg.addEventListener('cancel', e => { if (placeholder) e.preventDefault(); });
const two = n => String(n).padStart(2, '0');
function fmtDate(t) {
  const d = new Date(t), now = new Date(), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return `сегодня ${two(d.getHours())}:${two(d.getMinutes())}`;
  if (diff === 1) return 'вчера';
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
}
const sizeOf = p => `${Math.round(p.sections.reduce((a, s) => a + s.width, 0) + (p.sections.length + 1) * p.thickness)}×${p.height}×${p.depth}`;
function drawProjDlg() {
  thumbUrls.forEach(u => URL.revokeObjectURL(u)); thumbUrls = [];
  projDlg.innerHTML = '';
  return projMode === 'new' ? drawNewProject() : drawProjectList();
}
function drawProjectList() {
  const head = el('div', 'phead'), q = Object.assign(el('input', 'dtext'), { type: 'search', placeholder: 'Поиск по названию', value: projQuery });
  const imp = el('button', 'tbtn', 'Импорт .json…'), close = el('button', 'tbtn', 'Закрыть');
  imp.onclick = () => fileIn.click(); close.onclick = () => projDlg.close();
  head.append(el('h3', '', 'Проекты'), el('span', 'grow'), q, imp, close);
  const grid = el('div', 'pgrid');
  projDlg.append(head, grid);
  const cards = () => {
    thumbUrls.forEach(u => URL.revokeObjectURL(u)); thumbUrls = []; grid.innerHTML = '';
    const add = el('div', 'pcard add'); add.append(el('b', '', '+'), el('span', '', 'Новый проект'));
    add.tabIndex = 0; add.onclick = () => { projMode = 'new'; newType = 'wardrobe'; nameTouched = false; newName = uniqueName(db, typeLabel(newType)); drawProjDlg(); };
    add.onkeydown = e => { if (e.key === 'Enter') add.click(); };
    grid.append(add);
    const word = projQuery.trim().toLowerCase();
    const list = Object.entries(db).filter(([, p]) => !word || p.name.toLowerCase().includes(word)).sort((a, b) => b[1].updated - a[1].updated);
    list.forEach(([id, p]) => {
      const c = el('div', 'pcard' + (id === cur ? ' cur' : '')), pic = el('div', 'pic', '▭');
      const meta = el('div', 'meta'); meta.append(el('div', 'nm', p.name), el('div', 'sm', [typeLabel(p.P.type), sizeOf(p.P), fmtDate(p.updated), sync && sync.user && sync.isDirty(id) ? '☁ ждёт отправки' : ''].filter(Boolean).join(' · ')));
      const dots = el('button', 'dots', '⋯'); dots.title = 'Действия'; dots.setAttribute('aria-label', 'Действия с проектом');
      const menu = el('div', 'menu'); menu.hidden = true;
      [['Открыть', () => (id === cur ? projDlg.close() : openProject(id))], ['Дублировать…', () => PM.saveas(id)], ['Переименовать…', () => PM.rename(id)], ['Ссылка для просмотра…', () => PM.share(id)], ['История версий…', () => PM.versions(id)], ['Экспорт .json', () => PM.export(id)], ['Удалить…', () => PM.del(id)]].forEach(([l, fn]) => {
        const b = el('button', '', l); b.onclick = e => { e.stopPropagation(); closeMenus(); fn(); }; menu.append(b);
      });
      dots.onclick = e => toggleMenu(menu, e);
      c.onclick = () => (id === cur ? projDlg.close() : openProject(id));
      c.append(pic, meta, dots, menu); grid.append(c);
      getThumb(id).then(blob => { if (!blob || !pic.isConnected) return; const u = URL.createObjectURL(blob); thumbUrls.push(u); pic.style.backgroundImage = `url(${u})`; pic.textContent = ''; });
    });
    if (!list.length && word) grid.append(el('div', 'pempty', 'Ничего не найдено'));
  };
  q.oninput = () => { projQuery = q.value; cards(); };
  cards();
}
function drawNewProject() {
  const required = placeholder;
  projDlg.append(el('h3', '', 'Новый проект'));
  const body = el('div', 'dbody'); body.style.padding = '0';
  body.append(Object.assign(el('p', 'hint'), { textContent: 'Тип изделия выбирается один раз при создании и дальше не меняется — от него зависят доступные параметры и элементы.', style: 'padding:0 18px' }));
  const types = el('div', 'ptypes'), input = Object.assign(el('input', 'dtext'), { type: 'text', value: newName, maxLength: 60 });
  TYPES.forEach(([k, l]) => {
    const b = el('button', 'ptype' + (k === newType ? ' on' : '')); b.append(el('b', '', l), el('span', '', TYPE_INFO[k]));
    b.onclick = () => { newType = k; types.querySelectorAll('.ptype').forEach(x => x.classList.toggle('on', x === b)); if (!nameTouched) input.value = newName = uniqueName(db, l); };
    types.append(b);
  });
  const nm = el('div', 'pname-in'); nm.append(el('label', '', 'Название'), input);
  input.oninput = () => { nameTouched = true; newName = input.value; };
  const create = () => addProject(input.value.trim() || typeLabel(newType), makePreset(newType, keepColors()));
  input.onkeydown = e => { if (e.key === 'Enter') create(); };
  body.append(types, nm);
  const foot = el('div', 'dfoot'), ok = el('button', 'pri', 'Создать'), imp = el('button', '', 'Импорт .json…');
  ok.onclick = create; imp.onclick = () => fileIn.click();
  foot.append(imp, el('span', 'grow'));
  if (!required) { const back = el('button', '', 'Назад'); back.onclick = () => { projMode = 'list'; drawProjDlg(); }; foot.append(back); }
  foot.append(ok);
  projDlg.append(body, foot);
  input.focus(); input.select();
}

// ── справочник и цены
// варианты моделей (hwparams.js / fittings.js variantOf): по ним проект выбирает модель; свободный текст приводил к тихим промахам
const VARIANT_OPTS = [['', '— без варианта'], ...['soft', 'plain', 'wide', 'half-soft', 'half-plain', 'half-wide', 'flap', 'ball', 'ballSoft', 'hidden', 'roller', 'push', 'bar', 'knob', 'profile', 'glass', 'top', 'bottom', 'v', 'h'].map(v => [v, v])];
function openCatalog() {
  let c = JSON.parse(JSON.stringify(cat));
  const body = el('div', 'dbody catbox');
  const cell = (o, k, type, opts) => {
    let i;
    if (type === 'select') { i = el('select'); if (!opts.some(v => (Array.isArray(v) ? v[0] : v) === o[k])) opts = [...opts, o[k]]; /* значение из старого справочника не теряем */ opts.forEach(v => { const [val, lab] = Array.isArray(v) ? v : [v, v]; i.append(new Option(lab, val, false, o[k] === val)); }); i.onchange = () => (o[k] = i.value); return i; }
    i = Object.assign(el('input'), { type, value: o[k] ?? '' });
    if (type === 'checkbox') { i.checked = !!o[k]; i.onchange = () => (o[k] = i.checked); } else i.oninput = () => (o[k] = type === 'number' ? +i.value || 0 : i.value);
    if (type === 'number') i.step = 'any';
    return i;
  };
  const grid = (title, hint, list, cols, blank) => {
    const d = el('details'); d.open = true; d.append(el('summary', '', title)); if (hint) d.append(el('div', 'hint2', hint));
    const tb = el('div', 'cgrid'); tb.style.gridTemplateColumns = `${cols.map(x => x[3] || '1fr').join(' ')} 24px`;
    const draw = () => {
      tb.innerHTML = ''; cols.forEach(x => tb.append(el('span', 'ch', x[1]))); tb.append(el('span'));
      list.forEach((o, i) => { cols.forEach(([k, , type, , opts]) => tb.append(cell(o, k, type, opts))); const x = el('button', 'x', '✕'); x.title = 'Удалить строку'; x.onclick = () => { list.splice(i, 1); draw(); }; tb.append(x); });
    };
    draw(); d.append(tb);
    const add = el('button', 'mini', '+ Добавить'); add.onclick = () => { list.push({ ...blank }); draw(); }; d.append(add);
    return d;
  };
  // параметры присадки выбранных моделей: пустое поле = значение по умолчанию (hwparams.js)
  const paramsBlock = () => {
    const d = el('details'); d.append(el('summary', '', 'Присадка моделей'), el('div', 'hint2', 'Отступы, шаг и длины, по которым считается присадка. Сверьте с паспортом модели. Пустое поле — значение по умолчанию (серым). Для направляющих «вариант» модели должен быть ball, ballSoft, roller, hidden или push.'));
    const body2 = el('div');
    const draw2 = () => {
      body2.innerHTML = '';
      for (const o of c.fittings) {
        const defs = HW_PARAM_DEFS[o.kind]; if (!defs) continue;
        const base = o.kind === 'hinge' ? HW_DEFAULTS.hinge : o.kind === 'slide' ? HW_DEFAULTS.slide[o.variant] || HW_DEFAULTS.slide.ball : o.kind === 'shelfPin' ? HW_DEFAULTS.pin : HW_DEFAULTS.kupe;
        const row = el('details'); row.append(el('summary', '', `${KIND_LABELS[o.kind]}: ${o.name || o.id}${o.variant ? ' · ' + o.variant : ''}`));
        const tb = el('div', 'cgrid'); tb.style.gridTemplateColumns = '1fr 130px';
        for (const [k, label, hint, type] of defs) {
          const i = Object.assign(el('input'), { type: type === 'list' ? 'text' : 'number', placeholder: String(Array.isArray(base[k]) ? base[k].join(',') : base[k]), value: (o.params && o.params[k]) ?? '' });
          if (type === 'num') i.step = 'any';
          i.oninput = () => { o.params = o.params || {}; if (i.value === '') delete o.params[k]; else o.params[k] = type === 'list' ? i.value : +i.value; };
          const l = el('span', '', label); if (hint) l.title = hint;
          tb.append(l, i);
        }
        row.append(tb); body2.append(row);
      }
    };
    d.ontoggle = () => { if (d.open) draw2(); };
    d.append(body2); return d;
  };
  const fields = (title, hint, defs) => {
    const d = el('details'); d.open = true; d.append(el('summary', '', title)); if (hint) d.append(el('div', 'hint2', hint));
    const tb = el('div', 'cgrid'); tb.style.gridTemplateColumns = '1fr 110px';
    for (const [l, o, k] of defs) { tb.append(el('span', '', l), cell(o, k, 'number')); }
    d.append(tb); return d;
  };
  const draw = () => {
    body.innerHTML = '';
    body.append(
      grid('Декоры', 'Текстура — волокна идут вдоль длины листа: детали не поворачиваются при раскрое. Доплата прибавляется к цене листа.', c.decors, [['name', 'Название', 'text'], ['color', 'Цвет', 'color', '54px'], ['textured', 'Текстура', 'checkbox', '70px'], ['price', 'Доплата за лист', 'number', '110px']], { name: 'Новый', color: '#cccccc', textured: false, price: 0 }),
      grid('Листы', 'Размер и цена листа для каждого материала и толщины. Тип: начало названия материала в спецификации.', c.sheets, [['mat', 'Материал', 'select', '90px', ['ЛДСП', 'МДФ', 'ХДФ']], ['T', 'Толщина', 'number', '1fr'], ['L', 'Длина', 'number', '1fr'], ['W', 'Ширина', 'number', '1fr'], ['price', 'Цена за лист', 'number', '1fr']], { mat: 'ЛДСП', T: 18, L: 2800, W: 2070, price: 0 }),
      fields('Кромка ПВХ, цена за пог. м', '', Object.keys(c.edge).map(k => [`${k.replace('.', ',')} мм`, c.edge, k])),
      grid('Фурнитура', 'Цена ищется по началу названия позиции в спецификации (например, «Петля» — все петли). Без цены позиция не входит в смету.', c.hardware, [['match', 'Название начинается с', 'text'], ['price', 'Цена за шт.', 'number', '90px'], ['art', 'Артикул', 'text', '110px']], { match: '', price: 0, art: '' }),
      grid('Модели фурнитуры', 'Что покупать: категория, вариант (например, soft/plain у петель), бренд, название, артикул, цена за упаковку (штанги и профили — за хлыст), штук в упаковке, длина хлыста. В проекте выбирается модель на категорию; артикулы заполните своими.', c.fittings, [['kind', 'Категория', 'select', '120px', Object.entries(KIND_LABELS)], ['variant', 'Вариант', 'select', '110px', VARIANT_OPTS], ['brand', 'Бренд', 'text', '80px'], ['name', 'Название', 'text', '1.4fr'], ['art', 'Артикул', 'text', '90px'], ['price', 'Цена', 'number', '70px'], ['pack', 'В уп.', 'number', '50px'], ['stockLen', 'Хлыст, мм', 'number', '70px'], ['url', 'Ссылка', 'text', '1fr']], { id: '', kind: 'screw', variant: '', brand: '', name: '', art: '', price: 0, pack: 1, stockLen: 0, url: '', params: {} }),
      paramsBlock(),
      fields('Фрезеровка фасадов и кромка стекла', 'Рамка рамочных фасадов и фасадов под стекло, четверть под стекло, фаска и углы стекла. Идут в чертёж детали, примечания и DXF.', HW_PARAM_DEFS.mill.map(([k, l]) => [l, c.milling, k])),
      fields('Работы и наценка', '', [['Распил, за метр реза', c.works, 'cut'], ['Кромкование, за пог. м', c.works, 'edge'], ['Присадка, за отверстие', c.works, 'hole'], ['Сборка, % от материалов и фурнитуры', c.works, 'assembly'], ['Стекло, за м²', c.special, 'glass'], ['Зеркало, за м²', c.special, 'mirror'], ['Наценка, %', c, 'markup']]),
      grid('Складские остатки', 'Обрезки листов, которые уже есть в наличии. Раскрой кладёт детали на них первыми, в смету они не входят, обрезка у них не снимается. Материал выбирается из списка декоров, толщина должна совпадать с деталью.', c.stock, [['label', 'Материал', 'select', '150px', [...c.decors.map(d => `ЛДСП ${d.name}`), 'ХДФ']], ['T', 'Толщ.', 'number', '60px'], ['L', 'Длина', 'number', '1fr'], ['W', 'Ширина', 'number', '1fr'], ['qty', 'Шт.', 'number', '56px']], { label: `ЛДСП ${(c.decors[0] || { name: 'Белый' }).name}`, T: 18, L: 800, W: 600, qty: 1 }),
      fields('Раскрой', 'Пропил — ширина реза пилы; обпил — полоса, срезаемая по краю листа; остаток считается деловым от указанных размеров.', [['Пропил, мм', c.cut, 'kerf'], ['Обпил по краю, мм', c.cut, 'trim'], ['Деловой остаток: длиннее, мм', c.cut.minOffcut, 0], ['Деловой остаток: шире, мм', c.cut.minOffcut, 1]]),
    );
  };
  draw();
  const bx = el('button', '', 'Экспорт .json'); bx.onclick = () => download(JSON.stringify(c, null, 2), 'catalog.json', 'application/json');
  const bi = el('button', '', 'Импорт .json'), fi = Object.assign(el('input'), { type: 'file', accept: '.json' });
  fi.onchange = async () => { try { const o = JSON.parse(await fi.files[0].text()); if (!Array.isArray(o.sheets) || !Array.isArray(o.decors)) throw 0; c = sanitizeCatalog(o); draw(); } catch { info('Не удалось', 'Файл не похож на справочник.'); } };
  bi.onclick = () => fi.click();
  const br = el('button', '', 'Сбросить'); br.title = 'Вернуть справочник по умолчанию'; br.onclick = () => { c = JSON.parse(JSON.stringify(DEFAULT_CATALOG)); draw(); };
  modal('Справочник и цены', body, { ok: 'Сохранить', wide: true, extra: [bx, bi, br] }).then(ok => { if (ok) { const ids = new Set(); c.fittings.forEach((f, i) => { let id = f.id || `${f.kind}-${f.variant || 'm'}-${i}`; while (ids.has(id)) id += '_'; f.id = id; ids.add(id); }); cat = c; saveCatalog(cat); kinKey = ''; drawGlobal(); render(false); } });
}

// ── мобильная панель: три состояния и вкладки
const panel = document.getElementById('panel'), handle = document.getElementById('handle');
const setSnap = k => { panel.dataset.snap = k; panel.style.height = ''; };
const setTab = k => { panel.dataset.tab = k; document.querySelectorAll('#tabs button').forEach(b => { const on = b.dataset.go === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); if (panel.dataset.snap === 'peek') setSnap('half'); };
document.querySelectorAll('#tabs button').forEach(b => (b.onclick = () => setTab(b.dataset.go)));
{
  let y0, h0, moved = false;
  handle.onpointerdown = e => { y0 = e.clientY; h0 = panel.getBoundingClientRect().height; moved = false; handle.setPointerCapture(e.pointerId); panel.style.transition = 'none'; };
  handle.onpointermove = e => { if (y0 == null) return; const dy = y0 - e.clientY; if (Math.abs(dy) > 4) moved = true; if (moved) panel.style.height = clamp(h0 + dy, 72, innerHeight * 0.92) + 'px'; };
  handle.onpointerup = () => {
    if (y0 == null) return; panel.style.transition = '';
    const order = ['peek', 'half', 'full'], cur2 = panel.dataset.snap || 'peek';
    if (!moved) setSnap(order[(order.indexOf(cur2) + 1) % 3]);
    else { const h = panel.getBoundingClientRect().height / innerHeight; setSnap(h < 0.25 ? 'peek' : h < 0.7 ? 'half' : 'full'); }
    y0 = null;
  };
  handle.onpointercancel = () => { y0 = null; panel.style.transition = ''; };
  setSnap('half'); setTab('sections');
}

drawAll();
render(true);
if (placeholder) showProjects();

// ── аккаунт и синхронизация: проекты, справочник и миниатюры уходят на сервер, остальное работает как раньше
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(text) { toastEl.textContent = text; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 6000); }

/** Стереть проекты и справочник с устройства (выход с удалением, чужой аккаунт). */
function wipe() {
  for (const id of Object.keys(db)) { delThumb(id); delete db[id]; }
  for (const k of [PROJECTS_KEY, CURRENT_KEY, LEGACY_KEY, NAME_KEY, CATALOG_KEY, CATALOG_KEY + '-backup', 'mebel-preview']) try { localStorage.removeItem(k); } catch { /* ничего */ }
  cat = loadCatalog();
  usePlaceholder(); openProject(cur, true); showProjects();
}

function onSyncEvent(e) {
  if (e.type === 'status') account && account.onStatus(e.status);
  else if (e.type === 'unauthorized') account && account.expired();
  else if (e.type === 'catalog') { cat = loadCatalog(); drawGlobal(); }
  else if (e.type === 'rejected') toast('Сервер не принял проект' + (e.message ? ': ' + e.message : ''));
  else if (e.type === 'error') console.warn('Синхронизация:', e.error);
  else if (e.type === 'conflicts') {
    const c = e.conflicts[0], more = e.conflicts.length > 1 ? ` (и ещё ${e.conflicts.length - 1})` : '';
    toast(c.restored ? `«${c.name}» удалён на другом устройстве; ваша версия сохранена как новый проект${more}` : `«${c.name}» изменён на другом устройстве. Ваши правки сохранены в копии «${c.copy}»${more}`);
  } else if (e.type === 'projects') {
    if (placeholder) { // чистое устройство: с сервера пришли проекты — заготовка больше не нужна
      const ids = Object.keys(db).filter(id => id !== cur);
      if (ids.length) { delete db[cur]; placeholder = false; if (projDlg.open) projDlg.close(); openProject(ids[0], true); }
    } else if (!db[cur]) { // текущий проект удалён на другом устройстве
      const ids = Object.keys(db), next = [...e.added].pop() || ids[0];
      if (next) openProject(next, true); else { usePlaceholder(); openProject(cur, true); showProjects(); }
    } else if (e.replaced.has(cur)) { openProject(cur, true); toast('Проект обновлён с другого устройства'); }
    drawHeader(); if (projDlg.open) drawProjDlg();
  }
}

const api = createApi();
sync = createSync({
  api, storage: localStorage, getDb: () => db, onEvent: onSyncEvent, wipe,
  persist: () => { if (!placeholder) saveProjects(db, cur); },
  skip: id => placeholder && id === cur,
  thumbs: { get: getLocalThumb, drop: delThumb },
});
hooks.onSave = () => sync.touch();
catalogHooks.onSave = () => sync.touch();
setRemote(async id => { if (!sync.user) return undefined; const r = await api.get(`/projects/${encodeURIComponent(id)}/thumb`); return r.offline ? undefined : r.ok ? r.data : null; });
account = initAccount({
  el, dlg, api, sync, toast, toggleMenu,
  localCount: () => Object.keys(db).filter(id => !(placeholder && id === cur)).length,
  dirtyCount: () => Object.keys(db).filter(id => sync.isDirty(id)).length,
  flush: () => { saveThumbNow(); save(); },
  addProject: (name, Pn) => addProject(name, normalize(Pn)),
  refreshCards: () => { if (projDlg.open) drawProjDlg(); },
});
account.boot();
