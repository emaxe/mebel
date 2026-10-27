// Смета: материалы, кромка, фурнитура, работы, наценка. Без DOM; цены берёт из справочника (catalog.js).
import { sheetFor } from './catalog.js';
import { shoppingList } from './fittings.js';

const money = v => Math.round(v * 100) / 100;

/**
 * groups — результат groupParts, N — результат nest, E — edgeSummary. Возвращает { sections: [{title, lines:[{name, qty, unit, price, sum}]}], subtotal, markup, total, missing }.
 * Строки без цены в справочнике имеют price = null и в сумму не входят; их названия попадают в missing.
 */
export function estimate(spec, groups, N, E, cat, P = {}) {
  const missing = [], sections = [];
  const sec = (title, lines) => { sections.push({ title, lines, sum: money(lines.reduce((a, l) => a + (l.sum || 0), 0)) }); return sections[sections.length - 1]; };

  // листовые материалы: число листов из раскроя × цена листа (+ доплата за декор)
  const sheetLines = [], seen = new Map();
  for (const s of N.sheets) if (!s.stock) seen.set(s.mat, (seen.get(s.mat) || 0) + 1);
  for (const [mat, n] of seen) {
    const [label, tPart] = mat.split(/, (?=\d+ мм$)/), T = parseInt(tPart, 10);
    const sh = sheetFor(cat, label, T), extra = (cat.decors.find(d => label.includes(d.name)) || {}).price || 0, price = sh.price + extra;
    sheetLines.push({ name: `${mat}, лист ${sh.L}×${sh.W}`, qty: n, unit: 'лист', price: price || null, sum: money(n * price) });
    if (!price) missing.push(`лист ${mat}`);
  }
  for (const g of groups) if (g.mat === 'glass' || g.mat === 'mirror') {
    const p = cat.special[g.mat], area = (g.L * g.W * g.qty) / 1e6;
    sheetLines.push({ name: `${g.label}: ${g.name} ${g.L}×${g.W}`, qty: money(area), unit: 'м²', price: p || null, sum: money(area * p) });
    if (!p) missing.push(g.label);
  }
  for (const g of groups) if (g.mat === 'top') {
    const m = (g.L * g.qty) / 1000, p = cat.special.worktop;
    sheetLines.push({ name: `${g.label}, глубина ${Math.round(g.W)} мм`, qty: money(m), unit: 'пог. м', price: p || null, sum: money(m * p) });
    if (!p) missing.push('столешница');
  }
  const mat = sec('Материалы', sheetLines);

  // кромка с запасом 10%
  const edgeLines = E.map(e => {
    const p = cat.edge[String(e.t)] || null, m = e.m * 1.1;
    if (!p) missing.push(`кромка ${e.t} мм`);
    return { name: `Кромка ПВХ ${String(e.t).replace('.', ',')} мм (+10%)`, qty: money(m), unit: 'пог. м', price: p, sum: money(m * (p || 0)) };
  });
  const edge = sec('Кромка', edgeLines);

  // фурнитура: по списку покупок (упаковки и хлысты × цена выбранной модели)
  const hwLines = shoppingList(spec, cat, P).map(l => {
    if (l.missing) missing.push(l.title);
    return { name: l.title, qty: l.packs, unit: l.unit === 'уп.' ? `уп. (${l.pack} шт)` : l.unit, price: l.price, sum: l.sum };
  });
  const hw = sec('Фурнитура', hwLines);

  // работы
  const cutM = N.sheets.reduce((a, s) => a + s.cutLen, 0) / 1000;
  const edgeM = E.reduce((a, e) => a + e.m, 0);
  const holes = groups.reduce((a, g) => a + g.holes.length * g.qty, 0);
  const cuts = groups.reduce((a, g) => a + (g.mat === 'top' ? (g.cutouts || []).length * g.qty : 0), 0);
  const w = cat.works, asm = (mat.sum + hw.sum) * (w.assembly / 100);
  const works = sec('Работы', [
    { name: 'Распил', qty: money(cutM), unit: 'м реза', price: w.cut, sum: money(cutM * w.cut) },
    { name: 'Кромкование', qty: money(edgeM), unit: 'пог. м', price: w.edge, sum: money(edgeM * w.edge) },
    { name: 'Присадка', qty: holes, unit: 'отв.', price: w.hole, sum: money(holes * w.hole) },
    ...(cuts ? [{ name: 'Вырезы в столешнице', qty: cuts, unit: 'шт', price: w.cutout, sum: money(cuts * w.cutout) }] : []),
    { name: `Сборка (${w.assembly}% от материалов и фурнитуры)`, qty: 1, unit: '', price: money(asm), sum: money(asm) },
  ]);

  const subtotal = money(mat.sum + edge.sum + hw.sum + works.sum), markup = money(subtotal * (cat.markup / 100));
  return { sections, subtotal, markup, markupPct: cat.markup, total: money(subtotal + markup), missing: [...new Set(missing)] };
}
