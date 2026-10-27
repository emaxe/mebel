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
