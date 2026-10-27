// Библиотека корпусов: готовые типовые корпуса и свои, сохранённые в справочнике (cat.library). Без DOM.
import { makePreset, normalize, fillItems } from './rules.js';
import { cabinetOf, moduleList } from './project.js';

export const MAX_LIBRARY = 50;
const clone = o => JSON.parse(JSON.stringify(o));

const tpl = (id, name, hint, type, make, place = {}) => ({ id, name, hint, type, place, make: keep => { const P = makePreset(type, keep); make(P); return normalize(P); } });
const sec = (P, o = {}) => Object.assign(P.sections[0], o);

/** Типовые корпуса: { id, name, hint, type, place: { over?, y? }, make(keep) → P }. */
export const TEMPLATES = [
  tpl('k-drawers3', 'Нижний: три ящика', 'Тумба 600 мм с тремя ящиками во всю высоту, без двери', 'kbase', P => sec(P, { width: 600, door: 'none', items: fillItems('drawers3', P) })),
  tpl('k-sink', 'Нижний под мойку', 'Шкаф 800 мм с двумя дверями и пустым объёмом под мойку, без полок', 'kbase', P => sec(P, { width: 800, door: 'double', items: [] })),
  tpl('k-oven', 'Нижний под духовку', 'Шкаф 600 мм: ящик внизу, ниша под духовку сверху, без двери', 'kbase', P => sec(P, { width: 600, door: 'none', items: [{ type: 'drawer', y: 0, h: 180 }] })),
  tpl('k-shelves', 'Нижний с полкой', 'Шкаф 600 мм с дверью и одной полкой', 'kbase', P => sec(P, { width: 600, door: 'left' })),
  tpl('w-door2', 'Верхний: две двери', 'Навесной шкаф 800 мм с двумя дверями и полкой', 'kwall', P => sec(P, { width: 800, door: 'double' }), { over: true, y: 1400 }),
  tpl('w-lift', 'Верхний с подъёмным фасадом', 'Навесной шкаф 800 мм с фасадом на подъёмнике', 'kwall', P => sec(P, { width: 800, door: 'flapUp' }), { over: true, y: 1400 }),
  tpl('t-pantry', 'Пенал с ящиками', 'Пенал 600 мм: три ящика внизу и полки над ними', 'ktall', P => sec(P, { width: 600, door: 'double', items: fillItems('drawersShelves', P) })),
  tpl('d-4', 'Комод на четыре ящика', 'Комод 2 × 500 мм, по четыре ящика в секции', 'dresser', () => {}),
  tpl('r-3', 'Стеллаж на три секции', 'Открытые полки, три секции по 600 мм', 'rack', () => {}),
];

/** Запись для справочника из модуля i проекта: корпус без проектных полей, положение «над предыдущим» и подъём. */
export function libraryEntry(root, i, name) {
  const m = moduleList(root).find(x => x.i === i);
  if (!m) return null;
  const P = clone(cabinetOf(root, i));
  for (const k of ['modules', 'modName', 'modY', 'countertop', 'room', 'schema']) delete P[k];
  return { name: String(name || m.name).trim().slice(0, 60) || 'Корпус', P, ...(m.over ? { over: true } : {}), ...(m.y ? { y: m.y } : {}) };
}

/** Привести список библиотеки из справочника к допустимому виду: не больше MAX_LIBRARY записей с именем и корпусом. */
export function sanitizeLibrary(list) {
  return (Array.isArray(list) ? list : []).filter(e => e && typeof e === 'object' && typeof e.name === 'string' && e.name.trim() && e.P && typeof e.P === 'object' && Array.isArray(e.P.sections) && e.P.sections.length).slice(0, MAX_LIBRARY)
    .map(e => ({ name: e.name.trim().slice(0, 60), P: e.P, ...(e.over ? { over: true } : {}), ...(Number.isFinite(+e.y) && +e.y > 0 ? { y: Math.round(+e.y) } : {}) }));
}

/** Корпус из записи библиотеки (копия, нормализованная) или шаблона; keep — цвета текущего проекта для шаблонов. Возвращает { P, over, y, name }. */
export function instantiate(item, keep = {}) {
  if (typeof item.make === 'function') return { P: item.make(keep), over: !!item.place.over, y: item.place.y || 0, name: item.name };
  return { P: normalize(clone(item.P)), over: !!item.over, y: item.y || 0, name: item.name };
}
