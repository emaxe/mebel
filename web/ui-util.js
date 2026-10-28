// Чистые помощники интерфейса: подписи, сводки, предикаты по проекту. Без DOM.
import { isDrawer } from './model.js';
import { moduleCount } from './project.js';

export const TYPES = [['wardrobe', 'Шкаф'], ['rack', 'Стеллаж'], ['nightstand', 'Тумба'], ['dresser', 'Комод'], ['tv', 'ТВ-тумба'], ['kbase', 'Кухня: нижний модуль'], ['kwall', 'Кухня: верхний модуль'], ['kfill', 'Кухня: фальшпанель'], ['kcorner', 'Кухня: угловой модуль'], ['ktall', 'Кухня: пенал']];
export const TYPE_INFO = { kcorner: 'Нижний угловой «Г» с глухим углом: два крыла, Г-образные дно и крышка, две двери (длина крыла A — ширина секции)', kfill: 'Доборная панель шириной от 20 мм: закрывает щель у стены или между корпусами', kbase: 'Нижний модуль на ножках: царги вместо крышки, полки или ящики, дверь', kwall: 'Навесной шкаф: неглубокий корпус на стену, дверь или подъёмный фасад', ktall: 'Пенал до потолка: полки и ящики, дверь', wardrobe: 'Штанги, полки, ящики; распашные двери или купе', rack: 'Открытые полки без дверей', nightstand: 'Невысокая тумба: ящики, полки, дверь', dresser: 'Широкая стопка ящиков', tv: 'Низкая и широкая, с нишами и ящиками' };

export const typeLabel = k => (TYPES.find(t => t[0] === k) || ['', ''])[1];

/** Одинаковые строки сворачиваются в одну с числом повторов: «… (×3)». */
export const dedupe = list => { const m = new Map(); for (const t of list) m.set(t, (m.get(t) || 0) + 1); return [...m].map(([t, n]) => (n > 1 ? `${t} (×${n})` : t)); };

export const partIdOf = p => (p.item !== undefined ? `item|${p.sec}|${p.item}` : `${p.name}|${p.sec}|${p.c.map(v => Math.round(v)).join(',')}`);

/** Ключ конструкции: что не влияет на панель замечаний (вид и цвета), в него не входит. */
export const panelKey = P => { const { open, hideDoors, showHoles, asmStep, bodyColor, bodyName, frontColor, frontName, metalColor, ...rest } = P; return JSON.stringify(rest); };

export const keepColorsOf = P => ({ bodyColor: P.bodyColor, bodyName: P.bodyName, frontColor: P.frontColor, frontName: P.frontName, metalColor: P.metalColor });

export const hinged = P => P.doorType !== 'sliding';
export const itemsOf = P => P.sections.flatMap(s => s.items);
export const hasDrawers = P => itemsOf(P).some(i => isDrawer(i.type));
export const hasHingedDoors = P => hinged(P) && P.sections.some(s => s.door !== 'none');
export const hasDoors = P => hasHingedDoors(P) || P.doorType === 'sliding';
export const hasShelves = P => itemsOf(P).some(i => i.type === 'shelf' || i.type === 'glass');
export const hasMoving = P => hasDoors(P) || hasDrawers(P);

export const DOOR_LABELS = { none: 'без двери', left: 'дверь левая', right: 'дверь правая', double: 'двойная дверь', flapDown: 'откидная дверь', flapUp: 'подъёмная дверь' };

export function sectionSummary(s, withDoor) {
  const c = t => s.items.filter(i => i.type === t).length, parts = [`${s.width} мм`];
  if (withDoor) parts.push(DOOR_LABELS[s.door]);
  const sh = c('shelf') + c('glass') + c('fixed'); if (sh) parts.push(`полок: ${sh}`);
  if (c('rod')) parts.push(`штанг: ${c('rod')}`);
  if (c('drawer')) parts.push(`ящиков: ${c('drawer')}`);
  if (s.zone) parts.push(`зона ${s.zone.pos === 'top' ? 'вверху' : 'внизу'} ${s.zone.h} мм`);
  if (c('idrawer')) parts.push(`встроенных: ${c('idrawer')}`);
  return parts.join(' · ');
}

/** Имя файла выгрузки по проекту: модули — общий габарит, один корпус — тип и размеры. */
export const stampOf = (proj, root, P, spec) => (proj.multi ? `proekt_${moduleCount(root)}mod_${Math.round(proj.spec.meta.W)}x${Math.round(proj.spec.meta.H)}x${Math.round(proj.spec.meta.D)}` : `${P.type}_${Math.round(spec.meta.W)}x${P.height}x${P.depth}`);

const two = n => String(n).padStart(2, '0');
export function fmtDate(t, now = new Date()) {
  const d = new Date(t), day = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(), diff = Math.round((day(now) - day(d)) / 864e5);
  if (diff === 0) return `сегодня ${two(d.getHours())}:${two(d.getMinutes())}`;
  if (diff === 1) return 'вчера';
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export const sizeOf = p => `${Math.round(p.sections.reduce((a, s) => a + s.width, 0) + (p.sections.length + 1) * p.thickness)}×${p.height}×${p.depth}`;
