// Проверка собираемости: деталь за деталью, отверстие за отверстием, этап за этапом. Без DOM: работает в node (тесты) и в браузере.
// checkBuild(spec, P, { N, skipKin }) → [{ level: 'error' | 'warn', code, text, parts }]. N — результат nest() (необязателен: проверка «лист вмещает деталь»), skipKin — не считать кинематику (её показывает своя панель).
import { dims, closedOverlaps, kinProblems } from './kinematics.js';
import { shelfDeflection, maxShelfSpan, DEFAULT_LOAD, SAG_DIV } from './norms.js';
import { STAGES } from './model.js';
import { hingeCount, defaultHw } from './hwparams.js';

const TOL = 1.0; // допуск соосности и касания, мм
const AX = { yz: { u: 1, v: 2, n: 0 }, xz: { u: 0, v: 2, n: 1 }, xy: { u: 0, v: 1, n: 2 } };
const OUT = { yz: { A: -1, B: 1 }, xz: { A: 1, B: -1 }, xy: { A: 1, B: -1 } }; // знак наружной нормали пласти
const nm = p => `«${p.name}»${p.sec ? ` (секция ${p.sec})` : ''}`;
const lo3 = p => { const d = dims(p); return [0, 1, 2].map(k => p.c[k] - d[k] / 2); };
const hi3 = p => { const d = dims(p); return [0, 1, 2].map(k => p.c[k] + d[k] / 2); };

/** Положение отверстия в мире (мм) и направление сверления внутрь детали. */
export function holeWorld(p, h) {
  const a = AX[p.plane], lo = lo3(p), pos = [0, 0, 0], dir = [0, 0, 0];
  pos[a.u] = lo[a.u] + h.u; pos[a.v] = lo[a.v] + h.v;
  if (h.f === 'A' || h.f === 'B') { const s = OUT[p.plane][h.f]; pos[a.n] = p.c[a.n] + (s * p.T) / 2; dir[a.n] = -s; }
  else {
    pos[a.n] = p.c[a.n];
    if (h.f === 'w1') dir[a.u] = 1; else if (h.f === 'w2') dir[a.u] = -1; else if (h.f === 'd1') dir[a.v] = 1; else dir[a.v] = -1;
  }
  return { pos, dir };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const inBox = (pt, p, m) => { const l = lo3(p), h = hi3(p); return [0, 1, 2].every(k => pt[k] >= l[k] - m && pt[k] <= h[k] + m); };
const touch = (a, b, m) => { const la = lo3(a), ha = hi3(a), lb = lo3(b), hb = hi3(b); return [0, 1, 2].every(k => la[k] <= hb[k] + m && ha[k] >= lb[k] - m); };
const isFace = h => h.f === 'A' || h.f === 'B';

export function checkBuild(spec, P, opts = {}) {
  const out = [];
  if (P.type === 'kfill' || P.type === 'kcorner') return out;
  const add = (level, code, text, parts = []) => out.push({ level, code, text, parts: parts.map(p => (typeof p === 'string' ? p : nm(p))) });
  const parts = spec.parts, extras = spec.extras, HW = opts.hw || defaultHw(P);
  const idx = new Map(parts.map((p, i) => [p, i]));
  const stageIx = p => STAGES.indexOf(p.asm);

  // ── 1. геометрия
  for (const p of parts) {
    if (![p.L, p.W, p.T].every(v => Number.isFinite(v) && v > 0)) add('error', 'geom', `${nm(p)}: нулевой или неверный размер ${p.L}×${p.W}×${p.T}`, [p]);
    if (stageIx(p) < 0) add('error', 'stage', `${nm(p)}: не указан этап сборки`, [p]);
  }
  const sideL = parts.find(p => p.name === 'Боковина левая'), sideR = parts.find(p => p.name === 'Боковина правая');
  if (sideL && sideR) {
    const w = sideR.c[0] + sideR.T / 2 - (sideL.c[0] - sideL.T / 2);
    if (Math.abs(w - spec.meta.W) > 0.01) add('error', 'width', `Общая ширина ${spec.meta.W} мм не сходится с положением боковин (${w} мм)`, [sideL, sideR]);
    const sum = P.sections.reduce((a, s) => a + s.width, 0) + (P.sections.length + 1) * P.thickness;
    if (Math.abs(sum - spec.meta.W) > 0.01) add('error', 'width', `Ширина секций и перегородок (${sum} мм) не равна ширине изделия (${spec.meta.W} мм)`);
  }
  if (opts.N && (opts.N.over || []).length) {
    const over = opts.N.over, shown = over.slice(0, 4).map(o => `№${o.no} (${Math.round(Math.max(o.l, o.w))}×${Math.round(Math.min(o.l, o.w))} мм)`).join(', ');
    add('error', 'sheet', `Не помещаются на лист (${over.length}): ${shown}${over.length > 4 ? ' и ещё ' + (over.length - 4) : ''}. Уменьшите изделие или смените размер листа в справочнике`);
  }

  // ── 2. пересечения в закрытом виде
  const allowed = (a, b) => {
    const glassy = p => p.mat === 'glass' || p.mat === 'mirror';
    if ((glassy(a) || glassy(b)) && a.group && b.group && a.group.id === b.group.id) return true; // стекло или зеркало в своём фасаде
    const back = p => p.name === 'Задняя стенка' && p.grooves !== undefined;
    const grooved = p => p.grooves.some(g => g.note === 'паз под ХДФ');
    return (back(a) && grooved(b)) || (back(b) && grooved(a)); // ХДФ стоит в пазу
  };
  const L = parts.map(lo3), H = parts.map(hi3), pen = 0.5;
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    if (allowed(parts[i], parts[j])) continue;
    if ([0, 1, 2].every(k => Math.min(H[i][k], H[j][k]) - Math.max(L[i][k], L[j][k]) > pen)) add('error', 'overlap', `Детали пересекаются: ${nm(parts[i])} и ${nm(parts[j])}`, [parts[i], parts[j]]);
  }

  // ── 3. отверстия внутри детали
  const faces = [], edges = []; // отверстия с мировыми координатами
  for (const p of parts) for (const h of p.holes) {
    const w = holeWorld(p, h), r = h.d / 2, rec = { p, h, ...w };
    if (isFace(h)) {
      faces.push(rec);
      if (h.u < r - 0.01 || h.u > p.L - r + 0.01 || h.v < r - 0.01 || h.v > p.W - r + 0.01) add('error', 'hole-out', `${nm(p)}: отверстие Ø${h.d} («${h.note}») выходит за край детали (${h.u}; ${h.v})`, [p]);
      if (h.h !== 'скв.') {
        const left = p.T - h.h;
        if (left < 1.5) add('error', 'hole-deep', `${nm(p)}: отверстие Ø${h.d}×${h.h} («${h.note}») оставляет ${Math.round(left * 10) / 10} мм материала`, [p]);
        else if (left < 3) add('warn', 'hole-deep', `${nm(p)}: отверстие Ø${h.d}×${h.h} («${h.note}») оставляет всего ${left} мм материала`, [p]);
      }
    } else {
      edges.push(rec);
      const along = h.f === 'w1' || h.f === 'w2' ? h.v : h.u, ext = h.f === 'w1' || h.f === 'w2' ? p.W : p.L, deep = h.f === 'w1' || h.f === 'w2' ? p.L : p.W;
      if (along < r - 0.01 || along > ext - r + 0.01) add('error', 'hole-out', `${nm(p)}: отверстие в торце Ø${h.d} («${h.note}») вне детали (${along} из ${ext})`, [p]);
      if (h.h > deep) add('error', 'hole-deep', `${nm(p)}: отверстие в торце глубже детали (${h.h} > ${deep})`, [p]);
      if (h.d > p.T - 4) add('error', 'hole-out', `${nm(p)}: отверстие в торце Ø${h.d} не помещается в толщину ${p.T}`, [p]);
    }
  }
  // сквозное отверстие с двух пластей в одной точке: глубины не должны сходиться
  for (const a of faces) for (const b of faces) {
    if (a.p !== b.p || a.h === b.h || a.h.f !== 'A' || b.h.f !== 'B') continue;
    if (Math.abs(a.h.u - b.h.u) < (a.h.d + b.h.d) / 4 && Math.abs(a.h.v - b.h.v) < (a.h.d + b.h.d) / 4 && a.h.h !== 'скв.' && b.h.h !== 'скв.' && a.h.h + b.h.h >= a.p.T) add('error', 'hole-through', `${nm(a.p)}: отверстия с двух сторон в одной точке просверлят деталь насквозь`, [a.p]);
  }

  // ── 4. ответные отверстия и крепёжные пары
  const pairs = []; // [деталь пласти, деталь торца]
  const FAM = [['конфирмат', 'конфирмат'], ['шкант', 'шкант'], ['минификс: штифт', 'минификс: торец']];
  for (const [fn, en] of FAM) {
    const fs = faces.filter(r => r.h.note === fn), es = edges.filter(r => r.h.note === en), used = new Set();
    for (const f of fs) {
      let hit = null;
      for (const e of es) {
        if (used.has(e) || e.p === f.p || Math.abs(dot(f.dir, e.dir)) < 0.999) continue;
        if (len(cross(sub(e.pos, f.pos), f.dir)) > TOL || !inBox(e.pos, f.p, TOL + 0.5)) continue;
        hit = e; break;
      }
      if (hit) { used.add(hit); pairs.push([f.p, hit.p]); }
      else add('error', 'mate', `${nm(f.p)}: «${fn}» в точке (${f.h.u}; ${f.h.v}) без ответного отверстия в торце`, [f.p]);
    }
    for (const e of es) if (!used.has(e)) add('error', 'mate', `${nm(e.p)}: отверстие в торце «${en}» без пары в пласти`, [e.p]);
  }
  // эксцентрик лежит на оси торцового отверстия на расстоянии 34 мм от торца
  for (const c of faces.filter(r => r.h.note === 'минификс: эксцентрик')) {
    const mid = [...c.pos]; mid[AX[c.p.plane].n] = c.p.c[AX[c.p.plane].n]; // ось эксцентрика пересекает торцовое отверстие на середине толщины
    const ok = edges.some(e => e.h.note === 'минификс: торец' && e.p === c.p && len(cross(sub(mid, e.pos), e.dir)) <= TOL && Math.abs(dot(sub(mid, e.pos), e.dir) - 34) <= TOL);
    if (!ok) add('error', 'mate', `${nm(c.p)}: эксцентрик Ø15 не лежит на оси торцового отверстия (нужно 34 мм от торца)`, [c.p]);
  }

  // ── полкодержатели: четыре под каждой съёмной полкой
  const pins = faces.filter(r => r.h.note === 'полкодержатель');
  const shelves = parts.filter(p => (p.name === 'Полка съёмная' || p.name === 'Полка стеклянная') && !p.group);
  const pinned = new Map(); // полка → опоры
  for (const s of shelves) {
    const l = lo3(s), h = hi3(s), yPin = l[1] - 5, sup = new Set();
    const po = HW.pin.offset;
    for (const [x, z] of [[l[0], l[2] + po], [l[0], h[2] - po], [h[0], l[2] + po], [h[0], h[2] - po]]) {
      const hit = pins.find(r => Math.abs(r.pos[1] - yPin) <= TOL && Math.abs(r.pos[2] - z) <= 22 && Math.abs(r.pos[0] - x) <= 2.5); // пара точек может быть сдвинута вдоль глубины, чтобы не попасть против гнезда эксцентрика
      if (!hit) add('error', 'shelf-pin', `${nm(s)} на высоте ${Math.round(l[1])} мм: нет отверстия под полкодержатель (x=${Math.round(x)}, z=${Math.round(z)})`, [s]);
      else sup.add(hit.p);
    }
    pinned.set(s, [...sup]);
  }

  // ── 6. фурнитура: счётчики сходятся с присадкой
  const hwSum = k => (spec.hwx || []).filter(e => e.kind === k).reduce((a, e) => a + e.qty, 0);
  const cnt = (note, pred = () => true) => faces.concat(edges).filter(r => r.h.note === note && pred(r)).length;
  const eq = (code, what, have, want) => { if (have !== want) add('error', code, `${what}: в списке фурнитуры ${have}, по присадке и деталям ${want}`); };
  eq('count-confirmat', 'Конфирматы', hwSum('confirmat'), cnt('конфирмат', r => isFace(r.h)));
  eq('count-minifix', 'Эксцентрики', hwSum('minifix'), cnt('минификс: эксцентрик'));
  eq('count-dowel', 'Шканты', hwSum('dowel'), cnt('шкант', r => !isFace(r.h)));
  eq('count-pin', 'Полкодержатели', hwSum('shelfPin'), 4 * shelves.length);
  const rods = extras.filter(e => e.name === 'Штанга');
  eq('count-rod', 'Штанги', hwSum('rod'), rods.length);
  eq('count-rodholder', 'Штангодержатели', hwSum('rodHolder'), 2 * rods.length);
  eq('count-legs', 'Опоры', hwSum('leg'), extras.filter(e => e.name === 'Ножка').length);
  const doors = parts.filter(p => p.name === 'Фасад двери' || p.name === 'Фасад откидной');
  const cups = faces.filter(r => r.h.note === 'чашка петли');
  eq('count-hinge', 'Петли', hwSum('hinge'), cups.length);
  for (const d of doors) {
    const mine = cups.filter(r => r.p === d).length, want = d.name === 'Фасад откидной' ? (d.L > 900 ? 3 : 2) : hingeCount(d.W);
    if (mine !== want) add('error', 'hinge-count', `${nm(d)}: ${mine} петель, по высоте нужно ${want}`, [d]);
  }
  // чашка на расстоянии cupEdge от края двери (по параметрам модели: обычная или полунакладная петля)
  for (const d of doors) for (const cup of cups.filter(r => r.p === d)) {
    const along = d.name === 'Фасад откидной' ? cup.h.v : cup.h.u, ext = d.name === 'Фасад откидной' ? d.W : d.L, e = Math.min(along, ext - along);
    const ok = d.name === 'Фасад откидной' ? Math.abs(e - HW.hingeFlap.cupEdge) <= 0.6 : [HW.hinge, HW.hingeHalf].some(h => Math.abs(e - h.cupEdge) <= 0.6);
    if (!ok) add('error', 'hinge-cup', `${nm(d)}: чашка в ${Math.round(e * 10) / 10} мм от края, по модели петли должно быть ${(d.name === 'Фасад откидной' ? HW.hingeFlap : HW.hinge).cupEdge} мм`, [d]);
  }
  // планки петель: две на чашку, на той опоре, к которой дверь примыкает петельной стороной
  const plateHoles = faces.filter(r => r.h.note === 'планка петли');
  for (const d of doors.filter(p => p.name === 'Фасад двери')) for (const cup of cups.filter(r => r.p === d)) {
    const hpSets = [HW.hinge, HW.hingeHalf];
    // отверстия планок на одной опоре (деталь и x), в нужных z и на расстоянии от оси петли; у общей перегородки рядом могут стоять планки соседней секции
    const groups = new Map();
    for (const r of plateHoles) {
      if (Math.abs(r.pos[0] - cup.pos[0]) > P.thickness + 25) continue;
      const dy = r.pos[1] - cup.pos[1];
      if (!hpSets.some(hp => Math.abs(r.pos[2] - (spec.meta.D / 2 - hp.plateSetback)) <= TOL && Math.abs(Math.abs(dy) - hp.plateSpacing / 2) <= TOL)) continue;
      const k = `${idx.get(r.p)}|${Math.round(r.pos[0] * 2)}`, g = groups.get(k) || groups.set(k, { up: false, down: false }).get(k);
      if (dy > 0) g.up = true; else g.down = true;
    }
    if (![...groups.values()].some(g => g.up && g.down)) add('error', 'hinge-plate', `${nm(d)}: у петли на высоте ${Math.round(cup.pos[1])} мм нет парных отверстий под планку на опоре`, [d]);
  }
  // откидные и подъёмные: планка на каждую чашку, крепления стабилизаторов и газлифтов
  const flaps = doors.filter(p => p.name === 'Фасад откидной'), flapPlates = faces.filter(r => r.h.note === 'планка петли откидного');
  for (const d of flaps) for (const cup of cups.filter(r => r.p === d)) {
    const hit = [-HW.hingeFlap.plateSpacing / 2, HW.hingeFlap.plateSpacing / 2].every(dx => flapPlates.some(r => Math.abs(r.pos[0] - (cup.pos[0] + dx)) <= TOL && Math.abs(r.pos[2] - (spec.meta.D / 2 - HW.hingeFlap.plateSetback)) <= TOL));
    if (!hit) add('error', 'flap-plate', `${nm(d)}: у петли на ${Math.round(cup.pos[0])} мм нет пары отверстий под планку на опорной панели`, [d]);
  }
  eq('count-stay', 'Крепления стабилизаторов и газлифтов', cnt('крепление стабилизатора') + cnt('крепление газлифта'), 2 * (hwSum('stay') + hwSum('gasLift')));
  // направляющие: на каждый ящик 6 отверстий и пара направляющих
  const drawerIds = [...new Set(parts.filter(p => p.group && p.group.type === 'slide' && p.name === 'Боковина ящика').map(p => p.group.id))];
  eq('count-slide', 'Направляющие', hwSum('slide'), drawerIds.length);
  const mounts = faces.filter(r => r.h.note === 'направляющая ящика'), sx = HW.slide.gap / 2 + 4; // отверстия соседней секции на другой стороне перегородки дальше
  const drawerMounts = new Map();
  for (const id of drawerIds) {
    const gp = parts.filter(p => p.group && p.group.id === id && p.asm === 'drawerBox'), l = [1e9, 1e9, 1e9], h = [-1e9, -1e9, -1e9];
    for (const p of gp) { const a = lo3(p), b = hi3(p); for (let k = 0; k < 3; k++) { l[k] = Math.min(l[k], a[k]); h[k] = Math.max(h[k], b[k]); } }
    const mine = mounts.filter(r => r.pos[1] >= l[1] - 2 && r.pos[1] <= h[1] + 2 && r.pos[2] >= l[2] - 1 && r.pos[2] <= h[2] + 1 && r.pos[0] >= l[0] - sx && r.pos[0] <= h[0] + sx);
    drawerMounts.set(id, mine);
    if (mine.length !== 6) add('error', 'slide-mount', `Ящик ${id}: ${mine.length} отверстий под направляющие вместо 6`, gp.slice(0, 1));
  }
  const slide = HW.slide;
  const rear = (() => { const b = parts.find(p => p.name === 'Задняя стенка'); return b ? b.c[2] + b.T / 2 : sideL ? lo3(sideL)[2] : -1e9; })();
  for (const id of drawerIds) {
    const gp = parts.filter(p => p.group && p.group.id === id), box = gp.filter(p => p.name === 'Боковина ящика'), bk = gp.find(p => p.name === 'Задняя стенка ящика');
    if (box[0] && !HW.slide.lens.includes(Math.round(box[0].W))) add('error', 'slide-len', `Ящик ${id}: длина направляющей ${Math.round(box[0].W)} мм не из списка модели (${HW.slide.lens.join(', ')})`, [box[0]]);
    for (const b of box) if (lo3(b)[2] < rear - 0.01) add('error', 'slide-depth', `Ящик ${id}: короб заходит за заднюю стенку шкафа`, [b]);
    if (bk && box.length === 2) {
      const outer = Math.abs(box[0].c[0] - box[1].c[0]) + box[0].T, sec = spec.meta.sections[(box[0].sec || 1) - 1];
      const spacers = parts.filter(p => p.name === 'Проставка под направляющие' && p.sec === box[0].sec);
      const open = sec.w - (spacers.length ? 2 * P.thickness : 0);
      if (Math.abs(open - outer - slide.gap) > 0.6) add('error', 'slide-gap', `Ящик ${id}: ширина короба ${outer} мм при проёме ${open} мм, а зазор направляющих должен быть ${slide.gap} мм`, [box[0]]);
    }
  }

  // ── 7. функциональные правила
  if (P.push && (P.handle !== 'none' || P.hinge !== 'plain')) add('error', 'push', 'Push-to-open: нужны фасады без ручек и петли без доводчика (доводчик гасит толчок)');
  if (P.push && P.slide === 'ballSoft') add('error', 'push', 'Push-to-open: направляющие с доводчиком не выталкивают ящик');
  const load = P.shelfLoad || DEFAULT_LOAD;
  for (const p of parts) {
    if (/^Полка (съёмная|стационарная|антресоли|зоны)$/.test(p.name)) {
      const span = maxShelfSpan(p.T, load);
      if (p.L > span) { const d = shelfDeflection({ L: p.L, depth: p.W, T: p.T, load }); add('warn', 'sag', `${nm(p)}: пролёт ${Math.round(p.L)} мм, ЛДСП ${p.T} мм прогнётся на ${d.toFixed(1).replace('.', ',')} мм при нагрузке ${load} кг/м² (допустимо ${(p.L / SAG_DIV).toFixed(1).replace('.', ',')} мм; предел пролёта ${Math.floor(span / 10) * 10} мм)`, [p]); }
    }
    if (p.name === 'Полка стеклянная' && p.L > 600) add('warn', 'sag', `${nm(p)}: стекло 6 мм с пролётом ${Math.round(p.L)} мм (больше 600) прогнётся под нагрузкой: нужна опора или толще`, [p]);
    if (p.name === 'Фасад двери' && p.L > 600) add('warn', 'wide-door', `${nm(p)}: дверь шире 600 мм (${Math.round(p.L)}), будет провисать на петлях`, [p]);
  }
  // фасады: рамка, зазоры, вес
  for (const d of doors) {
    if (d.mill && Math.min(...d.mill.window) < 60) add('error', 'frame', `${nm(d)}: рамочный фасад ${Math.round(d.L)}×${Math.round(d.W)} мм: рамка ${d.mill.frameW} мм оставляет окно ${Math.round(Math.min(...d.mill.window))} мм (нужно от 60), сделайте фасад шире или гладкий`, [d]);
  }
  const DENS = label => (/МДФ/.test(label) ? 750 : 650), M2 = (l, w) => (l * w) / 1e6;
  for (const d of doors) {
    const gid = d.group.id, ins = parts.filter(p => p.group && p.group.id === gid && p !== d);
    let kg = M2(d.L, d.W) * (d.T / 1000) * DENS(d.label);
    if (d.style === 'glass' && d.mill) kg -= M2(...d.mill.window) * (d.T / 1000) * DENS(d.label);
    for (const p of ins) if (p.mat === 'glass' || p.mat === 'mirror') kg += M2(p.L, p.W) * (p.T / 1000) * 2500;
    const hinges = cups.filter(r => r.p === d).length, limit = hinges * HW.hinge.loadKg;
    if (kg > 2 * limit) add('error', 'door-weight', `${nm(d)}: масса около ${Math.round(kg * 10) / 10} кг на ${hinges} петлях (до ${limit} кг): не удержат даже с запасом`, [d]);
    else if (kg > limit) add('warn', 'door-weight', `${nm(d)}: масса около ${Math.round(kg * 10) / 10} кг больше допустимых ${limit} кг на ${hinges} петлях: добавьте петли или облегчите фасад`, [d]);
  }
  for (const id of new Set(parts.filter(p => p.group && p.group.type === 'slidex').map(p => p.group.id))) {
    const ins = parts.find(p => p.group && p.group.id === id && p.name === 'Вставка двери-купе'), dens = ins.mat === 'front' ? DENS(ins.label) : 2500;
    const kg = M2(ins.L, ins.W) * (ins.T / 1000) * dens + (2 * (ins.L + ins.W) / 1000) * 1.2; // + алюминиевый профиль ~1,2 кг/м
    if (kg > HW.kupe.loadKg) add('warn', 'kupe-weight', `Полотно купе ${id}: масса около ${Math.round(kg)} кг больше допустимых ${HW.kupe.loadKg} кг на ролики`, [ins]);
  }
  // зазоры между соседними фасадами одной плоскости: 1,5–6 мм
  const fronts = parts.filter(p => p.mat === 'front' && p.plane === 'xy' && p.group && (p.group.type === 'hinge' || p.group.type === 'slide'));
  for (let i = 0; i < fronts.length; i++) for (let j = i + 1; j < fronts.length; j++) {
    const a = fronts[i], b = fronts[j];
    if (Math.abs(a.c[2] - b.c[2]) >= 1) continue;
    const la = lo3(a), ha = hi3(a), lb = lo3(b), hb = hi3(b);
    const oy = Math.min(ha[1], hb[1]) - Math.max(la[1], lb[1]), ox = Math.min(ha[0], hb[0]) - Math.max(la[0], lb[0]);
    const gx = Math.max(la[0], lb[0]) - Math.min(ha[0], hb[0]), gy = Math.max(la[1], lb[1]) - Math.min(ha[1], hb[1]);
    const gap = oy > 5 && gx > -0.5 && gx <= 10 ? gx : ox > 5 && gy > -0.5 && gy <= 10 ? gy : null;
    if (gap === null) continue;
    if (gap < 1.5) add('error', 'front-gap', `Фасады ${nm(a)} и ${nm(b)}: зазор ${Math.round(gap * 10) / 10} мм меньше 1,5 мм, детали будут тереться`, [a, b]);
    else if (gap > 6) add('warn', 'front-gap', `Фасады ${nm(a)} и ${nm(b)}: зазор ${Math.round(gap * 10) / 10} мм больше 6 мм`, [a, b]);
  }
  // ящики: широкий короб на лёгких направляющих
  for (const id of drawerIds) {
    const box = parts.filter(p => p.group && p.group.id === id && p.name === 'Боковина ящика');
    if (box.length !== 2) continue;
    const outer = Math.abs(box[0].c[0] - box[1].c[0]) + box[0].T, lim = HW.slide.maxKg <= 20 ? 900 : 1200;
    if (outer > lim) add('warn', 'drawer-load', `Ящик ${id}: короб шириной ${Math.round(outer)} мм на направляющих до ${HW.slide.maxKg} кг будет перекашиваться (до ${lim} мм)`, [box[0]]);
  }
  if (spec.meta.H >= 1200 && !P.wallFix) add('warn', 'tip', `Изделие высотой ${Math.round(spec.meta.H)} мм без крепления к стене может опрокинуться: включите «Крепление к стене»`);

  // вырезы: внутри детали, не ближе 10 мм к краю, не задевают присадку, не пересекаются
  for (const p of parts) {
    const cs = p.cutouts || [];
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i], w = c.u1 - c.u0, h = c.v1 - c.v0;
      if (c.kind === 'notch') { if (w > p.L - 20 || h > p.W - 20) add('error', 'cutout', `${nm(p)}: выемка ${Math.round(w)}×${Math.round(h)} мм съедает деталь ${Math.round(p.L)}×${Math.round(p.W)}`, [p]); }
      else if (c.u0 < 10 - 0.01 || c.v0 < 10 - 0.01 || c.u1 > p.L - 10 + 0.01 || c.v1 > p.W - 10 + 0.01) add('error', 'cutout', `${nm(p)}: вырез ${Math.round(w)}×${Math.round(h)} мм ближе 10 мм к краю или выходит за деталь`, [p]);
      const near = (u, v, r) => Math.hypot(Math.max(c.u0 - u, 0, u - c.u1), Math.max(c.v0 - v, 0, v - c.v1)) < r + 2;
      for (const ho of p.holes) {
        const hit = isFace(ho) ? near(ho.u, ho.v, ho.d / 2)
          : (ho.f === 'w1' || ho.f === 'w2' ? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some(t => near(ho.f === 'w1' ? (ho.h * t) / 10 : p.L - (ho.h * t) / 10, ho.v, ho.d / 2)) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some(t => near(ho.u, ho.f === 'd1' ? (ho.h * t) / 10 : p.W - (ho.h * t) / 10, ho.d / 2)));
        if (hit) { add('error', 'cutout', `${nm(p)}: вырез задевает отверстие Ø${ho.d} («${ho.note}»)`, [p]); break; }
      }
      for (const g of p.grooves) if (c.v0 < g.at + g.w && c.v1 > g.at) { add('warn', 'cutout', `${nm(p)}: вырез пересекает паз`, [p]); break; }
      for (let j = i + 1; j < cs.length; j++) { const d = cs[j]; if (c.u0 < d.u1 && c.u1 > d.u0 && c.v0 < d.v1 && c.v1 > d.v0) add('error', 'cutout', `${nm(p)}: вырезы пересекаются`, [p]); }
    }
  }

  // ── 8. кинематика
  if (!opts.skipKin) for (const k of kinProblems(spec)) add('warn', 'kin', k.text);
  for (const [a, b] of closedOverlaps(spec)) add('error', 'closed-overlap', `В закрытом виде подвижная деталь пересекается с другой: ${a} и ${b}`, [a, b]);

  // ── 5 и 9. связность и порядок сборки
  const E = new Map(parts.map(p => [p, new Set()])), link = (a, b) => { if (a !== b && E.has(a) && E.has(b)) { E.get(a).add(b); E.get(b).add(a); } };
  for (const [a, b] of pairs) link(a, b);
  for (const [s, sup] of pinned) for (const p of sup) link(s, p);
  const NOTE = /крепится|устанавливается|вставка|клеится|прибивается/;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p.notes.some(n => NOTE.test(n))) continue;
    for (let j = 0; j < parts.length; j++) if (j !== i && touch(p, parts[j], TOL - 0.4) && !(p.group && parts[j].group && p.group.id !== parts[j].group.id)) link(p, parts[j]);
  }
  // дверь держится на опоре, где стоят планки её петель
  const plates = extras.filter(e => e.name === 'Планка петли');
  for (const d of doors) {
    const l = lo3(d), h = hi3(d);
    for (const pl of plates) {
      if (pl.c[0] < l[0] - 30 || pl.c[0] > h[0] + 30 || pl.c[1] < l[1] - 5 || pl.c[1] > h[1] + 5) continue;
      const box = { c: pl.c, plane: 'xy', L: pl.s[0], W: pl.s[1], T: pl.s[2], name: 'планка' };
      for (const p of parts) if (!p.group && touch(box, p, TOL - 0.4)) link(d, p);
    }
  }
  // ящик держится на опорах, где стоят его направляющие
  for (const id of drawerIds) {
    const sides = parts.filter(p => p.group && p.group.id === id && p.name === 'Боковина ящика');
    for (const m of drawerMounts.get(id) || []) for (const s of sides) link(s, m.p);
  }
  // полотна купе висят на верхнем рельсе под крышкой
  const topP = parts.find(p => p.name === 'Крышка');
  for (const p of parts) if (p.group && p.group.type === 'slidex' && topP) link(p, topP);
  // цокольная планка стоит на клипсах, которые цепляются за ножки под дном
  for (const p of parts) if (p.name === 'Цокольная планка') for (const o of parts) if (o.name === 'Дно') link(p, o);
  // земля: детали на полу и на ножках
  const grounded = new Set(), legs = extras.filter(e => e.name === 'Ножка');
  for (const p of parts) {
    if (p.group) continue;
    const y0 = lo3(p)[1];
    if (Math.abs(y0) <= TOL || (legs.length && legs.some(e => Math.abs(e.c[1] + e.len / 2 - y0) <= TOL && inBox([e.c[0], y0, e.c[2]], p, TOL)))) grounded.add(p);
  }
  // достижимость от земли
  const seen = new Set(grounded), q = [...grounded];
  while (q.length) for (const n of E.get(q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); }
  for (const p of parts) if (!seen.has(p)) add('error', 'floating', `${nm(p)}: деталь ни к чему не крепится (висит в воздухе)`, [p]);
  // порядок: на своём этапе деталь должна касаться уже собранного; коробы ящиков собираются отдельно и ставятся целиком
  const done = new Set([...grounded].filter(p => p.asm === 'base' || p.asm === 'carcass'));
  for (const p of parts) if (p.asm === 'drawerBox') done.add(p);
  for (const st of STAGES) {
    const here = parts.filter(p => p.asm === st && !done.has(p));
    let grew = true;
    while (grew) { grew = false; for (const p of here) if (!done.has(p) && [...E.get(p)].some(n => done.has(n) && (stageIx(n) <= STAGES.indexOf(st) || n.asm === 'drawerBox'))) { done.add(p); grew = true; } }
    for (const p of here) if (!done.has(p) && seen.has(p)) add('error', 'order', `${nm(p)}: на этапе «${st}» не к чему крепить: соседние детали ещё не собраны`, [p]);
  }
  // короб ящика собирается сам по себе
  for (const id of drawerIds) {
    const bx = parts.filter(p => p.group && p.group.id === id && p.asm === 'drawerBox'), r = new Set([bx[0]]), st = [bx[0]];
    while (st.length) for (const n of E.get(st.pop())) if (bx.includes(n) && !r.has(n)) { r.add(n); st.push(n); }
    if (r.size !== bx.length) add('error', 'drawer-box', `Ящик ${id}: короб не скреплён между собой (${r.size} из ${bx.length} деталей)`);
  }
  // фурнитура этапа должна иметь, где применяться
  for (const e of spec.hwx || []) {
    if (!STAGES.includes(e.stage)) add('error', 'stage', `«${e.name}»: неизвестный этап ${e.stage}`);
    else if (e.stage !== 'final' && e.stage !== 'handles' && !parts.some(p => p.asm === e.stage) && !extras.some(x => x.asm === e.stage)) add('error', 'stage', `«${e.name}»: этап «${e.stage}» без деталей`);
  }
  return out;
}

/** Только ошибки и предупреждения, достойные панели конструктора (без кинематики: её показывает своя панель). */
export const panelIssues = list => list.filter(f => f.code !== 'kin' && (f.level === 'error' || ['sag', 'wide-door', 'tip', 'frame', 'front-gap', 'door-weight', 'drawer-load', 'cutout', 'sheet'].includes(f.code)));
