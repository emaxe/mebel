import { buildSpec, isDrawer } from './model.js';
import { build3D } from './build3d.js';
import { toCSV, toDXF } from './export.js';
import { autoFix, kinProblems } from './autofix.js';
import { FILL_LABELS, rulesOf, makePreset, normalize, fillItems, innerH, autoShelves, stepShelves, autoDrawers, packDrawers, redistribute, fitSections, clamp } from './rules.js';
import { loadCatalog, saveCatalog, DEFAULT_CATALOG } from './catalog.js';
import { loadProjects, saveProjects, newId, uniqueName, projectFile, parseProjectFile, PROJECTS_KEY, CURRENT_KEY, LEGACY_KEY, NAME_KEY } from './projects.js';
import { putThumb, getThumb, delThumb } from './thumbs.js';

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
let P = normalize(db[cur].P);
let sel = 0, model, spec, outline;
const savedEl = document.getElementById('saved');
let savedTimer;
const save = () => {
  if (placeholder || !db[cur]) return;
  db[cur].P = P; db[cur].updated = Date.now();
  const ok = saveProjects(db, cur);
  savedEl.textContent = ok ? '✓ Сохранено' : 'Не сохранено: нет места';
  savedEl.className = 'saved ' + (ok ? 'ok' : 'err');
  clearTimeout(savedTimer); if (ok) savedTimer = setTimeout(() => (savedEl.className = 'saved'), 1500);
};

// ── отмена и повтор: каждая правка — один шаг (перетаскивание ползунка тоже один); параметры вида (открыть двери и т. п.) не записываются
const hist = [], redoSt = [];
let editing = null;
const undoBtn = document.getElementById('undo'), redoBtn = document.getElementById('redo');
const syncUndo = () => { undoBtn.disabled = !hist.length; redoBtn.disabled = !redoSt.length; };
const stack = (a, j) => { a.push(j); if (a.length > 60) a.shift(); };
/** Запомнить состояние до правки (один раз за жест); endEdit убирает запись, если ничего не изменилось. */
const beginEdit = () => { if (editing === null) { editing = JSON.stringify(P); stack(hist, editing); redoSt.length = 0; syncUndo(); } };
const endEdit = () => { if (editing === null) return; if (JSON.stringify(P) === editing) hist.pop(); editing = null; syncUndo(); };
const snap = () => { stack(hist, JSON.stringify(P)); redoSt.length = 0; syncUndo(); };
const restore = j => {
  const keep = { open: P.open, hideDoors: P.hideDoors, showHoles: P.showHoles };
  P = normalize({ ...JSON.parse(j), ...keep }); sel = Math.min(sel, P.sections.length - 1); kinKey = '';
  drawAll(); render(true); syncUndo();
};
const undo = () => { const j = hist.pop(); if (!j) return; stack(redoSt, JSON.stringify(P)); restore(j); };
const redo = () => { const j = redoSt.pop(); if (!j) return; stack(hist, JSON.stringify(P)); restore(j); };
undoBtn.onclick = undo; redoBtn.onclick = redo;
const act = fn => (...a) => { beginEdit(); try { fn(...a); } finally { endEdit(); } };
addEventListener('keydown', e => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
  const t = e.target, typing = t && (t.isContentEditable || /^(textarea|select)$/i.test(t.tagName) || (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox'));
  if (typing || document.getElementById('dlg').open || document.getElementById('projDlg').open) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
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
let kinKey = '', kinWarn = [], fixNote = null;
function kinematicWarnings() {
  const { open, hideDoors, showHoles, bodyColor, bodyName, frontColor, frontName, metalColor, ...rest } = P;
  const key = JSON.stringify(rest);
  if (key === kinKey) return kinWarn;
  kinKey = key;
  kinWarn = kinProblems(spec).map(k => k.text);
  if (kinWarn.length > 6) kinWarn = [...kinWarn.slice(0, 6), `…и ещё ${kinWarn.length - 6}`];
  return kinWarn;
}
function fixAll() {
  snap();
  fixNote = autoFix(P);
  kinKey = '';
  drawAll(); render(false);
}

function render(frame) {
  normalize(P);
  sel = Math.min(sel, P.sections.length - 1);
  spec = buildSpec(P);
  save();
  model = build3D(THREE, spec, P);
  stage.setObject(model, { keepCamera: !frame, floorY: 0 });
  const m = spec.meta;
  document.getElementById('dims').textContent = `${Math.round(m.W)} × ${P.height} × ${P.depth} мм · деталей: ${spec.parts.length}`;
  drawHeader(); scheduleThumb();
  const w = document.getElementById('warn'), all = [...spec.warnings, ...kinematicWarnings()], note = fixNote; fixNote = null;
  w.innerHTML = '';
  if (note && note.log.length) { const d = el('div', 'fixed'); d.textContent = 'Исправлено: ' + note.log.join('; '); w.append(d); }
  if (note && !note.log.length && all.length) w.append(el('div', 'fixed', 'Автоматически исправить не удалось — измените параметры вручную.'));
  all.forEach(x => w.append(el('div', '', x)));
  if (all.length) { const b = el('button', 'fixbtn', 'Исправить автоматически'); b.title = 'Раздвинет перекрывающиеся элементы, сдвинет полки от петель, подберёт ручки и фасады так, чтобы всё открывалось'; b.onclick = fixAll; w.append(b); }
  w.style.display = w.childNodes.length ? '' : 'none';
  document.querySelectorAll('[data-when]').forEach(e => (e.style.display = e._when() ? '' : 'none'));
  highlight();
}
function highlight() {
  const sc = stage._scene; if (outline) { sc.remove(outline); outline.geometry.dispose(); }
  const m = spec.meta, s = m.sections[sel]; if (!s) return;
  const k = 1 / 1000;
  outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry((s.w - 6) * k, (m.ih - 6) * k, (m.D + 40) * k)), new THREE.LineBasicMaterial({ color: 0xd4672a, depthTest: false, transparent: true }));
  outline.position.set(s.x * k, ((m.yB + m.yT) / 2) * k + model.position.y, 0.02);
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
    const show = () => (out.textContent = c.fmt ? c.fmt(obj[c.k]) : obj[c.k] + (c.u ? ' ' + c.u : ''));
    show();
    r.oninput = () => { if (!c.nohist) beginEdit(); const old = obj[c.k]; obj[c.k] = +r.value; show(); onChange(c, true, old); };
    r.onchange = () => { onChange(c, false); if (!c.nohist) endEdit(); };
    row.append(r);
  }
  return row;
}

// ── global settings (ranges and visibility follow the furniture type)
const globalDefs = () => {
  const r = R();
  return [
    ['Корпус', [
      { k: 'fit', l: 'Подстраивать под размеры', tog: 1, hint: 'Включено: при изменении высоты, толщины ЛДСП или основания полки, штанги и ящики пересчитываются вместе с размером. Выключено: всё остаётся на своих высотах (что не помещается — ужимается).' },
      { k: 'fitMode', l: 'Как подстраивать', seg: [['prop', 'Пропорционально'], ['even', 'Равномерно']], when: () => P.fit, hint: 'Пропорционально — каждый элемент сохраняет относительное положение, ящики меняют высоту вместе с изделием. Равномерно — количество полок и ящиков то же, но они заново раскладываются поровну.' },
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
      const h = Object.assign(el('input'), { type: 'number', value: it.h, step: 10, min: 80, max: 500, title: 'Высота фасада ящика, мм' });
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
    if (dMode) { card.append(af({ k: 'n', l: 'Количество ящиков', min: 1, max: 10, step: 1, hint: 'Сколько ящиков в стопке. Высота ограничена 80–500 мм на ящик.' })); card.append(af({ k: 'zone', l: 'Высота зоны ящиков (снизу)', min: 160, max: H, step: 10, u: 'мм', hint: 'До какой высоты от дна секции тянется стопка ящиков.' })); }
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
  const root = document.getElementById('controls'); root.innerHTML = '';
  for (const [title, rows, groupWhen] of globalDefs()) {
    const d = el('details'); d.open = title === 'Корпус';
    if (groupWhen) { d.dataset.when = 1; d._when = groupWhen; }
    d.append(el('summary', '', title));
    rows.forEach(c => d.append(control(c, P, onGlobal)));
    root.append(d);
  }
  const v = document.getElementById('view'); v.innerHTML = '';
  viewDefs().forEach(c => v.append(control(c, P, () => render(false))));
}
function drawAll() { drawSections(); drawGlobal(); }

// ── exports
const download = (data, name, type) => { const a = el('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
const stamp = () => `${P.type}_${Math.round(spec.meta.W)}x${P.height}x${P.depth}`;
// снимок 3D без рамки выбранной секции, уменьшенный до maxW (КП хранит снимок в localStorage, карточка проекта — миниатюру в IndexedDB)
function shot(maxW) {
  const c = stage._renderer.domElement, k = Math.min(1, maxW / c.width), o = document.createElement('canvas');
  o.width = Math.round(c.width * k); o.height = Math.round(c.height * k);
  if (outline) outline.visible = false;
  stage._renderer.render(stage._scene, stage._camera);
  const g = o.getContext('2d'); g.fillStyle = '#f0eee6'; g.fillRect(0, 0, o.width, o.height);
  g.drawImage(c, 0, 0, o.width, o.height);
  if (outline) outline.visible = true;
  return o;
}
const snapshot = () => shot(1000).toDataURL('image/jpeg', 0.82);
let thumbTimer;
const saveThumbNow = () => {
  clearTimeout(thumbTimer);
  if (placeholder || !spec || !db[cur]) return;
  const id = cur;
  try { shot(360).toBlob(b => b && putThumb(id, b), 'image/jpeg', 0.8); } catch { /* без миниатюры карточка покажет заглушку */ }
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
  csv: () => download(toCSV(spec, `${typeLabel(P.type)} ${Math.round(spec.meta.W)} × ${P.height} × ${P.depth} мм`), stamp() + '.csv', 'text/csv;charset=utf-8'),
  dxf: () => download(toDXF(spec), stamp() + '.dxf', 'application/dxf'),
  obj: () => stage._runExport('obj'),
  glb: () => stage._runExport('glb'),
  cat: () => openCatalog(),
};
document.querySelectorAll('[data-x]').forEach(b => (b.onclick = () => { closeMenus(); EXPORTS[b.dataset.x](); }));

let down;
stage.addEventListener('pointerdown', e => (down = [e.clientX, e.clientY]));
stage.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
  const r = stage.getBoundingClientRect(), ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), stage._camera);
  const hit = ray.intersectObject(model, true).find(h => h.object.userData.section !== undefined);
  if (hit) select(hit.object.userData.section);
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
const projDlg = document.getElementById('projDlg'), pm = document.getElementById('pm'), xm = document.getElementById('xm');
const keepColors = () => ({ bodyColor: P.bodyColor, bodyName: P.bodyName, frontColor: P.frontColor, frontName: P.frontName, metalColor: P.metalColor });
function drawHeader() {
  document.getElementById('pname').textContent = db[cur].name;
  document.getElementById('tbadge').textContent = typeLabel(P.type);
}
/** Закрыть меню шапки и меню карточек. */
function closeMenus() { [pm, xm, ...projDlg.querySelectorAll('.menu')].forEach(m => (m.hidden = true)); }
const toggleMenu = (m, e) => { e.stopPropagation(); const was = m.hidden; closeMenus(); m.hidden = !was; };
addEventListener('click', e => { if (![pm, xm].some(m => m.contains(e.target)) && !e.target.closest('.dots')) closeMenus(); });
document.getElementById('pmenu').onclick = e => toggleMenu(pm, e);
document.getElementById('xmenu').onclick = e => toggleMenu(xm, e);

/** skipSave: текущий проект уже удалён, сохранять его параметры нельзя. */
function openProject(id, skipSave) {
  if (!skipSave) { saveThumbNow(); save(); }
  cur = id; if (!placeholder) saveProjects(db, cur);
  P = normalize(db[id].P); hist.length = 0; redoSt.length = 0; editing = null; sel = 0; kinKey = ''; fixNote = null;
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
  reset() { snap(); P = makePreset(P.type); sel = 0; drawAll(); render(true); },
  export(id = cur) { if (id === cur) save(); download(projectFile(db, id), fileName(id), 'application/json'); },
  async del(id = cur) {
    const b = el('div', 'dbody'); b.append(el('p', '', `Проект «${db[id].name}» будет удалён без возможности восстановления.`));
    if (!(await modal('Удалить проект?', b, { ok: 'Удалить' }))) return;
    delete db[id]; delThumb(id);
    if (id === cur) {
      if (Object.keys(db).length) openProject(Object.keys(db)[0], true);
      else { // удалён последний проект: чистим и старый ключ, иначе loadProjects вернёт его обратно
        for (const k of [PROJECTS_KEY, CURRENT_KEY, LEGACY_KEY, NAME_KEY]) try { localStorage.removeItem(k); } catch { /* ничего */ }
        usePlaceholder(); openProject(cur, true); showProjects();
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
      const meta = el('div', 'meta'); meta.append(el('div', 'nm', p.name), el('div', 'sm', [typeLabel(p.P.type), sizeOf(p.P), fmtDate(p.updated)].filter(Boolean).join(' · ')));
      const dots = el('button', 'dots', '⋯'); dots.title = 'Действия'; dots.setAttribute('aria-label', 'Действия с проектом');
      const menu = el('div', 'menu'); menu.hidden = true;
      [['Открыть', () => (id === cur ? projDlg.close() : openProject(id))], ['Дублировать…', () => PM.saveas(id)], ['Переименовать…', () => PM.rename(id)], ['Экспорт .json', () => PM.export(id)], ['Удалить…', () => PM.del(id)]].forEach(([l, fn]) => {
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
function openCatalog() {
  let c = JSON.parse(JSON.stringify(cat));
  const body = el('div', 'dbody catbox');
  const cell = (o, k, type, opts) => {
    let i;
    if (type === 'select') { i = el('select'); opts.forEach(v => i.append(new Option(v, v, false, o[k] === v))); i.onchange = () => (o[k] = i.value); return i; }
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
      fields('Работы и наценка', '', [['Распил, за метр реза', c.works, 'cut'], ['Кромкование, за пог. м', c.works, 'edge'], ['Присадка, за отверстие', c.works, 'hole'], ['Сборка, % от материалов и фурнитуры', c.works, 'assembly'], ['Стекло, за м²', c.special, 'glass'], ['Зеркало, за м²', c.special, 'mirror'], ['Наценка, %', c, 'markup']]),
      fields('Раскрой', 'Пропил — ширина реза пилы; обпил — полоса, срезаемая по краю листа; остаток считается деловым от указанных размеров.', [['Пропил, мм', c.cut, 'kerf'], ['Обпил по краю, мм', c.cut, 'trim'], ['Деловой остаток: длиннее, мм', c.cut.minOffcut, 0], ['Деловой остаток: шире, мм', c.cut.minOffcut, 1]]),
    );
  };
  draw();
  const bx = el('button', '', 'Экспорт .json'); bx.onclick = () => download(JSON.stringify(c, null, 2), 'catalog.json', 'application/json');
  const bi = el('button', '', 'Импорт .json'), fi = Object.assign(el('input'), { type: 'file', accept: '.json' });
  fi.onchange = async () => { try { const o = JSON.parse(await fi.files[0].text()); if (!Array.isArray(o.sheets) || !Array.isArray(o.decors)) throw 0; c = Object.assign(JSON.parse(JSON.stringify(DEFAULT_CATALOG)), o); draw(); } catch { info('Не удалось', 'Файл не похож на справочник.'); } };
  bi.onclick = () => fi.click();
  const br = el('button', '', 'Сбросить'); br.title = 'Вернуть справочник по умолчанию'; br.onclick = () => { c = JSON.parse(JSON.stringify(DEFAULT_CATALOG)); draw(); };
  modal('Справочник и цены', body, { ok: 'Сохранить', wide: true, extra: [bx, bi, br] }).then(ok => { if (ok) { cat = c; saveCatalog(cat); drawGlobal(); } });
}

// ── мобильная панель: три состояния и вкладки
const panel = document.getElementById('panel'), handle = document.getElementById('handle');
const SNAPS = { peek: 0, half: 0.5, full: 0.88 };
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
void SNAPS;

drawAll();
render(true);
if (placeholder) showProjects();
