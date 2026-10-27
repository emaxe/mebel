// Дерево ячеек секции: ячейка { items, zone }, зона делит ячейку на две колонки-ячейки (zone.left, zone.right), которые могут делиться дальше.
export const MAX_CELL_DEPTH = 3;
/** Колонка зоны хранится ячейкой { items, zone }; массив полок из проектов схемы ≤ 2 — тоже ячейка. */
export const asCell = c => (Array.isArray(c) ? { items: c } : c && typeof c === 'object' ? c : { items: [] });
/** Все зоны ячейки вместе с вложенными: [{ z, cell, depth }]. */
export function zonesOf(cell, depth = 0) {
  if (!cell || !cell.zone) return [];
  return [{ z: cell.zone, cell, depth }, ...['left', 'right'].flatMap(k => zonesOf(asCell(cell.zone[k]), depth + 1))];
}
