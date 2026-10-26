// Automatic repair of what the warnings panel reports: overlapping items, hinges on shelves, no room for a door,
// shallow drawers, and doors/drawers that stop against something when opened. No DOM.
import { buildSpec, isDrawer } from './model.js';
import { solve } from './kinematics.js';
import { normalize, innerH, rulesOf } from './rules.js';

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
function evaluate(P) {
  const spec = buildSpec(P), kin = kinProblems(spec);
  return { spec, kin, score: spec.warnings.length + kin.length };
}
const secIdx = w => { const m = /Секция (\d+)/.exec(w); return m ? +m[1] - 1 : -1; };

function candidates(P, ev) {
  const out = [], seen = new Set();
  const add = (text, fn) => { if (!seen.has(text)) { seen.add(text); out.push({ text, fn }); } };
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
  for (const k of ev.kin) {
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

/** Fix what can be fixed. Mutates P; returns { log: [what was done], left: [what remains] }. */
export function autoFix(P) {
  const log = [];
  normalize(P);
  const t = P.thickness, ih = innerH(P);
  P.sections.forEach((s, i) => { if (separate(s, ih, t)) log.push(`Секция ${i + 1}: элементы раздвинуты, чтобы не перекрываться`); });
  normalize(P);
  let ev = evaluate(P);
  for (let round = 0; round < 12 && ev.score > 0; round++) {
    let best = null;
    for (const c of candidates(P, ev)) {
      const Q = clone(P); c.fn(Q); normalize(Q);
      let e; try { e = evaluate(Q); } catch { continue; }
      if (e.score < ev.score && (!best || e.score < best.e.score)) best = { c, Q, e };
      if (best && best.e.score === 0) break;
    }
    if (!best) break;
    replace(P, best.Q); ev = best.e; log.push(best.c.text);
  }
  return { log, left: [...ev.spec.warnings, ...ev.kin.map(k => k.text)] };
}
