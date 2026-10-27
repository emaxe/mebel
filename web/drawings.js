// Общий вид изделия: чертежи спереди и сбоку с размерными линиями (SVG-строки, мм). Без DOM.
import { dims } from './kinematics.js';

const FILL = { body: '#efe9dd', back: '#f6f3ec', glass: '#cfe0e4', mirror: '#dfe6ea', front: '#e4d3b8' };
const INK = '#1f1e1b', DIM = '#8a8478';
const f1 = v => String(Math.round(v * 10) / 10).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function kit(BW, BH) {
  const out = [`<svg viewBox="0 0 ${BW} ${BH}" style="width:100%;max-width:${BW}px;background:#fff" font-family="Helvetica,Arial,sans-serif" font-size="11">`];
  const api = {
    out,
    rect: (x, y, w, h, fill, stroke = INK, dash = '', sw = 1) => out.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, 0.6).toFixed(1)}" height="${Math.max(h, 0.6).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`),
    line: (x1, y1, x2, y2, stroke = INK, dash = '', sw = 1) => out.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`),
    text: (x, y, s, o = {}) => out.push(`<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${o.a || 'middle'}" font-size="${o.s || 11}" fill="${o.c || INK}"${o.r ? ` transform="rotate(${o.r} ${x.toFixed(1)} ${y.toFixed(1)})"` : ''}>${esc(s)}</text>`),
    // горизонтальный размер от x1 до x2 на уровне y, подпись над линией
    dimH(x1, x2, y, label) {
      api.line(x1, y, x2, y, DIM); api.line(x1, y - 4, x1, y + 4, DIM); api.line(x2, y - 4, x2, y + 4, DIM);
      api.text((x1 + x2) / 2, y - 4, label, { c: '#4a463f' });
    },
    // вертикальный размер от y1 (низ) до y2 (верх) на уровне x, подпись повёрнута
    dimV(y1, y2, x, label) {
      api.line(x, y1, x, y2, DIM); api.line(x - 4, y1, x + 4, y1, DIM); api.line(x - 4, y2, x + 4, y2, DIM);
      api.text(x - 5, (y1 + y2) / 2, label, { c: '#4a463f', r: -90 });
    },
    end: () => { out.push('</svg>'); return out.join(''); },
  };
  return api;
}

/** Вид спереди. fronts=false — двери скрыты, виден корпус и наполнение; fronts=true — фасады с размерами и значком открывания. */
export function frontView(spec, P, { fronts = false } = {}) {
  const m = spec.meta, W = m.W, Ht = m.H, b = P.base === 'none' ? 0 : P.plinth, t = P.thickness;
  const pad = { l: 78, r: 30, t: 30, b: 90 }, BW = 900, sc = Math.min((BW - pad.l - pad.r) / W, 560 / Ht);
  const h = Ht * sc, BH = h + pad.t + pad.b;
  const X = x => pad.l + (x + W / 2) * sc, Y = y => pad.t + h - y * sc;
  const k = kit(BW, BH);
  const box = (p, fill, stroke, dash) => {
    const [sx, sy] = dims(p);
    k.rect(X(p.c[0] - sx / 2), Y(p.c[1] + sy / 2), sx * sc, sy * sc, fill, stroke, dash);
  };
  const isFront = p => p.mat === 'front' || ((p.mat === 'glass' || p.mat === 'mirror') && p.group && p.group.type !== 'slide');
  const outer = p => /^(Боковина (левая|правая)|Крышка$|Дно$|Цоколь$|Карниз$)/.test(p.name);
  const parts = spec.parts;
  if (!fronts) {
    for (const p of parts) if (!p.group && p.mat === 'back') box(p, FILL.back, '#cfc9bc');
    for (const p of parts) if (!p.group && p.mat !== 'back') box(p, FILL[p.mat] || FILL.body, INK);
    for (const p of parts) if (p.group && p.group.type === 'slide' && p.mat === 'front') box(p, FILL.front, '#8a6f4c', '4 2');
    for (const e of spec.extras) {
      if (e.nc || e.group) continue;
      if (e.kind === 'cyl' && e.axis === 'x') k.rect(X(e.c[0] - e.len / 2), Y(e.c[1] + e.r), e.len * sc, Math.max(2.2, e.r * 2 * sc), '#c8ccd0', '#6f6a60');
      else if (e.kind === 'cyl' && e.axis === 'y') k.rect(X(e.c[0] - e.r), Y(e.c[1] + e.len / 2), Math.max(2.2, e.r * 2 * sc), e.len * sc, '#c8ccd0', '#6f6a60');
    }
    // высоты полок от пола (верхняя плоскость), чтобы по чертежу можно было собрать
    for (const p of parts) if (!p.group && p.plane === 'xz' && /^Полка/.test(p.name)) k.text(X(p.c[0]), Y(p.c[1] + p.T / 2) - 3, String(Math.round(p.c[1] + p.T / 2)), { s: 9, c: '#6f6a60' });
    for (const e of spec.extras) if (!e.nc && !e.group && e.kind === 'cyl' && e.axis === 'x' && e.name === 'Штанга') k.text(X(e.c[0]), Y(e.c[1] + e.r) - 3, String(Math.round(e.c[1])), { s: 9, c: '#6f6a60' });
  } else {
    for (const p of parts) if (!p.group && outer(p)) box(p, FILL.body, INK);
    for (const p of parts.filter(isFront)) {
      const [sx, sy] = dims(p), x = X(p.c[0] - sx / 2), y = Y(p.c[1] + sy / 2), w = sx * sc, hh = sy * sc;
      k.rect(x, y, w, hh, FILL[p.mat] || FILL.front, INK, '', 1.2);
      const g = p.group;
      if (g && g.type === 'hinge' && w > 14) {
        // значок открывания: вершина у свободного края, основание у петель
        const hx = g.pivot[0] < p.c[0];
        if (g.axis === 'y') { const ex = hx ? x + w : x, bx = hx ? x : x + w; k.line(ex, y + hh / 2, bx, y, '#d4672a', '5 3'); k.line(ex, y + hh / 2, bx, y + hh, '#d4672a', '5 3'); }
        else { const down = g.pivot[1] < p.c[1], ey = down ? y : y + hh, by = down ? y + hh : y; k.line(x + w / 2, ey, x, by, '#d4672a', '5 3'); k.line(x + w / 2, ey, x + w, by, '#d4672a', '5 3'); }
      }
      if (w > 60 && hh > 18) k.text(x + w / 2, y + hh / 2 + 4, `${Math.round(sx)}×${Math.round(sy)}`, { s: Math.min(11, w / 7), c: '#6f6a60' });
    }
  }
  // размеры: секции и общая ширина снизу, высота и цоколь слева
  const yb = Y(0);
  for (const s of m.sections) k.dimH(X(s.x - s.w / 2), X(s.x + s.w / 2), yb + 30, f1(s.w));
  k.dimH(X(-W / 2), X(W / 2), yb + 58, f1(W));
  k.dimV(Y(0), Y(Ht), pad.l - 22, f1(Ht));
  if (b > 0) k.dimV(Y(0), Y(b), pad.l - 44, f1(b));
  k.text(BW / 2, BH - 8, fronts ? 'Фасады, вид спереди' : 'Корпус и наполнение, двери скрыты, вид спереди (цифры у полок — высота от пола)', { s: 11, c: '#8a8478' });
  void t;
  return k.end();
}

/** Вид сбоку: контуры деталей в профиль, глубина корпуса и полная глубина с фасадами. */
export function sideView(spec, P) {
  const Ht = spec.meta.H, b = P.base === 'none' ? 0 : P.plinth;
  const ext = p => { const d = dims(p); return [p.c[2] - d[2] / 2, p.c[2] + d[2] / 2]; };
  let zlo = Infinity, zhi = -Infinity;
  for (const p of spec.parts) { if (p.group && p.group.type === 'slide') continue; const [a, c] = ext(p); zlo = Math.min(zlo, a); zhi = Math.max(zhi, c); }
  const side = spec.parts.find(p => p.name === 'Боковина левая');
  const Dtot = zhi - zlo, pad = { l: 78, r: 30, t: 30, b: 90 }, BW = 900;
  const sc = Math.min((BW - pad.l - pad.r) / Dtot, 520 / Ht), h = Ht * sc, BH = h + pad.t + pad.b;
  const X = z => pad.l + (z - zlo) * sc, Y = y => pad.t + h - y * sc;
  const k = kit(BW, BH);
  for (const p of spec.parts) {
    if (p.group && p.group.type === 'slide') continue;
    if (p.plane === 'yz' && p !== side) continue;
    const d = dims(p), [a] = ext(p);
    if (p === side) { k.rect(X(a), Y(p.c[1] + d[1] / 2), d[2] * sc, d[1] * sc, 'none', DIM, '5 3'); continue; }
    k.rect(X(a), Y(p.c[1] + d[1] / 2), d[2] * sc, d[1] * sc, FILL[p.mat] || FILL.body, INK);
  }
  const yb = Y(0);
  if (side) { const [a, c] = ext(side); k.dimH(X(a), X(c), yb + 30, f1(c - a)); }
  k.dimH(X(zlo), X(zhi), yb + 58, f1(Dtot));
  k.dimV(Y(0), Y(Ht), pad.l - 22, f1(Ht));
  if (b > 0) k.dimV(Y(0), Y(b), pad.l - 44, f1(b));
  k.text(BW / 2, BH - 8, 'Вид сбоку (слева — задняя стенка, справа — фасад)', { s: 11, c: '#8a8478' });
  return k.end();
}
