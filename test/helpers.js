// Общие помощники тестов: детерминированный генератор случайных проектов.
import { makePreset, normalize, rulesOf, fillItems, newSection } from '../web/rules.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const int = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/** Случайный, но допустимый для типа проект: габариты, секции, двери, наполнение, зоны, антресоли, фурнитура. */
export function randomProject(seed) {
  const r = rng(seed), type = pick(r, ['wardrobe', 'wardrobe', 'rack', 'nightstand', 'dresser', 'tv', 'kbase', 'kwall', 'ktall', 'kfill', 'kcorner']);
  const keep = { joint: pick(r, ['confirmat', 'minifix', 'dowel']), thickness: pick(r, [16, 18, 18, 22]), backType: pick(r, ['groove', 'overlay', 'none']), handle: pick(r, ['bar', 'knob', 'profile', 'none']), slide: pick(r, ['ball', 'ballSoft', 'hidden', 'roller']), hinge: pick(r, ['soft', 'plain', 'wide']), wallFix: r() < 0.5, frontT: pick(r, [16, 19]) };
  keep.push = keep.handle === 'none' && r() < 0.5;
  const P0 = makePreset(type, keep), R = rulesOf(P0);
  P0.base = pick(r, ['plinth', 'legs', 'none']); P0.plinth = int(r, 4, 14) * 10;
  P0.topType = pick(r, R.rails ? ['inset', 'overlay', 'rails'] : ['inset', 'overlay']); P0.topOverhang = P0.topType === 'overlay' ? int(r, 0, 3) * 10 : 0;
  P0.height = int(r, R.height[0] / 10, R.height[1] / 10) * 10; P0.depth = int(r, R.depth[0] / 10, R.depth[1] / 10) * 10;
  if (R.sliding && r() < 0.25) P0.doorType = 'sliding';
  if (R.cornice) P0.cornice = r() < 0.3;
  const n = int(r, 1, R.maxSec), secs = [];
  for (let i = 0; i < n; i++) {
    const s = newSection(P0); s.width = int(r, R.secW[0] / 10, Math.min(R.secW[1], 900) / 10) * 10;
    s.door = pick(r, R.doors.length ? R.doors : ['none']);
    s.items = fillItems(pick(r, R.fills), P0);
    s.frontStyle = pick(r, ['flat', 'flat', 'shaker', 'glass', 'mirror']);
    const leaf = s.door === 'double' ? (s.width + P0.thickness) / 2 - 3 : s.width + P0.thickness - 3;
    if (leaf < 210 && (s.frontStyle === 'shaker' || s.frontStyle === 'glass')) s.frontStyle = 'flat'; // рамка 70 мм не оставит окна
    if (R.mezz && P0.doorType !== 'sliding' && r() < 0.25) s.split = int(r, 25, 60) * 10;
    if (R.zone && r() < 0.3) s.zone = { pos: pick(r, ['bottom', 'top']), h: int(r, 20, 50) * 10, split: 0, left: [{ type: 'shelf', y: 200 }], right: [] };
    s.drawerFronts = pick(r, ['inset', 'overlay']);
    secs.push(s);
  }
  P0.sections = secs;
  if (P0.backType !== 'none' && r() < 0.3) P0.cutouts = [{ part: 'Задняя стенка', sec: 0, kind: 'hole', w: 60, h: 60, r: 10, u: 150, v: 150, corner: 'w1d1' }]; // кабель-канал в задней стенке
  if (type === 'kcorner' && r() < 0.5) P0.cornerKit = pick(r, ['carousel', 'magic']);
  if (R.appliances && r() < 0.4) P0.appliance = pick(r, R.appliances);
  return normalize(P0);
}

/** Проект с крайними значениями: размеры на границах, все типы ручек, фурнитуры, зоны, антресоли, купе, вырезы. Может быть заведомо неудачным: расчёт обязан об этом предупредить. */
export function extremeProject(seed) {
  const r = rng(seed * 7919), type = pick(r, ['wardrobe', 'wardrobe', 'rack', 'nightstand', 'dresser', 'tv', 'kbase', 'kwall', 'ktall', 'kfill', 'kcorner']);
  const P0 = makePreset(type, { joint: pick(r, ['confirmat', 'minifix', 'dowel']), thickness: pick(r, [16, 18, 22, 25]), backType: pick(r, ['groove', 'overlay', 'none']), handle: pick(r, ['bar', 'knob', 'profile', 'none']), handleSize: pick(r, [96, 128, 160, 192, 256]), handleOrient: pick(r, ['v', 'h']), slide: pick(r, ['ball', 'ballSoft', 'hidden', 'roller']), hinge: pick(r, ['soft', 'plain', 'wide']), wallFix: r() < 0.5, frontT: pick(r, [16, 19, 22]), edgeFront: pick(r, [0.4, 1, 2]), edgeHidden: pick(r, [0, 0.4, 1]), shelfSetback: int(r, 0, 60) });
  P0.push = P0.handle === 'none' && r() < 0.5;
  const R = rulesOf(P0);
  P0.base = pick(r, ['plinth', 'legs', 'none']); P0.plinth = int(r, 4, 20) * 10; P0.topType = pick(r, R.rails ? ['inset', 'overlay', 'rails'] : ['inset', 'overlay']); P0.topOverhang = P0.topType === 'overlay' ? int(r, 0, 5) * 10 : 0;
  P0.height = pick(r, [R.height[0], R.height[1], int(r, R.height[0] / 10, R.height[1] / 10) * 10]); P0.depth = pick(r, [R.depth[0], R.depth[1], int(r, R.depth[0] / 10, R.depth[1] / 10) * 10]);
  if (R.sliding && r() < 0.3) { P0.doorType = 'sliding'; P0.slidingDoors = int(r, 2, 5); P0.slidingStyle = pick(r, ['mirror', 'glass', 'flat']); }
  if (R.cornice) P0.cornice = r() < 0.4;
  const n = int(r, 1, R.maxSec); P0.sections = [];
  for (let i = 0; i < n; i++) {
    const s = newSection(P0);
    s.width = pick(r, [R.secW[0], R.secW[1], int(r, R.secW[0] / 10, R.secW[1] / 10) * 10]); s.door = pick(r, R.doors.length ? R.doors : ['none']);
    s.items = fillItems(pick(r, R.fills), P0); s.frontStyle = pick(r, ['flat', 'shaker', 'glass', 'mirror']);
    if (R.mezz && P0.doorType !== 'sliding' && r() < 0.3) s.split = int(r, 25, 70) * 10;
    if (R.zone && r() < 0.3) s.zone = { pos: pick(r, ['bottom', 'top']), h: int(r, 15, 50) * 10, split: 0, left: [{ type: 'shelf', y: 200 }], right: [] };
    s.drawerFronts = pick(r, ['inset', 'overlay']); P0.sections.push(s);
  }
  if (r() < 0.3) P0.cutouts = [{ part: 'Задняя стенка', sec: 0, kind: 'hole', w: 60, h: 40, r: 8, u: 150, v: 150, corner: 'w1d1' }];
  return normalize(P0);
}
