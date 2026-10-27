// План-схема проекта (вид сверху): корпуса, ряды вдоль стен, столешницы, размеры по рядам и общие габариты. Без DOM: строка SVG.
const fmt = v => String(Math.round(v)).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Прямоугольник корпуса на плане: [x0, x1, z0, z1] в мм (z вниз = к зрителю). */
export const footprint = m => (m.run === 1 ? [m.x - m.D / 2, m.x + m.D / 2, m.z - m.W / 2, m.z + m.W / 2] : [m.x - m.W / 2, m.x + m.W / 2, m.z - m.D / 2, m.z + m.D / 2]);

export function planView(proj, { width = 900 } = {}) {
  const mods = proj.mods, tops = proj.worktops || [];
  const boxes = mods.map(footprint);
  const tb = tops.map(p => [p.c[0] - p.L / 2, p.c[0] + p.L / 2, p.c[2] - p.W / 2, p.c[2] + p.W / 2]);
  const room = proj.room, fr = proj.frame, rb = room && fr ? [fr.xOf(0), fr.xOf(room.w), fr.zOf(0), fr.zOf(room.d)] : null;
  const all = [...boxes, ...tb, ...(rb ? [rb] : [])];
  const x0 = Math.min(...all.map(b => b[0])), x1 = Math.max(...all.map(b => b[1])), z0 = Math.min(...all.map(b => b[2])), z1 = Math.max(...all.map(b => b[3]));
  const padL = 70, padR = 70, padT = 50, padB = 90, sc = Math.min((width - padL - padR) / (x1 - x0), 560 / (z1 - z0));
  const X = x => padL + (x - x0) * sc, Z = z => padT + (z - z0) * sc, w = (x1 - x0) * sc, h = (z1 - z0) * sc, H = h + padT + padB;
  let s = `<svg viewBox="0 0 ${width} ${H}" style="width:100%;max-width:${width}px;background:#fff" font-family="Helvetica,Arial,sans-serif" font-size="11" data-plan="1">`;
  if (rb) s += `<rect x="${X(rb[0])}" y="${Z(rb[2])}" width="${(rb[1] - rb[0]) * sc}" height="${(rb[3] - rb[2]) * sc}" fill="#fbfaf6" stroke="#bdb8ab" stroke-width="1" data-room="1"/>`;
  for (const p of tb) s += `<rect x="${X(p[0])}" y="${Z(p[2])}" width="${(p[1] - p[0]) * sc}" height="${(p[3] - p[2]) * sc}" fill="#e9e6e0" stroke="#6d6a66" stroke-width="1" stroke-dasharray="6 3" data-worktop="1"/>`;
  mods.forEach((m, i) => {
    const b = boxes[i], over = !!m.over, bx = X(b[0]), bz = Z(b[2]), bw = (b[1] - b[0]) * sc, bh = (b[3] - b[2]) * sc;
    s += `<rect x="${bx}" y="${bz}" width="${bw}" height="${bh}" fill="${over ? 'none' : '#f6f3ec'}" stroke="#1f1e1b" stroke-width="${over ? 1 : 1.6}" ${over ? 'stroke-dasharray="3 3"' : ''} data-mod="${m.i}"/>`;
    // фасад: линия со стороны лицевой плоскости корпуса
    const fz = m.run === 1 ? (m.rot < 0 ? [bx, bz, bx, bz + bh] : [bx + bw, bz, bx + bw, bz + bh]) : [bx, bz + bh, bx + bw, bz + bh];
    s += `<line x1="${fz[0]}" y1="${fz[1]}" x2="${fz[2]}" y2="${fz[3]}" stroke="#d4672a" stroke-width="3"/>`;
    const label = `${esc(m.name)}${over ? ` (над, +${fmt(m.y)})` : ''}`, small = Math.min(bw, bh) < 60 || (m.run === 1 && bw < 90);
    if (!small) s += `<text x="${bx + bw / 2}" y="${bz + bh / 2}" text-anchor="middle" font-size="10" fill="#1f1e1b"><tspan x="${bx + bw / 2}" dy="-2">${label}</tspan><tspan x="${bx + bw / 2}" dy="12" fill="#6f6a60">${fmt(m.W)}×${fmt(m.D)}</tspan></text>`;
    else s += `<text x="${bx + bw / 2}" y="${bz + bh / 2 + 4}" text-anchor="middle" font-size="9" fill="#1f1e1b">${m.i + 1}</text>`;
  });
  // цепочки по рядам: ширины модулей вдоль стены (только модули на полу, не «над»)
  const chain = (list, horizontal) => {
    if (!list.length) return '';
    let out = '';
    const lo = Math.min(...list.map(m => (horizontal ? footprint(m)[0] : footprint(m)[2]))), pos = v => (horizontal ? X(v) : Z(v));
    const base = horizontal ? Z(z1) + 24 : X(x1) + 24;
    const segs = list.map(m => [horizontal ? footprint(m)[0] : footprint(m)[2], horizontal ? footprint(m)[1] : footprint(m)[3]]).sort((a, b) => a[0] - b[0]);
    out += horizontal ? `<line x1="${pos(lo)}" y1="${base}" x2="${pos(segs[segs.length - 1][1])}" y2="${base}" stroke="#8a8478"/>` : `<line x1="${base}" y1="${pos(lo)}" x2="${base}" y2="${pos(segs[segs.length - 1][1])}" stroke="#8a8478"/>`;
    for (const [a, c] of segs) {
      const pa = pos(a), pc = pos(c), mid = (pa + pc) / 2, len = c - a;
      out += horizontal ? `<line x1="${pa}" y1="${base - 4}" x2="${pa}" y2="${base + 4}" stroke="#8a8478"/><line x1="${pc}" y1="${base - 4}" x2="${pc}" y2="${base + 4}" stroke="#8a8478"/>${pc - pa > 30 ? `<text x="${mid}" y="${base + 14}" text-anchor="middle" data-seg="${fmt(len)}">${fmt(len)}</text>` : ''}` : `<line x1="${base - 4}" y1="${pa}" x2="${base + 4}" y2="${pa}" stroke="#8a8478"/><line x1="${base - 4}" y1="${pc}" x2="${base + 4}" y2="${pc}" stroke="#8a8478"/>${pc - pa > 18 ? `<text x="${base + 8}" y="${mid + 4}" data-seg="${fmt(len)}">${fmt(len)}</text>` : ''}`;
    }
    return out;
  };
  const floor = mods.filter(m => !m.over);
  s += chain(floor.filter(m => m.run === 0), true);
  s += chain(floor.filter(m => m.run === 1), false);
  s += `<text x="${padL + w / 2}" y="${H - 22}" text-anchor="middle" font-size="12" font-weight="600">${fmt(x1 - x0)}</text>`;
  s += `<text x="${padL + w + 54}" y="${padT + h / 2}" font-size="12" font-weight="600" text-anchor="middle" transform="rotate(90 ${padL + w + 54} ${padT + h / 2})">${fmt(z1 - z0)}</text>`;
  s += `<text x="${padL}" y="${padT - 26}" font-size="11" fill="#6f6a60">План: вид сверху; оранжевая линия — лицевая сторона, штрих — столешница, пунктирный контур — навесные модули над нижними</text>`;
  const wallY = Z(z0) - 6;
  s += `<line x1="${X(x0)}" y1="${wallY}" x2="${X(x1)}" y2="${wallY}" stroke="#1f1e1b" stroke-width="3" opacity=".55"/>`;
  const r1 = mods.filter(m => m.run === 1);
  if (r1.length) {
    const right = r1[0].rot < 0, bb = r1.map(footprint), wx = right ? X(Math.max(...bb.map(b => b[1]))) + 6 : X(Math.min(...bb.map(b => b[0]))) - 6;
    s += `<line x1="${wx}" y1="${Z(Math.min(...bb.map(b => b[2])))}" x2="${wx}" y2="${Z(z1)}" stroke="#1f1e1b" stroke-width="3" opacity=".55"/>`;
  }
  if (rb) {
    const wallB = fr.corner === 'R' ? rb[1] : rb[0];
    s += `<line x1="${X(rb[0])}" y1="${Z(rb[2]) - 6}" x2="${X(rb[1])}" y2="${Z(rb[2]) - 6}" stroke="#1f1e1b" stroke-width="3" opacity=".55"/><line x1="${X(wallB) + (fr.corner === 'R' ? 6 : -6)}" y1="${Z(rb[2])}" x2="${X(wallB) + (fr.corner === 'R' ? 6 : -6)}" y2="${Z(rb[3])}" stroke="#1f1e1b" stroke-width="3" opacity=".55"/>`;
    for (const o of room.openings) {
      const col = o.kind === 'door' ? '#c8a26a' : '#6fa8d6', name = o.kind === 'door' ? 'дверь' : 'окно';
      if (o.wall === 'A') s += `<rect x="${X(fr.xOf(o.x))}" y="${Z(rb[2]) - 9}" width="${o.w * sc}" height="6" fill="${col}" data-opening="${o.kind}"/><text x="${X(fr.xOf(o.x + o.w / 2))}" y="${Z(rb[2]) - 13}" text-anchor="middle" font-size="9" fill="#6f6a60">${name} ${fmt(o.w)}</text>`;
      else { const wx = X(wallB) + (fr.corner === 'R' ? 3 : -9); s += `<rect x="${wx}" y="${Z(fr.zOf(o.x))}" width="6" height="${o.w * sc}" fill="${col}" data-opening="${o.kind}"/>`; }
    }
    s += `<text x="${X(rb[0])}" y="${Z(rb[3]) + 14}" font-size="10" fill="#6f6a60">Помещение ${fmt(room.w)} × ${fmt(room.d)} мм, потолок ${fmt(room.h)}${room.skirt ? `, плинтус ${fmt(room.skirt)}×${fmt(room.skirtT)}` : ''}</text>`;
  }
  return s + '</svg>';
}
