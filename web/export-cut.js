// Универсальные выгрузки для сервисов раскроя и постпроцессоров станков. Без DOM.
// Форматы конкретных программ (Giblab, Viyar, Cutting, .mpr, .bpp, .xxl) здесь не воспроизводятся: это нейтральные таблицы и JSON с понятными полями.
import { grainOf } from './export.js';
import { partContour } from './dxf.js';

const DEC = v => String(Math.round(v * 100) / 100).replace('.', ',');
const KIND = label => (/^(ЛДСП|МДФ|ХДФ)/.exec(label) || [, 'Материал'])[1];
const decorOf = label => label.replace(/^(ЛДСП|МДФ|ХДФ)\s*/, '').replace(/,.*$/, '').trim() || '—';

/** Детали под раскрой: стекло и зеркало не режутся на пилах и в список не попадают. */
export const cuttable = groups => groups.filter(g => g.mat !== 'glass' && g.mat !== 'mirror' && g.mat !== 'top');

/**
 * CSV для импорта в сервисы раскроя (разделитель «;», UTF-8 с BOM). Размеры «пил.» — с вычетом кромки, «чист.» — готовые.
 * opts.textured(label) — декор с направлением волокон; у таких деталей поворот запрещён, ось волокон указана в «Волокна вдоль».
 */
export function toCutCSV(groups, { textured = () => false, title = '' } = {}) {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['№', 'Название', 'Материал', 'Декор', 'Толщина, мм', 'Длина пил., мм', 'Ширина пил., мм', 'Длина чист., мм', 'Ширина чист., мм', 'Кол-во', 'Поворот (1 — можно)', 'Волокна вдоль', 'Кромка Д1', 'Кромка Д2', 'Кромка Ш1', 'Кромка Ш2', 'Секция'];
  const rows = [head];
  for (const g of cuttable(groups)) {
    const tex = !!textured(g.label), axis = tex ? (grainOf(g) === 'W' ? 'Ширина' : 'Длина') : '';
    const e = v => (v ? DEC(v) : '');
    rows.push([g.no, g.name, KIND(g.label), decorOf(g.label), g.T, DEC(g.saw.L), DEC(g.saw.W), DEC(g.L), DEC(g.W), g.qty, tex ? 0 : 1, axis, e(g.edges.d1), e(g.edges.d2), e(g.edges.w1), e(g.edges.w2), g.secLabel]);
  }
  if (title) rows.unshift([title], []);
  return '﻿' + rows.map(r => r.map(q).join(';')).join('\r\n');
}

const FACE_DOC = { yz: { A: 'левая', B: 'правая' }, xz: { A: 'верхняя', B: 'нижняя' }, xy: { A: 'лицевая', B: 'тыльная' } };
const EDGE_DOC = { w1: 'торец Ш1 (u=0)', w2: 'торец Ш2 (u=L)', d1: 'торец Д1 (v=0)', d2: 'торец Д2 (v=W)' };

/**
 * JSON операций обработки для постпроцессора: контур, отверстия, пазы, фрезеровки и вырезы в системе координат детали.
 * X (u) — вдоль длины от торца Ш1, Y (v) — вдоль ширины от кромки Д1; пласть A и B — по таблице faces.
 */
export function toDrillJSON(groups, meta = {}) {
  const parts = groups.map(g => ({
    no: g.no, name: g.name, material: g.label, kind: g.mat, thickness: g.T, length: g.L, width: g.W, sawLength: g.saw.L, sawWidth: g.saw.W, quantity: g.qty, plane: g.plane,
    edges: { d1: g.edges.d1 || 0, d2: g.edges.d2 || 0, w1: g.edges.w1 || 0, w2: g.edges.w2 || 0 },
    faces: FACE_DOC[g.plane] || FACE_DOC.xy,
    contour: partContour(g.L, g.W, g.cutouts).map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), bulge: +p.b.toFixed(6) })),
    drilling: g.holes.map(h => ({
      face: h.f, target: h.f === 'A' || h.f === 'B' ? 'face' : 'edge', side: h.f === 'A' || h.f === 'B' ? (FACE_DOC[g.plane] || FACE_DOC.xy)[h.f] : EDGE_DOC[h.f],
      x: h.u, y: h.v, diameter: h.d, depth: h.h === 'скв.' ? null : h.h, through: h.h === 'скв.', note: h.note || '',
    })),
    grooves: g.grooves.map(x => ({ face: x.f, axis: x.axis, at: x.at, width: x.w, depth: x.depth, note: x.note || '' })),
    cutouts: (g.cutouts || []).map(c => ({ kind: c.kind, corner: c.corner || null, u0: c.u0, v0: c.v0, u1: c.u1, v1: c.v1, radius: c.r || 0 })),
    milling: g.mill ? JSON.parse(JSON.stringify(g.mill)) : null,
    notes: g.notes || [],
  }));
  return JSON.stringify({
    app: 'mebel', format: 'drilling-operations', version: 1, units: 'mm',
    coordinates: 'x — вдоль длины от торца Ш1, y — вдоль ширины от кромки Д1; контур против часовой, bulge — дуга к следующей вершине (tan(угол/4))',
    ...meta, parts,
  }, null, 2);
}
