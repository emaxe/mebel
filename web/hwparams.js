// Параметры присадки и геометрии фурнитуры. Значения по умолчанию — то, что ядро считало константами;
// модель из справочника (catalog.fittings[].params) переопределяет их. Без импортов: берут и model.js, и fittings.js.

const rng = (a, b, s) => { const out = []; for (let v = a; v <= b; v += s) out.push(v); return out; };

export const HW_DEFAULTS = {
  // петля: чашка в двери, планка на опоре (мм)
  hinge: { cupD: 35, cupDepth: 13, cupEdge: 21.5, endOffset: 100, plateSetback: 37, plateSpacing: 32, plateD: 5, plateDepth: 12, loadKg: 7 },
  // направляющие по типам: gap — зазор короба с двух сторон, tr — ход (доля длины), lens — длины, mount* — отверстия на опоре
  slide: {
    ball: { name: 'шариковые', rail: 'three', gap: 26, tr: 0.75, lens: rng(250, 650, 50), mountFront: 37, mountMid: 0, mountRear: 37, mountY: 37, holeD: 5, holeDepth: 12, maxKg: 30 },
    ballSoft: { name: 'шариковые с доводчиком', rail: 'three', gap: 26, tr: 0.75, lens: rng(250, 650, 50), mountFront: 37, mountMid: 0, mountRear: 37, mountY: 37, holeD: 5, holeDepth: 12, maxKg: 30 },
    roller: { name: 'роликовые', rail: 'side', gap: 25, tr: 0.75, lens: rng(250, 500, 50), mountFront: 37, mountMid: 0, mountRear: 37, mountY: 37, holeD: 5, holeDepth: 12, maxKg: 20 },
    hidden: { name: 'скрытые полного выдвижения с доводчиком', rail: 'under', gap: 42, tr: 1, lens: [270, 300, 350, 400, 450, 500, 550, 600], mountFront: 37, mountMid: 197, mountRear: 37, mountY: 0, holeD: 5, holeDepth: 12, maxKg: 30 },
  },
  pin: { offset: 37, pitch: 32, d: 5, depth: 12 },
  kupe: { loadKg: 40 },
  // фрезеровка фасадов и кромка стекла
  mill: { frameW: 70, recessDepth: 8, cornerR: 3, glassOverlap: 5, rebateDepth: 5, glassChamfer: 0, glassCornerR: 0 },
};

/** Поля, которые можно править у модели: [ключ, подпись, подсказка, 'num' | 'list']. */
export const HW_PARAM_DEFS = {
  hinge: [
    ['cupEdge', 'Центр чашки от кромки, мм', 'Расстояние от края двери до центра отверстия Ø35 (кромка чашки обычно 3–6 мм).', 'num'],
    ['cupD', 'Ø чашки, мм', '', 'num'], ['cupDepth', 'Глубина чашки, мм', '', 'num'],
    ['endOffset', 'Первая петля от торца, мм', 'Расстояние до первой и последней петли.', 'num'],
    ['plateSetback', 'Планка от переднего края, мм', 'Отступ оси планки от переднего края корпуса.', 'num'],
    ['plateSpacing', 'Шаг отверстий планки, мм', 'Обычно 32.', 'num'],
    ['plateD', 'Ø отверстий планки, мм', '', 'num'], ['plateDepth', 'Глубина отверстий планки, мм', '', 'num'],
    ['loadKg', 'Нагрузка на петлю, кг', 'Для проверки веса двери.', 'num'],
  ],
  slide: [
    ['gap', 'Зазор короба (сумма), мм', 'Проём минус ширина короба.', 'num'],
    ['lens', 'Длины, мм', 'Через запятую: 250,300,350…', 'list'],
    ['tr', 'Ход (доля длины)', '0,75 — три четверти, 1 — полное выдвижение.', 'num'],
    ['mountFront', 'Первое отверстие от переднего края, мм', '', 'num'],
    ['mountMid', 'Среднее отверстие от переднего края, мм', '0 — посередине длины.', 'num'],
    ['mountRear', 'Последнее отверстие от заднего края, мм', '', 'num'],
    ['mountY', 'Высота отверстий над низом короба, мм', '', 'num'],
    ['holeD', 'Ø отверстий, мм', '', 'num'], ['holeDepth', 'Глубина отверстий, мм', '', 'num'],
    ['maxKg', 'Нагрузка на ящик, кг', 'Для проверки ящика.', 'num'],
  ],
  shelfPin: [
    ['offset', 'Отступ от переднего и заднего края, мм', '', 'num'],
    ['pitch', 'Шаг рядов, мм', 'Обычно 32.', 'num'],
    ['d', 'Ø отверстий, мм', '', 'num'], ['depth', 'Глубина, мм', '', 'num'],
  ],
  kupeRoller: [['loadKg', 'Нагрузка на полотно, кг', 'Для проверки веса полотна.', 'num']],
  mill: [
    ['frameW', 'Ширина рамки, мм', 'Ширина рамки рамочного фасада и фасада под стекло: окно меньше фасада на две такие рамки.', 'num'],
    ['recessDepth', 'Глубина фрезеровки филёнки, мм', 'Рамочный фасад: на сколько утоплена середина.', 'num'],
    ['cornerR', 'Радиус углов окна, мм', 'Радиус фрезы в углах окна и четверти.', 'num'],
    ['glassOverlap', 'Заход стекла под рамку, мм', 'На сколько стекло заходит за окно с каждой стороны (четверть).', 'num'],
    ['rebateDepth', 'Глубина четверти под стекло, мм', '', 'num'],
    ['glassChamfer', 'Фаска кромки стекла, мм', '0 — без фаски, кромка просто шлифована.', 'num'],
    ['glassCornerR', 'Радиус углов стекла, мм', '0 — прямые углы.', 'num'],
  ],
};

const NUM_KEYS = kind => HW_PARAM_DEFS[kind].filter(d => d[3] === 'num').map(d => d[0]);
/** Накладывает правки модели на значения по умолчанию: только известные поля, числа и список длин. */
export function mergeParams(base, over, kind) {
  const out = { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const [k, , , type] of HW_PARAM_DEFS[kind] || []) {
    const v = over[k];
    if (v === undefined || v === null || v === '') continue;
    if (type === 'list') { const l = (Array.isArray(v) ? v : String(v).split(',')).map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b); if (l.length) out[k] = l; }
    else if (Number.isFinite(+v) && NUM_KEYS(kind).includes(k)) out[k] = +v;
  }
  return out;
}

/** Параметры по умолчанию для проекта (то, что buildSpec берёт без справочника). */
export function defaultHw(P) {
  return { hinge: { ...HW_DEFAULTS.hinge }, hingeHalf: { ...HW_DEFAULTS.hinge }, hingeFlap: { ...HW_DEFAULTS.hinge }, slide: { ...HW_DEFAULTS.slide[P.slide] || HW_DEFAULTS.slide.ball }, pin: { ...HW_DEFAULTS.pin }, kupe: { ...HW_DEFAULTS.kupe }, mill: { ...HW_DEFAULTS.mill } };
}
/** Длина направляющей: самая длинная из списка, что помещается; если ни одна — самая короткая. */
export const slideLen = (sl, avail) => [...sl.lens].reverse().find(l => l <= avail) || sl.lens[0];
export const hingeCount = h => (h <= 900 ? 2 : h <= 1600 ? 3 : h <= 2100 ? 4 : 5);
