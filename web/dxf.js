// DXF R12 для станков и просмотра: один замкнутый контур на деталь (выемки в углах входят в контур), дуги через bulge, таблица слоёв.
const K = Math.tan(Math.PI / 8);
const CORNER = { w1d1: 'bl', w2d1: 'br', w2d2: 'tr', w1d2: 'tl' };

export const holeKey = h => `D${h.d}_${h.h === 'скв.' ? 'SKV' : 'H' + h.h}`;

const unit = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };

/** Закрытая ломаная с дугами: [{ x, y, b }], b — bulge дуги, идущей от этой вершины к следующей. Обход против часовой. */
export function roundedRect(u0, v0, u1, v1, rad = [0, 0, 0, 0]) {
  const [a, b, c, d] = rad.map(r => Math.max(0, Math.min(r || 0, (u1 - u0) / 2, (v1 - v0) / 2)));
  const out = [];
  const corner = (r, pre, post, pt) => (r ? out.push({ x: pre[0], y: pre[1], b: K }, { x: post[0], y: post[1], b: 0 }) : out.push({ x: pt[0], y: pt[1], b: 0 }));
  corner(b, [u1 - b, v0], [u1, v0 + b], [u1, v0]);
  corner(c, [u1, v1 - c], [u1 - c, v1], [u1, v1]);
  corner(d, [u0 + d, v1], [u0, v1 - d], [u0, v1]);
  corner(a, [u0, v0 + a], [u0 + a, v0], [u0, v0]);
  return out;
}

/** Контур детали L×W с выемками в углах (cutouts kind 'notch'); внутренний угол выемки скругляется по c.r. */
export function partContour(L, W, cutouts = []) {
  const notch = {};
  for (const c of cutouts) if (c.kind === 'notch' && CORNER[c.corner]) notch[CORNER[c.corner]] = c;
  const raw = [];
  const add = (pt, inner = 0) => raw.push({ p: pt, inner });
  const n = notch;
  if (n.bl) { add([0, n.bl.v1]); add([n.bl.u1, n.bl.v1], n.bl.r || 0); add([n.bl.u1, 0]); } else add([0, 0]);
  if (n.br) { add([n.br.u0, 0]); add([n.br.u0, n.br.v1], n.br.r || 0); add([L, n.br.v1]); } else add([L, 0]);
  if (n.tr) { add([L, n.tr.v0]); add([n.tr.u0, n.tr.v0], n.tr.r || 0); add([n.tr.u0, W]); } else add([L, W]);
  if (n.tl) { add([n.tl.u1, W]); add([n.tl.u1, n.tl.v0], n.tl.r || 0); add([0, n.tl.v0]); } else add([0, W]);
  const out = [], N = raw.length;
  raw.forEach((q, i) => {
    if (!q.inner) { out.push({ x: q.p[0], y: q.p[1], b: 0 }); return; }
    const prev = raw[(i + N - 1) % N].p, next = raw[(i + 1) % N].p;
    const r = Math.min(q.inner, Math.hypot(q.p[0] - prev[0], q.p[1] - prev[1]), Math.hypot(next[0] - q.p[0], next[1] - q.p[1]));
    if (!(r > 0)) { out.push({ x: q.p[0], y: q.p[1], b: 0 }); return; }
    const d1 = unit(prev, q.p), d2 = unit(q.p, next);
    out.push({ x: q.p[0] - d1[0] * r, y: q.p[1] - d1[1] * r, b: -K }, { x: q.p[0] + d2[0] * r, y: q.p[1] + d2[1] * r, b: 0 });
  });
  return out;
}

const COLOR = [[/^KORPUS$/, 7], [/^FASAD$/, 4], [/^HDF$/, 8], [/^(STEKLO|ZERKALO)$/, 5], [/^KROMKA_/, 3], [/^PAZ_/, 5], [/^VYREZ$/, 1], [/^(FREZA_|OKNO_|FALTS_)/, 6], [/_TORETS$/, 2], [/_B$/, 5], [/_A$/, 1], [/^PODPISI$/, 8], [/^SHEET$/, 7], [/^TRIM$/, 8], [/^PIECE$/, 3], [/^OFFCUT$/, 2]];
const colorOf = name => (COLOR.find(([re]) => re.test(name)) || [0, 7])[1];

/** Накопитель сущностей DXF R12: слои, границы чертежа, итоговая сборка файла с таблицами. */
function writer() {
  const ent = [], layers = new Set(['0']);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const f = v => +v.toFixed(2);
  const grow = (x, y) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); };
  const layer = name => { layers.add(name); return name; };
  const line = (ly, x1, y1, x2, y2) => { grow(x1, y1); grow(x2, y2); ent.push('0', 'LINE', '8', layer(ly), '10', f(x1), '20', f(y1), '30', 0, '11', f(x2), '21', f(y2), '31', 0); };
  const circle = (ly, x, y, rr) => { grow(x - rr, y - rr); grow(x + rr, y + rr); ent.push('0', 'CIRCLE', '8', layer(ly), '10', f(x), '20', f(y), '30', 0, '40', rr); };
  const poly = (ly, pts, x0, y0, thickness) => {
    ent.push('0', 'POLYLINE', '8', layer(ly), '66', 1, '10', 0, '20', 0, '30', 0);
    if (thickness) ent.push('39', thickness);
    ent.push('70', 1);
    for (const p of pts) { grow(x0 + p.x, y0 + p.y); ent.push('0', 'VERTEX', '8', ly, '10', f(x0 + p.x), '20', f(y0 + p.y), '30', 0); if (p.b) ent.push('42', +p.b.toFixed(6)); }
    ent.push('0', 'SEQEND', '8', ly);
  };
  const text = (ly, x, y, h, s) => { grow(x, y); ent.push('0', 'TEXT', '8', layer(ly), '10', f(x), '20', f(y), '30', 0, '40', h, '1', s); };
  const build = () => {
    if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
    const head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$DWGCODEPAGE', '3', 'ANSI_1251', '9', '$INSUNITS', '70', '4',
      '9', '$EXTMIN', '10', f(minX), '20', f(minY), '30', 0, '9', '$EXTMAX', '10', f(maxX), '20', f(maxY), '30', 0, '0', 'ENDSEC'];
    const names = [...layers].sort((a, b) => (a === '0' ? -1 : b === '0' ? 1 : a < b ? -1 : 1));
    const tables = ['0', 'SECTION', '2', 'TABLES',
      '0', 'TABLE', '2', 'LTYPE', '70', 1, '0', 'LTYPE', '2', 'CONTINUOUS', '70', 0, '3', 'Solid line', '72', 65, '73', 0, '40', 0, '0', 'ENDTAB',
      '0', 'TABLE', '2', 'LAYER', '70', names.length];
    for (const nm of names) tables.push('0', 'LAYER', '2', nm, '70', 0, '62', colorOf(nm), '6', 'CONTINUOUS');
    tables.push('0', 'ENDTAB', '0', 'ENDSEC');
    return toCp1251([...head, ...tables, '0', 'SECTION', '2', 'ENTITIES', ...ent, '0', 'ENDSEC', '0', 'EOF'].join('\r\n'));
  };
  return { line, circle, poly, text, build };
}

/** groups — результат groupParts(spec). opts.edges: рисовать линии кромки (по умолчанию да), opts.labels: подписи. */
export function dxfFromGroups(groups, { edges = true, labels = true } = {}) {
  const { line, circle, poly, text, build } = writer();
  const lay = { body: 'KORPUS', front: 'FASAD', back: 'HDF', glass: 'STEKLO', mirror: 'ZERKALO' };
  const ROW = 7000, GAP = 150;
  let X = 0, Y = 0, rowH = 0;
  for (const g of groups) {
    if (X > 0 && X + g.L > ROW) { X = 0; Y -= rowH + GAP * 1.6; rowH = 0; }
    const ly = lay[g.mat] || 'DETAL', x0 = X, y0 = Y - g.W;
    poly(ly, partContour(g.L, g.W, g.cutouts), x0, y0, g.T);
    if (edges) {
      const ed = g.edges, o = 3, kl = v => `KROMKA_${v}`.replace('.', '_');
      if (ed.d1) line(kl(ed.d1), x0, y0 + o, x0 + g.L, y0 + o);
      if (ed.d2) line(kl(ed.d2), x0, y0 + g.W - o, x0 + g.L, y0 + g.W - o);
      if (ed.w1) line(kl(ed.w1), x0 + o, y0, x0 + o, y0 + g.W);
      if (ed.w2) line(kl(ed.w2), x0 + g.L - o, y0, x0 + g.L - o, y0 + g.W);
    }
    for (const gr of g.grooves) for (const dv of [0, gr.w]) line(`PAZ_${String(gr.w).replace('.', '_')}x${String(gr.depth).replace('.', '_')}_${gr.f}`, x0, y0 + gr.at + dv, x0 + g.L, y0 + gr.at + dv);
    const mi = g.mill, cr = mi ? [mi.cornerR, mi.cornerR, mi.cornerR, mi.cornerR] : null;
    if (mi && mi.kind === 'shaker') poly(`FREZA_RAMKA_${mi.depth}`, roundedRect(mi.frameW, mi.frameW, g.L - mi.frameW, g.W - mi.frameW, cr), x0, y0);
    if (mi && mi.kind === 'glass') {
      poly('OKNO_SKV', roundedRect(mi.frameW, mi.frameW, g.L - mi.frameW, g.W - mi.frameW, cr), x0, y0);
      const o = (mi.rebate[0] - mi.window[0]) / 2;
      poly(`FALTS_${mi.rebateDepth}_B`, roundedRect(mi.frameW - o, mi.frameW - o, g.L - mi.frameW + o, g.W - mi.frameW + o, cr), x0, y0);
    }
    for (const c of g.cutouts || []) if (c.kind !== 'notch') poly('VYREZ', roundedRect(c.u0, c.v0, c.u1, c.v1, [c.r, c.r, c.r, c.r]), x0, y0);
    for (const h of g.holes) {
      const x = x0 + h.u, y = y0 + h.v;
      if (h.f === 'A' || h.f === 'B') circle(`${holeKey(h)}_${h.f}`, x, y, h.d / 2);
      else {
        const L2 = `${holeKey(h)}_TORETS`, d = Math.min(h.h, 50);
        if (h.f === 'w1') line(L2, x, y, x + d, y);
        if (h.f === 'w2') line(L2, x, y, x - d, y);
        if (h.f === 'd1') line(L2, x, y, x, y + d);
        if (h.f === 'd2') line(L2, x, y, x, y - d);
      }
    }
    const th = Math.max(10, Math.min(35, g.W / 7));
    if (labels) {
      text('PODPISI', x0, Y + 14, th, `№${g.no} ${g.name} ${g.L}x${g.W}x${g.T} — ${g.qty} шт.`);
      text('PODPISI', x0, Y + 14 + th * 1.4, th * 0.7, `${g.label}; пил. ${g.saw.L}x${g.saw.W}; секция ${g.secLabel}`);
    }
    X += g.L + GAP; rowH = Math.max(rowH, g.W + th * 2.6);
  }
  return build();
}

/** Карта раскроя: листы, обрезка, детали (замкнутые контуры с номерами) и деловые остатки. N — результат nest(). */
export function nestMapDXF(N) {
  const { line, poly, text, build } = writer();
  const GAP = 300;
  let Y = 0;
  for (const sh of N.sheets) {
    const y0 = Y - sh.W;
    poly('SHEET', roundedRect(0, 0, sh.L, sh.W), 0, y0);
    if (sh.trim > 0) poly('TRIM', roundedRect(sh.trim, sh.trim, sh.L - sh.trim, sh.W - sh.trim), 0, y0);
    for (const o of sh.offcuts || []) poly('OFFCUT', roundedRect(sh.trim + o.x, sh.trim + o.y, sh.trim + o.x + o.l, sh.trim + o.y + o.w), 0, y0);
    for (const p of sh.pieces) {
      poly('PIECE', roundedRect(sh.trim + p.x, sh.trim + p.y, sh.trim + p.x + p.l, sh.trim + p.y + p.w), 0, y0);
      const h = Math.max(8, Math.min(40, p.w / 3, p.l / 6));
      text('PODPISI', sh.trim + p.x + 6, y0 + sh.trim + p.y + p.w / 2 - h / 2, h, `№${p.no} ${Math.round(p.l * 10) / 10}x${Math.round(p.w * 10) / 10}`);
    }
    text('PODPISI', 0, y0 + sh.W + 20, 40, `${sh.mat}: лист ${sh.idx} из ${sh.of}, ${sh.L}x${sh.W}, пропил/обрезка ${sh.trim} мм`);
    Y = y0 - GAP;
  }
  return build();
}

const CP1251_LATIN1 = new Set([0xa0, 0xa4, 0xa6, 0xa7, 0xa9, 0xab, 0xac, 0xad, 0xae, 0xb0, 0xb1, 0xb5, 0xb6, 0xb7, 0xbb]);

export function toCp1251(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    b[i] = c < 128 ? c : c >= 0x410 && c <= 0x44f ? c - 0x350 : c === 0x401 ? 0xa8 : c === 0x451 ? 0xb8 : c === 0xd7 ? 0x78 : c === 0x2014 ? 0x97 : c === 0x2116 ? 0xb9 : CP1251_LATIN1.has(c) ? c : 0x3f;
  }
  return b;
}
