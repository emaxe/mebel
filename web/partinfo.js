// Что цеху нужно знать о детали помимо размеров: как она стоит в изделии, где фрезеровки и вырезы. Без DOM: используется в задании, DXF и тестах.

const EDGE = {
  yz: { w1: 'низ', w2: 'верх', d1: 'задняя кромка', d2: 'передняя кромка' },
  xz: { w1: 'слева', w2: 'справа', d1: 'задняя кромка', d2: 'передняя кромка' },
  xy: { w1: 'слева', w2: 'справа', d1: 'низ', d2: 'верх' },
};
const FACE = {
  yz: { A: 'левая (смотрит влево)', B: 'правая (смотрит вправо)' },
  xz: { A: 'верхняя', B: 'нижняя' },
  xy: { A: 'лицевая', B: 'тыльная' },
};
export const edgeNames = plane => EDGE[plane] || EDGE.xy;
export const faceNames = plane => FACE[plane] || FACE.xy;
const n1 = v => String(Math.round(v * 10) / 10).replace('.', ',');

/** Положение детали: стороны и пласти в изделии, у двери и откидного фасада — сторона петель. */
export function orientLines(g) {
  const e = edgeNames(g.plane), f = faceNames(g.plane);
  const out = [`Ш1 — ${e.w1}, Ш2 — ${e.w2}; Д1 — ${e.d1}, Д2 — ${e.d2}. Пласть A — ${f.A}, B — ${f.B}.`];
  const cups = g.holes.filter(h => h.note === 'чашка петли');
  if (cups.length && g.plane === 'xy') {
    if (/откидной/.test(g.name)) out.push(`Петли у кромки ${cups[0].v < g.W / 2 ? 'Д1 (внизу): откидывается вниз' : 'Д2 (вверху): поднимается вверх'}. Чашки на тыльной пласти B. Смотрите на лицевую пласть A: X слева направо.`);
    else out.push(`Петли ${cups[0].u < g.L / 2 ? 'слева (у Ш1)' : 'справа (у Ш2)'} если смотреть на лицевую пласть A; чашки на тыльной пласти B. Д1 — низ двери.`);
  }
  return out;
}

/** Фрезеровки и вырезы детали: [{ kind: 'mill' | 'cut', title, size, pos, face, depth, note }] для таблицы задания. */
export function machiningRows(g) {
  const rows = [], m = g.mill, e = edgeNames(g.plane);
  if (m && m.kind === 'shaker') rows.push({ kind: 'mill', title: 'Рамка: филёнка утоплена', size: `${n1(m.window[0])}×${n1(m.window[1])}`, pos: `по центру, рамка ${n1(m.frameW)} мм со всех сторон`, face: 'A (лицо)', depth: m.depth, note: `радиус углов R${n1(m.cornerR)}` });
  if (m && m.kind === 'glass') {
    rows.push({ kind: 'mill', title: 'Окно под стекло, насквозь', size: `${n1(m.window[0])}×${n1(m.window[1])}`, pos: `по центру, рамка ${n1(m.frameW)} мм со всех сторон`, face: 'сквозное', depth: 'скв.', note: `радиус углов R${n1(m.cornerR)}` });
    rows.push({ kind: 'mill', title: 'Четверть под стекло', size: `${n1(m.rebate[0])}×${n1(m.rebate[1])}`, pos: 'вокруг окна, с тыльной стороны', face: 'B (тыл)', depth: m.rebateDepth, note: `радиус углов R${n1(m.cornerR)}` });
  }
  for (const c of g.cutouts || []) {
    const w = c.u1 - c.u0, h = c.v1 - c.v0;
    rows.push(c.kind === 'notch'
      ? { kind: 'cut', title: 'Выемка в углу', size: `${n1(w)}×${n1(h)}`, pos: `угол ${e[c.corner.slice(0, 2)]} / ${e[c.corner.slice(2)]}`, face: 'сквозная', depth: 'скв.', note: c.r ? `радиус внутреннего угла R${n1(c.r)}` : '' }
      : { kind: 'cut', title: 'Вырез', size: `${n1(w)}×${n1(h)}`, pos: `от Ш1 ${n1(c.u0)}–${n1(c.u1)}, от Д1 ${n1(c.v0)}–${n1(c.v1)}`, face: 'сквозной', depth: 'скв.', note: c.r ? `скругление R${n1(c.r)}` : '' });
  }
  return rows;
}
