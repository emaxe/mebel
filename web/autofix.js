// Automatic repair of what the warnings panel reports: overlapping items, hinges on shelves, no room for a door,
// shallow drawers, and doors/drawers that stop against something when opened. No DOM.
import { buildSpec, isDrawer } from './model.js';
import { kinProblems } from './kinematics.js';
import { checkBuild, panelIssues } from './check.js';
import { normalize, innerH, rulesOf } from './rules.js';

export { kinProblems };

const hOf = (it, t) => (isDrawer(it.type) ? it.h : it.type === 'glass' ? 6 : it.type === 'rod' ? 0 : t);

/** Slide items apart so none overlaps another (up first, then back down from the top). Returns true if anything moved. */
function separate(s, ih, t) {
  const list = s.items.filter(it => it.type !== 'rod').sort((a, b) => a.y - b.y);
  const before = list.map(it => it.y);
  let top = 0;
  for (const it of list) { if (it.y < top) it.y = top; top = it.y + hOf(it, t); }
  let lim = ih;
  for (const it of [...list].reverse()) { if (it.y + hOf(it, t) > lim) it.y = Math.max(0, lim - hOf(it, t)); lim = it.y; }
  return list.some((it, i) => it.y !== before[i]);
}

const clone = o => JSON.parse(JSON.stringify(o));
const replace = (P, Q) => { for (const k of Object.keys(P)) delete P[k]; Object.assign(P, Q); };
/** Оценка конструкции. base — оценка до правки: если задан, дорогую кинематику не пересчитываем, а берём её оттуда (быстрый отбор). */
function evaluate(P, opts, base = null) {
  const spec = buildSpec(P, opts), kin = base ? base.kin : kinProblems(spec);
  // замечания проверки собираемости, которые видит пользователь (рамка, вес, прогиб, крепление к стене…)
  const issues = panelIssues(checkBuild(spec, P, { skipKin: true, hw: opts && opts.hw }));
  return { spec, kin, issues, score: spec.warnings.length + kin.length + issues.length };
}
const secIdx = w => { const m = /Секция (\d+)/.exec(w); return m ? +m[1] - 1 : -1; };

function candidates(P, ev) {
  const out = [], seen = new Set();
  let kinCand = false; // кандидаты, рождённые кинематикой, оцениваются полностью
  const add = (text, fn) => { if (!seen.has(text)) { seen.add(text); out.push({ text, fn, kin: kinCand }); } };
  for (const w of ev.spec.warnings) {
    const i = secIdx(w), s = P.sections[i];
    if (!s) continue;
    if (/петля двери попадает/.test(w)) s.items.forEach((it, k) => { if (it.type !== 'rod' && it.type !== 'drawer') for (const d of [32, -32, 64, -64, 96, -96, 160, -160, 250, -250]) add(`Секция ${i + 1}: полка сдвинута на ${d > 0 ? '+' : ''}${d} мм`, Q => { Q.sections[i].items[k].y += d; }); });
    if (/встроенный ящик без двери/.test(w) && rulesOf(P).doors.includes('left')) add(`Секция ${i + 1}: добавлена дверь перед встроенными ящиками`, Q => { Q.sections[i].door = Q.sections[i].width >= 600 && rulesOf(Q).doors.includes('double') ? 'double' : 'left'; });
    if (/нет места для двери/.test(w)) {
      if (s.split > 0) add(`Секция ${i + 1}: убрана антресоль`, Q => { Q.sections[i].split = 0; });
      add(`Секция ${i + 1}: ящики перенесены за дверь`, Q => { Q.sections[i].drawerFronts = 'inset'; });
      add(`Секция ${i + 1}: дверь убрана (нет места)`, Q => { Q.sections[i].door = 'none'; });
    }
    if (/перекрываются/.test(w) && s.split > 0) for (const d of [50, -50, 100, -100, 150, -150]) add(`Секция ${i + 1}: антресоль ${d > 0 ? '+' : ''}${d} мм`, Q => { Q.sections[i].split += d; });
    if (/мала глубина/.test(w)) for (const d of [50, 100, 150, 200]) add(`Глубина изделия увеличена до ${P.depth + d} мм`, Q => { Q.depth += d; });
  }
  for (const f of ev.issues) {
    const m = /секция (\d+)/.exec(f.text), i = m ? +m[1] - 1 : -1, s = P.sections[i], R = rulesOf(P);
    if (f.code === 'tip') add('Включено крепление к стене', Q => { Q.wallFix = true; });
    if (f.code === 'drawer-load' && P.slide === 'roller') add('Направляющие шариковые вместо роликовых', Q => { Q.slide = 'ball'; });
    if (!s) continue;
    if (f.code === 'frame') add(`Секция ${i + 1}: фасад гладкий (рамка не помещается)`, Q => { Q.sections[i].frontStyle = 'flat'; });
    if (f.code === 'wide-door' || f.code === 'door-weight') {
      if ((s.door === 'left' || s.door === 'right') && R.doors.includes('double')) add(`Секция ${i + 1}: две створки вместо одной (дверь шире или тяжелее нормы)`, Q => { Q.sections[i].door = 'double'; });
      if (s.frontStyle === 'mirror' || s.frontStyle === 'glass') add(`Секция ${i + 1}: фасад гладкий (меньше вес)`, Q => { Q.sections[i].frontStyle = 'flat'; });
    }
    if (f.code === 'sag') {
      if (/стекло/.test(f.text)) add(`Секция ${i + 1}: стеклянные полки заменены на ЛДСП`, Q => { Q.sections[i].items.forEach(it => { if (it.type === 'glass') it.type = 'shelf'; }); });
      else if (P.thickness < 22) add('Толщина ЛДСП 22 мм (длинные полки не прогнутся)', Q => { Q.thickness = 22; });
    }
  }
  for (const w of ev.spec.warnings) {
    if (!/ручка-скоба .* не помещается/.test(w)) continue;
    const i = secIdx(w);
    for (const sz of [96, 128, 160, 192, 256]) if (sz < P.handleSize) add(`Межосевое ручки ${sz} мм`, Q => { Q.handleSize = sz; });
    add(`Секция ${i + 1}: ручки вертикально`, Q => { Q.handleOrient = 'v'; });
    add('Ручки-профили вместо скоб', Q => { Q.handle = 'profile'; });
  }
  kinCand = true;
  for (const k of ev.kin) {
    if (P.hinge === 'wide') add('Петли 110° вместо 165° (не упираются в соседей)', Q => { Q.hinge = Q.push ? 'plain' : 'soft'; });
    if (P.handle !== 'profile' && P.handle !== 'none') add('Ручки заменены на профиль (не торчат)', Q => { Q.handle = 'profile'; });
    if (P.handleOrient) add(`Ручки на дверях: ${P.handleOrient === 'v' ? 'горизонтально' : 'вертикально'}`, Q => { Q.handleOrient = Q.handleOrient === 'v' ? 'h' : 'v'; });
    if (P.handle !== 'none') add('Ручки убраны (открывание нажатием)', Q => { Q.handle = 'none'; });
    for (const si of new Set([k.sec - 1, (k.by?.sec || 0) - 1])) if (si >= 0 && P.sections[si] && P.sections[si].items.some(it => it.type === 'drawer')) {
      add(`Секция ${si + 1}: фасады ящиков ${P.sections[si].drawerFronts === 'overlay' ? 'внутри проёма' : 'накладные'}`, Q => { Q.sections[si].drawerFronts = Q.sections[si].drawerFronts === 'overlay' ? 'inset' : 'overlay'; });
    }
    if (k.by?.name === 'Пол' && P.base === 'none') for (const h of [60, 100]) add(`Основание: цоколь ${h} мм`, Q => { Q.base = 'plinth'; Q.plinth = h; });
    if (k.by?.name === 'Пол' && P.base !== 'none' && P.plinth < 120) add('Высота основания увеличена до 120 мм', Q => { Q.plinth = 120; });
  }
  return out;
}

/**
 * Один шаг подбора — одна оценка кандидата. Генератор уступает управление после каждой оценки: синхронный autoFix
 * прокручивает его до конца, autoFixAsync отдаёт поток странице между оценками и останавливается по бюджету времени.
 */
function* fixSteps(P, opts, deadline) {
  const log = [];
  normalize(P);
  const t = P.thickness, ih = innerH(P);
  P.sections.forEach((s, i) => { if (separate(s, ih, t)) log.push(`Секция ${i + 1}: элементы раздвинуты, чтобы не перекрываться`); });
  normalize(P);
  let ev = evaluate(P, opts), partial = false;
  // однотипные замечания по многим секциям чинятся разом, а не по одному за раунд
  const bulk = bulkFixes(P, ev);
  if (bulk.length) {
    const Q = clone(P); bulk.forEach(b => b.fn(Q)); normalize(Q);
    const e = evaluate(Q, opts);
    if (e.score < ev.score) { replace(P, Q); ev = e; log.push(...bulk.map(b => b.text)); }
  }
  rounds: for (let round = 0; round < 12 && ev.score > 0; round++) {
    const improving = [];
    for (const c of candidates(P, ev)) {
      if (Date.now() > deadline) { partial = true; break; }
      yield;
      const Q = clone(P); c.fn(Q); normalize(Q);
      let e; try { e = evaluate(Q, opts, c.kin ? null : ev); } catch { continue; } // кинематика считается только там, где правка её и касается
      if (e.score < ev.score) improving.push({ c, Q, e, fast: !c.kin });
    }
    improving.sort((x, y) => x.e.score - y.e.score);
    let best = null;
    for (const cand of improving) { // быстрый отбор подтверждаем полной оценкой
      if (cand.fast) { yield; try { cand.e = evaluate(cand.Q, opts); } catch { continue; } if (cand.e.score >= ev.score) continue; }
      best = cand; break;
    }
    if (!best) break;
    replace(P, best.Q); ev = best.e; log.push(best.c.text);
    if (partial) break;
  }
  return { log, partial, left: [...ev.spec.warnings, ...ev.kin.map(k => k.text), ...ev.issues.map(f => f.text)] };
}

/** Исправления, не зависящие друг от друга: применяются все сразу. */
function bulkFixes(P, ev) {
  const out = [], secs = code => [...new Set(ev.issues.filter(f => f.code === code).map(f => /секция (\d+)/.exec(f.text)).filter(Boolean).map(m => +m[1] - 1))].filter(i => P.sections[i]);
  if (ev.issues.some(f => f.code === 'tip') && !P.wallFix) out.push({ text: 'Включено крепление к стене', fn: Q => { Q.wallFix = true; } });
  const fr = secs('frame');
  if (fr.length) out.push({ text: `Секции ${fr.map(i => i + 1).join(', ')}: фасад гладкий (рамка не помещается)`, fn: Q => fr.forEach(i => { Q.sections[i].frontStyle = 'flat'; }) });
  return out;
}

/** Fix what can be fixed. Mutates P; returns { log: [what was done], left: [what remains], partial }. */
export function autoFix(P, opts = {}) {
  const g = fixSteps(P, opts, Infinity);
  let r;
  while (!(r = g.next()).done);
  return r.value;
}

/** То же без блокировки страницы: между оценками уступает поток; budgetMs — сколько времени можно потратить (по умолчанию 8 с). */
export async function autoFixAsync(P, opts = {}, { budgetMs = 8000 } = {}) {
  const g = fixSteps(P, opts, Date.now() + budgetMs);
  let r;
  while (!(r = g.next()).done) await new Promise(res => setTimeout(res, 0));
  return r.value;
}
