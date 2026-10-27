// Инженерные нормы для проверок: прогиб полок по формуле балки на двух опорах. Без DOM.
export const E_LDSP = 2800; // МПа, модуль упругости ЛДСП (типично 2000–3500)
export const DEFAULT_LOAD = 80; // кг/м² полки: книги, посуда, бельё
export const SAG_DIV = 250; // допустимый прогиб: пролёт / 250
const G = 9.81;

/** Прогиб в мм полки пролётом L, глубиной depth и толщиной T (мм) под равномерной нагрузкой loadKgM2 (кг/м²). */
export function shelfDeflection({ L, depth, T, load = DEFAULT_LOAD, E = E_LDSP }) {
  const q = load * G * 1e-6 * depth, I = (depth * T ** 3) / 12; // Н/мм и мм⁴
  return (5 * q * L ** 4) / (384 * E * I);
}

/** Наибольший пролёт, при котором прогиб не больше пролёта / SAG_DIV. От глубины не зависит: нагрузка и жёсткость растут вместе. */
export function maxShelfSpan(T, load = DEFAULT_LOAD, E = E_LDSP) {
  const k = shelfDeflection({ L: 1, depth: 100, T, load, E });
  return (1 / (k * SAG_DIV)) ** (1 / 3);
}

// ── подъёмный фасад: масса и усилие газлифтов
export const LIFT_FORCES = [40, 60, 80, 100, 120, 150]; // Н, стандартные номиналы газлифтов
export const LIFT_ARM = 0.45; // эффективное плечо пары газлифтов, доля высоты фасада от оси петель
export const LIFT_SAFETY = 1.15; // запас на удержание в открытом положении и трение
const KG_M2_MM = { ldsp: 0.68, mdf: 0.75, glass: 2.5, mirror: 2.5 }; // масса 1 м² на 1 мм толщины
export const HANDLE_MASS = 0.15; // кг, ручка с крепежом

/** Масса фасада в кг. style: flat | shaker | glass | mirror; рамка шириной frameW, вставка (стекло, зеркало) толщиной insertT. */
export function facadeMass({ w, h, T, style = 'flat', frameW = 70, insertT = 4 }) {
  const m2 = v => v * 1e-6, area = m2(w * h);
  if (style === 'shaker') return area * KG_M2_MM.mdf * T;
  const win = m2(Math.max(0, w - 2 * frameW) * Math.max(0, h - 2 * frameW)), frame = area - win;
  if (style === 'glass') return frame * KG_M2_MM.mdf * T + win * KG_M2_MM.glass * insertT;
  if (style === 'mirror') return frame * KG_M2_MM.ldsp * T + m2(Math.max(0, w - 120) * Math.max(0, h - 120)) * KG_M2_MM.mirror * insertT;
  return area * KG_M2_MM.ldsp * T;
}

/** Усилие на один газлифт (Н) для пары под фасадом массой mass кг. */
export const liftForce = mass => (mass * G * 0.5 * LIFT_SAFETY) / (2 * LIFT_ARM);

/** Ближайший стандартный газлифт не слабее усилия force; null, если фасад тяжелее, чем держит самый мощный. */
export const pickLift = force => LIFT_FORCES.find(f => f >= force) ?? null;

// ── крепёж и фасады: технологические пределы
/** Куда вкручивается саморез: назначение из названия «Саморез D×L (назначение)» → толщины слоёв, которые он проходит, мм. */
export const SCREW_LAYERS = [
  [/планка петли/, P => [P.thickness]],
  [/крепление стабилизатора/, P => [P.thickness]],
  [/штангодержатель/, P => [P.thickness]],
  [/мебельные уголки/, P => [P.thickness]],
  [/карниз/, P => [P.thickness, P.thickness]],
];
export const screwLayers = (purpose, P) => { const r = SCREW_LAYERS.find(([re]) => re.test(purpose)); return r ? r[1](P) : null; };

/** Предельная стройность фасада (высота / толщина): выше — риск коробления. Оценка: плоский ЛДСП 150, МДФ-рамка 190. */
export const WARP_LIMIT = { ldsp: 150, mdf: 190 };
export const warpRatio = (h, T) => h / T;
export const warpLimit = label => (/^МДФ/.test(label) ? WARP_LIMIT.mdf : WARP_LIMIT.ldsp);

/** Свободная глубина под плечики с штангой поперёк (мм) и наименьшая, при которой стандартные плечики шириной до 450 мм помещаются. */
export const HANGER_MIN_DEPTH = 450;
export function hangerDepth(P) {
  const back = P.backType === 'groove' ? 20 : P.backType === 'overlay' ? 4 : 0;
  const front = P.doorType === 'sliding' ? 90 : P.sections.some(s => s.door && s.door !== 'none') ? P.frontT + 3 : 0;
  return P.depth - back - front;
}

// ── аксессуары секции шкафа (s.acc): пределы по внутренним размерам; значения — ориентиры, у конкретной модели в каталоге пределы свои
export const ACCESSORIES = {
  pantograph: { label: 'Вешалка-пантограф', hw: 'Вешалка-пантограф (подъёмная штанга)', minW: 450, minD: 350, minH: 1200 },
  pullRod: { label: 'Выдвижная штанга', hw: 'Выдвижная штанга (боковая)', minW: 400, minD: 350, minH: 600 },
  trouserRack: { label: 'Брючница выдвижная', hw: 'Брючница выдвижная', minW: 400, minD: 400, minH: 300 },
  shoeRack: { label: 'Обувница выдвижная', hw: 'Обувница выдвижная', minW: 400, minD: 350, minH: 200 },
};
export const ACC_KEYS = Object.keys(ACCESSORIES);

// ── штанга: стальная труба на двух опорах под равномерной нагрузкой одежды
export const E_STEEL = 200000; // МПа
export const ROD = { D: 25, wall: 1 }; // мм: труба Ø25, стенка 1 мм (типовая штанга шкафа)
export const DEFAULT_ROD_LOAD = 20; // кг/м: плечи с верхней одеждой

/** Прогиб штанги в мм: пролёт L (мм), нагрузка loadKgM (кг на погонный метр). */
export function rodDeflection({ L, load = DEFAULT_ROD_LOAD, D = ROD.D, wall = ROD.wall, E = E_STEEL }) {
  const I = (Math.PI / 64) * (D ** 4 - (D - 2 * wall) ** 4), q = (load * G) / 1000; // мм⁴ и Н/мм
  return (5 * q * L ** 4) / (384 * E * I);
}

/** Наибольший пролёт штанги, при котором прогиб не больше пролёта / SAG_DIV. */
export function maxRodSpan(load = DEFAULT_ROD_LOAD, opts = {}) {
  const k = rodDeflection({ L: 1, load, ...opts });
  return (1 / (k * SAG_DIV)) ** (1 / 3);
}
