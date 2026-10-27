// Регрессии по результатам аудита: каждое исправление закреплено отдельным тестом.
import { describe, it, expect } from 'vitest';
import { makePreset, normalize, normalizeCutouts, fillItems, innerH, MIN_DRAWER_H } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { groupParts, nest, edgeSummary, toDXF } from '../web/export.js';
import { shoppingList, resolveHw, variantOf } from '../web/fittings.js';
import { DEFAULT_CATALOG, CATALOG_VERSION, sanitizeCatalog, sheetFor, isTextured } from '../web/catalog.js';
import { autoFix, autoFixAsync } from '../web/autofix.js';
import { extremeProject } from './helpers.js';

const clone = o => JSON.parse(JSON.stringify(o));
const cat = clone(DEFAULT_CATALOG);
const hwSum = (spec, re) => spec.hw.filter(([k]) => re.test(k)).reduce((a, [, q]) => a + q, 0);
const errs = (spec, P, o = {}) => [...new Set(checkBuild(spec, P, { skipKin: true, ...o }).filter(f => f.level === 'error').map(f => `${f.code}: ${f.text}`))];

describe('B1: список покупок содержит весь крепёж', () => {
  it('саморезы фасадов и дна ящиков, уголков, держателей, планок', () => {
    const P = makePreset('wardrobe'), sp = buildSpec(P);
    const drawers = sp.parts.filter(p => p.name === 'Боковина ящика').length / 2;
    expect(hwSum(sp, /^Саморез 4×25 \(фасад ящика\)/)).toBe(4 * drawers);
    expect(hwSum(sp, /^Саморез 3×16 \(дно ящика\)/)).toBeGreaterThanOrEqual(8 * drawers);
    expect(hwSum(sp, /^Саморез 4×16 \(мебельные уголки\)/)).toBe(2 * hwSum(sp, /^Уголок мебельный/));
    expect(hwSum(sp, /^Саморез 4×16 \(штангодержатель\)/)).toBe(2 * hwSum(sp, /^Штангодержатель/));
    expect(hwSum(sp, /^Саморез 3,5×16 \(планка петли\)/)).toBe(2 * hwSum(sp, /^Петля/));
    expect(hwSum(sp, /^Винт М4×\d+ \(ручка-скоба\)/)).toBe(2 * hwSum(sp, /^Ручка-скоба/));
  });
  it('профиль, карниз, купе, откидные, клей', () => {
    expect(hwSum(buildSpec(makePreset('tv')), /^Саморез 3×16 \(ручка-профиль\)/)).toBe(2 * hwSum(buildSpec(makePreset('tv')), /^Ручка-профиль/));
    const c = makePreset('wardrobe'); c.cornice = true;
    expect(hwSum(buildSpec(c), /\(карниз\)/)).toBeGreaterThan(4);
    expect(hwSum(buildSpec(makePreset('wardrobe', { doorType: 'sliding' })), /\(рельсы купе\)/)).toBeGreaterThan(0);
    const f = makePreset('tv'); f.sections[0].door = 'flapDown'; f.sections[0].width = 700;
    expect(hwSum(buildSpec(f), /\(крепление стабилизатора\)/)).toBe(8);
    expect(hwSum(buildSpec(makePreset('wardrobe', { joint: 'dowel' })), /^Клей ПВА/)).toBeGreaterThanOrEqual(1);
    expect(hwSum(buildSpec(makePreset('wardrobe', { joint: 'confirmat' })), /^Клей ПВА/)).toBe(0);
  });
  it('крепёж, названный в примечаниях деталей, есть в списке', () => {
    for (const [type, keep] of [['wardrobe', {}], ['dresser', {}], ['tv', {}]]) {
      const sp = buildSpec(makePreset(type, keep)), all = sp.hw.map(([k]) => k).join('|');
      const text = sp.parts.flatMap(p => p.notes).join(' ');
      if (/саморезами 4×25/.test(text)) expect(all).toMatch(/Саморез 4×25/);
      if (/саморезами 4×30/.test(text)) expect(all).toMatch(/Саморез 4×30/);
      if (/уголками/.test(text)) expect(all).toMatch(/Уголок мебельный/);
      if (/гвоздями\/саморезами/.test(text)) expect(all).toMatch(/Саморез 3×16 \(дно ящика\)/);
    }
  });
  it('одинаковые размеры саморезов покупаются одной строкой с назначениями', () => {
    const P = makePreset('wardrobe'), list = shoppingList(buildSpec(P), cat, P).filter(l => l.kind === 'screw');
    const sizes = list.map(l => l.title);
    expect(new Set(sizes).size).toBe(sizes.length);
    const s416 = list.find(l => l.title === 'Саморез 4×16');
    expect(s416.note).toMatch(/мебельные уголки/); expect(s416.note).toMatch(/штангодержатель/);
    expect(s416.buy).toBeGreaterThanOrEqual(s416.need + s416.reserve);
  });
});

describe('B2: этап крепежа по позже ставящейся детали', () => {
  it('перегородка↔крышка — на этапе крышки', () => {
    const sp = buildSpec(makePreset('wardrobe')), q = st => (sp.hwx.find(e => e.kind === 'confirmat' && e.stage === st) || { qty: 0 }).qty;
    expect(q('dividers')).toBe(6); expect(q('top')).toBe(12); expect(q('carcass')).toBe(6);
    const total = sp.hwx.filter(e => e.kind === 'confirmat').reduce((a, e) => a + e.qty, 0);
    expect(total).toBe(hwSum(sp, /^Конфирмат/));
  });
});

describe('B3: полунакладные и откидные петли', () => {
  it('в покупки идёт петля нужного варианта', () => {
    for (const [h, want] of [['soft', 'half-soft'], ['plain', 'half-plain'], ['wide', 'half-wide']]) {
      const P = makePreset('wardrobe', { hinge: h }), l = shoppingList(buildSpec(P), cat, P).filter(x => x.kind === 'hinge').map(x => x.variant);
      expect(l).toContain(want); expect(l).toContain(h);
    }
    const F = makePreset('tv'); F.sections[0].door = 'flapDown';
    expect(shoppingList(buildSpec(F), cat, F).some(x => x.variant === 'flap')).toBe(true);
    expect(variantOf({ kind: 'hinge', name: 'Петля полунакладная 110° без доводчика' })).toBe('half-plain');
  });
  it('параметры моделей применяются каждой петле отдельно', () => {
    const c = clone(cat); c.fittings.find(f => f.id === 'hinge-half').params = { cupEdge: 25 }; c.fittings.find(f => f.id === 'hinge-flap').params = { cupEdge: 24 };
    const P = makePreset('wardrobe'), hw = resolveHw(c, P);
    expect([hw.hinge.cupEdge, hw.hingeHalf.cupEdge, hw.hingeFlap.cupEdge]).toEqual([21.5, 25, 24]);
    const sp = buildSpec(P, { hw }), doors = sp.parts.filter(p => p.name === 'Фасад двери');
    const edge = d => { const h = d.holes.find(x => x.note === 'чашка петли'); return Math.min(h.u, d.L - h.u); };
    // секции 1 и 3 висят на боковинах (накладные), у двойной секции 2 одна створка на перегородке (полунакладная)
    expect(doors.some(d => edge(d) === 21.5)).toBe(true); expect(doors.some(d => edge(d) === 25)).toBe(true);
    expect(errs(sp, P, { hw })).toEqual([]);
    const F = makePreset('tv'); F.sections[0].door = 'flapDown'; F.sections[0].width = 700;
    const hf = resolveHw(c, F), sf = buildSpec(F, { hw: hf }), fl = sf.parts.find(p => p.name === 'Фасад откидной');
    expect(Math.min(...fl.holes.filter(h => h.note === 'чашка петли').map(h => Math.min(h.v, fl.W - h.v)))).toBe(24);
    expect(errs(sf, F, { hw: hf })).toEqual([]);
  });
  it('старый справочник: вариант half → half-soft и новые модели дописываются', () => {
    const old = clone(DEFAULT_CATALOG); old.version = 1; old.fittings = old.fittings.filter(f => f.id !== 'hinge-half-plain' && f.id !== 'glue'); old.fittings.find(f => f.id === 'hinge-half').variant = 'half';
    const c = sanitizeCatalog(old);
    expect(c.version).toBe(CATALOG_VERSION);
    expect(c.fittings.find(f => f.id === 'hinge-half').variant).toBe('half-soft');
    expect(c.fittings.some(f => f.id === 'hinge-half-plain')).toBe(true); expect(c.fittings.some(f => f.id === 'glue')).toBe(true);
    const same = sanitizeCatalog(c); expect(same.fittings.length).toBe(c.fittings.length); // повторно не дублируется
  });
});

describe('B4: ручка шире фасада', () => {
  const narrow = size => { const P = makePreset('wardrobe'); P.sections = [P.sections[1]]; P.sections[0].width = 300; P.sections[0].door = 'double'; P.handleOrient = 'h'; P.handle = 'bar'; P.handleSize = size; return P; };
  it('расчёт предупреждает, а не молчит', () => {
    expect(buildSpec(narrow(256)).warnings.join('\n')).toMatch(/ручка-скоба 256 мм не помещается/);
    expect(buildSpec(narrow(96)).warnings.join('\n')).not.toMatch(/ручка-скоба/);
  });
  it('автоисправление подбирает ручки', () => {
    const P = narrow(256); autoFix(P);
    expect(buildSpec(P).warnings.join('\n')).not.toMatch(/ручка-скоба/);
    expect(errs(buildSpec(P), P)).toEqual([]);
  });
});

describe('B5: низкие ящики', () => {
  it('высота ящика не меньше предела, ящиков не больше, чем влезает', () => {
    const P = makePreset('dresser'); P.sections[0].items = [{ type: 'drawer', y: 0, h: 80 }]; normalize(P);
    expect(P.sections[0].items[0].h).toBe(MIN_DRAWER_H);
    const Q = makePreset('dresser'); Q.height = 400; Q.plinth = 120; normalize(Q);
    const items = fillItems('drawers5', Q); expect(items.length).toBeLessThanOrEqual(Math.floor(innerH(Q) / MIN_DRAWER_H));
    expect(items.every(d => d.h >= MIN_DRAWER_H)).toBe(true);
  });
  it('стопка доверху не упирается коробом в крышку', () => {
    const P = makePreset('nightstand'); P.height = 400; P.base = 'none'; const ih = innerH(P), k = Math.floor(ih / MIN_DRAWER_H);
    P.sections[0].items = Array.from({ length: k }, (_, i) => ({ type: 'drawer', y: i * Math.floor(ih / k), h: Math.floor(ih / k) })); normalize(P);
    const sp = buildSpec(P); expect(errs(sp, P)).toEqual([]); expect(sp.warnings).toEqual([]);
  });
});

describe('B6: основание и зона не съедают изделие', () => {
  it('основание не больше «высота − 200»', () => {
    const P = makePreset('tv'); P.height = 300; P.base = 'legs'; P.plinth = 200; normalize(P);
    expect(P.plinth).toBe(100); expect(innerH(P)).toBeGreaterThanOrEqual(150 - 2 * P.thickness + 0);
  });
  it('зона на низкой секции отключается, нулевых деталей нет', () => {
    const P = makePreset('tv'); P.height = 300; P.base = 'legs'; P.plinth = 100; P.sections[0].zone = { pos: 'bottom', h: 150, split: 200, left: [{ type: 'shelf', y: 100 }], right: [] }; normalize(P);
    expect(P.sections[0].zone).toBeNull();
    expect(buildSpec(P).parts.every(p => p.L > 0 && p.W > 0)).toBe(true);
  });
});

describe('B7: сквозных отверстий не бывает', () => {
  it('случайные проекты с зонами и эксцентриками', () => {
    for (const seed of [335, 1504, 2120, 540, 968, 990, 750]) {
      const P = extremeProject(seed), sp = buildSpec(P);
      expect(checkBuild(sp, P, { skipKin: true }).filter(f => f.code === 'hole-through'), `seed ${seed}`).toEqual([]);
    }
  });
});

describe('B8: деталь не помещается на лист', () => {
  it('проверка говорит, какая деталь и какого размера', () => {
    let P = makePreset('wardrobe'); P.height = 2800; P.base = 'none'; P = normalize(P);
    const sp = buildSpec(P), G = groupParts(sp), N = nest(G, { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: 4, trim: 10, minOffcut: [300, 100] });
    const sheet = checkBuild(sp, P, { skipKin: true, N }).filter(f => f.code === 'sheet');
    expect(sheet.length).toBe(1); expect(sheet[0].text).toMatch(/Не помещаются на лист \(\d+\): №\d+ \(\d+×\d+ мм\)/);
    const ok = makePreset('wardrobe'); const s2 = buildSpec(ok);
    expect(checkBuild(s2, ok, { skipKin: true, N: nest(groupParts(s2), { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: 4, trim: 10, minOffcut: [300, 100] }) }).filter(f => f.code === 'sheet')).toEqual([]);
  });
});

describe('B9: кромка у выемок', () => {
  it('выемка срезает кромку по длине', () => {
    const P = makePreset('wardrobe'), m = () => edgeSummary(groupParts(buildSpec(P))).find(e => e.t === 2).m;
    const before = m(); P.cutouts = normalizeCutouts([{ part: 'Боковина левая', kind: 'notch', w: 300, h: 100, r: 0, corner: 'w1d2' }]);
    expect(before - m()).toBeCloseTo(0.3, 2);
  });
  it('вырез не у края кромку не меняет', () => {
    const P = makePreset('wardrobe'), m = () => edgeSummary(groupParts(buildSpec(P))).find(e => e.t === 2).m, before = m();
    P.cutouts = normalizeCutouts([{ part: 'Задняя стенка', kind: 'hole', w: 60, h: 40, r: 8, u: 400, v: 300 }]);
    expect(m()).toBe(before);
  });
});

describe('C1: планки петель у общей перегородки', () => {
  it('соседние секции с петлями на разной высоте не дают ложной ошибки', () => {
    const P = extremeProject(271), sp = buildSpec(P);
    expect(checkBuild(sp, P, { skipKin: true }).filter(f => f.code === 'hinge-plate')).toEqual([]);
  });
  it('настоящая потеря планки всё равно ловится', () => {
    const P = makePreset('wardrobe'), sp = buildSpec(P);
    const side = sp.parts.find(p => p.name === 'Боковина правая'); side.holes = side.holes.filter(h => h.note !== 'планка петли');
    expect(errs(sp, P).join('\n')).toMatch(/hinge-plate/);
  });
});

describe('D2: асинхронное автоисправление', () => {
  it('даёт тот же результат, что синхронное', async () => {
    const mk = () => makePreset('wardrobe', { hinge: 'wide', wallFix: false }), A = mk(), B = mk();
    const r1 = autoFix(A), r2 = await autoFixAsync(B);
    expect(B).toEqual(A); expect(r2.log).toEqual(r1.log); expect(r2.partial).toBe(false);
  });
  it('укладывается в бюджет времени и сообщает о неполном результате', async () => {
    const P = makePreset('wardrobe', { hinge: 'wide', wallFix: false }); P.sections[1].frontStyle = 'shaker'; P.sections[1].width = 300; P.sections[1].door = 'double';
    const t = Date.now(), r = await autoFixAsync(P, {}, { budgetMs: 1 });
    expect(Date.now() - t).toBeLessThan(3000);
    expect(typeof r.partial).toBe('boolean');
  });
});

describe('E3: DXF — структура файла', () => {
  const parse = spec => { const lines = Buffer.from(toDXF(spec)).toString('latin1').split(/\r?\n/); const pairs = []; for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i].trim(), lines[i + 1]]); return { lines, pairs }; };
  it('пары «код–значение», сущности, слои и дуги', () => {
    const P = makePreset('wardrobe'); P.sections[0].frontStyle = 'glass'; P.sections[2].frontStyle = 'shaker';
    P.cutouts = normalizeCutouts([{ part: 'Задняя стенка', kind: 'hole', w: 60, h: 40, r: 8, u: 400, v: 300 }, { part: 'Задняя стенка', kind: 'notch', w: 100, h: 50, r: 6, corner: 'w2d1' }]);
    const sp = buildSpec(P), { lines, pairs } = parse(sp);
    expect(lines.length % 2 === 0 || lines[lines.length - 1] === '').toBe(true);
    expect(pairs.every(([code]) => /^\d+$/.test(code))).toBe(true);
    expect(pairs.some(([c, v]) => c === '0' && v === 'EOF')).toBe(true);
    const types = new Set(pairs.filter(([c]) => c === '0').map(([, v]) => v));
    for (const t of types) expect(['SECTION', 'ENDSEC', 'LINE', 'CIRCLE', 'ARC', 'TEXT', 'EOF']).toContain(t);
    const layers = new Set(pairs.filter(([c]) => c === '8').map(([, v]) => v));
    for (const l of layers) expect(l).toMatch(/^[A-Za-z0-9_]+$/); // без пробелов и кириллицы: DXF R12
    for (const want of ['KORPUS', 'FASAD', 'HDF', 'VYREZ', 'OKNO_SKV', 'PODPISI']) expect(layers.has(want), want).toBe(true);
    expect([...layers].some(l => /^FREZA_RAMKA_\d+$/.test(l))).toBe(true);
    expect([...layers].some(l => /^FALTS_\d+_B$/.test(l))).toBe(true);
    // у каждой дуги радиус и два угла в градусах
    for (let i = 0; i < pairs.length; i++) if (pairs[i][0] === '0' && pairs[i][1] === 'ARC') {
      const e = []; for (let j = i + 1; j < pairs.length && pairs[j][0] !== '0'; j++) e.push(pairs[j]);
      const get = c => e.find(([k]) => k === c);
      expect(get('40') && +get('40')[1] > 0).toBe(true);
      expect(get('50') && get('51') && +get('50')[1] >= 0 && +get('51')[1] <= 360).toBe(true);
    }
  });
});
