// Фурнитура: выбор моделей из справочника и список покупок. Без DOM: работает и в node.
import { STAGES } from './model.js';
import { hwPrice } from './catalog.js';
import { defaultHw, mergeParams } from './hwparams.js';

const SMALL = new Set(['confirmat', 'minifix', 'dowel', 'shelfPin', 'screw', 'wallDowel']); // мелкий крепёж: берётся с запасом
const CUT = new Set(['rod', 'kupeRail', 'kupeProfile']); // режется из хлыстов
const KIND_ORDER = ['confirmat', 'minifix', 'dowel', 'glue', 'screw', 'shelfPin', 'bracket', 'leg', 'rod', 'rodHolder', 'hinge', 'slide', 'gasLift', 'stay', 'pushLatch', 'handle', 'kupeRail', 'kupeProfile', 'kupeRoller', 'wallFix', 'wallDowel', 'appliance', 'other'];
export const KIND_LABELS = { confirmat: 'Конфирматы', plug: 'Заглушки', hanger: 'Навесы', clip: 'Клипсы цоколя', minifix: 'Эксцентриковые стяжки', dowel: 'Шканты', screw: 'Саморезы и винты', glue: 'Клей', shelfPin: 'Полкодержатели', bracket: 'Уголки', leg: 'Опоры', rod: 'Штанги', rodHolder: 'Штангодержатели', hinge: 'Петли', slide: 'Направляющие ящиков', gasLift: 'Газлифты', stay: 'Стабилизаторы', pushLatch: 'Толкатели push-to-open', handle: 'Ручки', kupeRail: 'Рельсы купе', kupeProfile: 'Профили купе', kupeRoller: 'Ролики купе', wallFix: 'Крепление к стене', wallDowel: 'Дюбели', appliance: 'Техника и сантехника', other: 'Прочее' };
const LEN = /L=(\d+)/;
const SCREW = /^(Саморез|Винт)\s+([^\s(]+)/; // размер крепежа: одинаковые покупаются вместе, а назначение остаётся в примечании

/** Функциональный вариант позиции: по нему выбирается модель в справочнике ('' — вариантов нет). */
export function variantOf(e, P = {}) {
  const n = e.name;
  if (e.kind === 'hinge') { const f = /165°/.test(n) ? 'wide' : /без доводчика/.test(n) ? 'plain' : 'soft'; return /откидного/.test(n) ? 'flap' : /полунакладная/.test(n) ? `half-${f}` : f; }
  if (e.kind === 'slide') return /push-to-open/.test(n) ? 'push' : /скрытые/.test(n) ? 'hidden' : /роликовые/.test(n) ? 'roller' : /с доводчиком/.test(n) ? 'ballSoft' : 'ball';
  if (e.kind === 'handle') return /скоба/.test(n) ? 'bar' : /кнопка/.test(n) ? 'knob' : 'profile';
  if (e.kind === 'shelfPin') return /для стекла/.test(n) ? 'glass' : '';
  if (e.kind === 'kupeRail') return /верхний/.test(n) ? 'top' : 'bottom';
  if (e.kind === 'kupeProfile') return /вертикальный/.test(n) ? 'v' : 'h';
  void P;
  return '';
}
export const selKey = (kind, variant) => (variant ? `${kind}:${variant}` : kind);

/** Модели справочника, подходящие категории и варианту: сначала точно по варианту, затем без варианта. */
export function modelsFor(cat, kind, variant) {
  const all = (cat.fittings || []).filter(f => f.kind === kind);
  return [...all.filter(f => variant && f.variant === variant), ...all.filter(f => !f.variant)];
}
/** Выбранная в проекте модель (P.fittings[категория:вариант]) или первая подходящая. */
export function chooseModel(cat, P, kind, variant) {
  const list = modelsFor(cat, kind, variant), id = ((P && P.fittings) || {})[selKey(kind, variant)];
  return list.find(f => f.id === id) || list[0] || null;
}

/** Раскрой отрезков из хлыстов длиной stock (first-fit decreasing, рез kerf). Возвращает [{ cuts: [мм], left }]; отрезок длиннее хлыста — отдельный хлыст с over. */
export function cutStock(pieces, stock, kerf = 3) {
  const bins = [];
  for (const p of [...pieces].sort((a, b) => b - a)) {
    const bin = bins.find(b => !b.over && b.left >= p + (b.cuts.length ? kerf : 0));
    if (bin) { bin.left -= p + (bin.cuts.length ? kerf : 0); bin.cuts.push(p); }
    else bins.push({ cuts: [p], left: stock - p, over: p > stock });
  }
  return bins;
}

const money = v => Math.round(v * 100) / 100;

/**
 * Список покупок из spec.hwx. Линия: { kind, variant, title, brand, art, url, need, reserve, packs, buy, pack, unit, price, sum, stage, note, missing }.
 * need — нужно по расчёту, reserve — запас на мелочь, packs — упаковок (или хлыстов) к покупке, buy — штук в них, price — за упаковку.
 */
export function shoppingList(spec, cat, P = {}) {
  const groups = new Map();
  for (const e of spec.hwx || []) {
    const variant = variantOf(e, P), len = LEN.exec(e.name);
    const sz = e.kind === 'screw' ? SCREW.exec(e.name) : null;
    const key = CUT.has(e.kind) ? `${e.kind}|${variant}` : e.kind === 'slide' ? `${e.kind}|${variant}|${len ? len[1] : ''}` : sz ? `screw|${sz[1]}|${sz[2]}` : `${e.kind}|${e.name}`;
    const g = groups.get(key) || groups.set(key, { kind: e.kind, variant, names: new Set(), qty: 0, pieces: [], len: len ? +len[1] : 0, stage: e.stage, size: sz ? `${sz[1]} ${sz[2]}` : '', uses: new Set() }).get(key);
    if (sz) { const u = /\(([^)]+)\)/.exec(e.name); if (u) g.uses.add(u[1]); }
    g.names.add(e.name); g.qty += e.qty;
    if (STAGES.indexOf(e.stage) < STAGES.indexOf(g.stage)) g.stage = e.stage;
    if (CUT.has(e.kind) && len) for (let i = 0; i < e.qty; i++) g.pieces.push(+len[1]);
  }
  const lines = [];
  for (const g of groups.values()) {
    const m = chooseModel(cat, P, g.kind, g.variant), hwName = [...g.names][0];
    const unit = hwPrice(cat, hwName); // запасной источник: прежний справочник по префиксу названия
    let title = (m && m.name) || g.size || hwName, note = g.uses.size ? `для: ${[...g.uses].join(', ')}` : '', need = g.qty, reserve = 0, packs, pack = (m && m.pack) || 1;
    if (g.kind === 'slide') title += ` L=${g.len} мм`;
    else if (g.kind === 'handle' && /(\d+) мм/.test(hwName)) title += ` ${/(\d+) мм/.exec(hwName)[1]} мм`;
    if (CUT.has(g.kind) && g.pieces.length) {
      const stock = (m && m.stockLen) || 3000, bins = cutStock(g.pieces, stock, (cat.cut && cat.cut.kerf) || 3);
      need = g.pieces.length; packs = bins.length; pack = 1;
      title += ` (хлыст ${stock} мм)`;
      note = 'отрезки: ' + bins.map((b, i) => `${i + 1}: ${[...new Set(b.cuts)].map(c => `${c}×${b.cuts.filter(x => x === c).length}`).join(' + ')}${b.over ? ' (длиннее хлыста!)' : ''}`).join('; ');
    } else {
      if (SMALL.has(g.kind)) reserve = Math.max(2, Math.ceil(need * 0.1));
      packs = Math.ceil((need + reserve) / pack);
    }
    const price = m && m.price > 0 ? m.price : unit ? money(unit * pack) : null;
    lines.push({ kind: g.kind, variant: g.variant, title, brand: (m && m.brand) || '', art: (m && m.art) || '', url: (m && m.url) || '', need, reserve, packs, buy: packs * pack, pack, unit: CUT.has(g.kind) ? 'хлыст' : pack > 1 ? 'уп.' : 'шт', price, sum: money(packs * (price || 0)), stage: g.stage, note, missing: price == null });
  }
  return lines.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.title.localeCompare(b.title, 'ru'));
}

const clampMill = m => ({ ...m, frameW: Math.min(120, Math.max(30, m.frameW)), recessDepth: Math.max(1, m.recessDepth), cornerR: Math.max(0, m.cornerR), glassOverlap: Math.min(m.frameW - 10, Math.max(0, m.glassOverlap)), glassChamfer: Math.max(0, m.glassChamfer), glassCornerR: Math.max(0, m.glassCornerR) });
/**
 * Параметры присадки выбранных моделей: петля (по P.hinge), направляющие (по P.slide или push), полкодержатель, ролики купе.
 * Передаётся в buildSpec(P, { hw }) и checkBuild(spec, P, { hw }).
 */
export function resolveHw(cat, P) {
  const d = defaultHw(P);
  const hingeVariant = P.hinge === 'wide' ? 'wide' : P.hinge === 'plain' ? 'plain' : 'soft';
  const slideVariant = P.push ? 'push' : P.slide;
  const m = (kind, variant) => chooseModel(cat, P, kind, variant);
  const hm = m('hinge', hingeVariant), hhm = m('hinge', `half-${hingeVariant}`), hfm = m('hinge', 'flap'), sm = m('slide', slideVariant) || m('slide', P.slide), pm = m('shelfPin', ''), km = m('kupeRoller', '');
  return {
    hinge: mergeParams(d.hinge, hm && hm.params, 'hinge'),
    hingeHalf: mergeParams(d.hinge, hhm && hhm.params, 'hinge'), // полунакладные петли на перегородках
    hingeFlap: mergeParams(d.hinge, hfm && hfm.params, 'hinge'), // петли откидных и подъёмных фасадов
    slide: mergeParams(d.slide, sm && sm.params, 'slide'),
    pin: mergeParams(d.pin, pm && pm.params, 'shelfPin'),
    kupe: mergeParams(d.kupe, km && km.params, 'kupeRoller'),
    mill: clampMill(mergeParams(d.mill, cat.milling, 'mill')),
  };
}
