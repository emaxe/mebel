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
