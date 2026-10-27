import { describe, it, expect } from 'vitest';
import { makePreset, normalize, schemaOf } from '../web/rules.js';
import { buildProject, addModule, moveModule, removeModule } from '../web/project.js';
import { normalizeRoom, roomFrame, roomWarnings } from '../web/room.js';
import { planView } from '../web/plan.js';

const kitchen = room => {
  const r = makePreset('kbase'); r.sections[0].width = 600;
  addModule(r, makePreset('kbase'), { name: 'Нижний 2' });
  addModule(r, makePreset('kbase'), { name: 'Нижний угловой ряд', turn: 'L' });
  if (room) r.room = room;
  return normalize(r);
};
const R = (o = {}) => ({ w: 4000, d: 3000, h: 2700, openings: [], ...o });

describe('помещение: нормализация', () => {
  it('мусор даёт null, размеры ограничиваются, проём остаётся внутри стены', () => {
    expect(normalizeRoom(null)).toBeNull(); expect(normalizeRoom([])).toBeNull(); expect(normalizeRoom('x')).toBeNull();
    const r = normalizeRoom({ w: 10, d: 99999, h: 'a', openings: [{ kind: 'window', wall: 'A', x: 99999, w: 1200, y: 900, h: 99999 }, null, { kind: 'x', wall: 'Z' }] });
    expect(r.w).toBe(500); expect(r.d).toBe(20000); expect(r.h).toBe(2700);
    const o = r.openings[0]; expect(o.x + o.w).toBeLessThanOrEqual(r.w); expect(o.y + o.h).toBeLessThanOrEqual(r.h);
    expect(r.openings[1]).toMatchObject({ kind: 'door', wall: 'A' });
  });
  it('нормализация проекта сохраняет помещение, ставит схему 3 и убирает его у модулей', () => {
    const P = kitchen(R()); P.modules[0].P.room = R();
    normalize(P);
    expect(P.room.w).toBe(4000); expect(schemaOf(P)).toBe(3); expect(P.modules[0].P.room).toBeUndefined();
  });
  it('операции с модулями не теряют помещение', () => {
    const P = kitchen(R({ skirt: 20 }));
    moveModule(P, 0, 1); removeModule(P, 1);
    expect(P.room && P.room.skirt).toBe(20);
  });
});

describe('помещение: привязка к стенам и замечания', () => {
  it('без помещения замечаний нет, при просторном — тоже', () => {
    expect(roomWarnings(buildProject(kitchen()), null)).toEqual([]);
    expect(buildProject(kitchen(R())).warnings.filter(w => /стен|потолк|проём|плинтус/.test(w))).toEqual([]);
  });
  it('угловой ряд: стена B слева, ряд A начинается в углу', () => {
    const room = normalizeRoom(R()), proj = buildProject(kitchen(room)), f = roomFrame(proj, room);
    expect(f.corner).toBe('L');
    const a = proj.mods.filter(m => m.run === 0).map(m => f.place(m));
    expect(Math.min(...a.map(p => p.u0))).toBeCloseTo(0, 3);
    expect(Math.max(...proj.mods.filter(m => m.run === 1).map(m => f.place(m).v0))).toBeGreaterThanOrEqual(0);
  });
  it('стена короче ряда и низкий потолок дают замечания с цифрами', () => {
    const P = kitchen(R({ w: 1000, h: 1500 })); addModule(P, makePreset('ktall'), { name: 'Пенал', after: 0 }); normalize(P);
    const proj = buildProject(P);
    expect(proj.warnings.some(w => /выходит за стену A на \d+ мм/.test(w))).toBe(true);
    expect(proj.warnings.some(w => /выше потолка на \d+ мм/.test(w))).toBe(true);
  });
  it('окно над нижним модулем не мешает, а навесной шкаф в окне — мешает', () => {
    const room = R({ openings: [{ kind: 'window', wall: 'A', x: 0, w: 1300, y: 950, h: 1200 }] });
    expect(buildProject(kitchen(room)).warnings.filter(w => /перекрывает/.test(w))).toEqual([]);
    const P = kitchen(room); addModule(P, makePreset('kwall'), { name: 'Навесной', over: true, y: 1400, after: 0 });
    normalize(P);
    expect(buildProject(P).warnings.some(w => /Навесной: перекрывает окно на стене A/.test(w))).toBe(true);
  });
  it('дверь на стене B перекрывается угловым рядом', () => {
    const room = R({ openings: [{ kind: 'door', wall: 'B', x: 0, w: 900, y: 0, h: 2050 }] });
    expect(buildProject(kitchen(room)).warnings.some(w => /перекрывает дверь на стене B/.test(w))).toBe(true);
  });
  it('плинтус мешает корпусам на полу, кроме ножек выше плинтуса', () => {
    const w = buildProject(kitchen(R({ skirt: 150 }))).warnings.filter(x => /плинтус/.test(x));
    expect(w.length).toBe(3);
    expect(buildProject(kitchen(R({ skirt: 80 }))).warnings.filter(x => /плинтус/.test(x))).toEqual([]);
  });
});

describe('помещение: план', () => {
  it('на плане есть помещение и проёмы', () => {
    const svg = planView(buildProject(kitchen(R({ openings: [{ kind: 'window', wall: 'A', x: 500, w: 1200, y: 900, h: 1200 }, { kind: 'door', wall: 'B', x: 1500, w: 900, y: 0, h: 2050 }] }))));
    expect(svg).toContain('data-room="1"'); expect(svg).toContain('data-opening="window"'); expect(svg).toContain('data-opening="door"');
    expect(svg).toContain('Помещение 4000 × 3000');
  });
  it('без помещения план прежний', () => {
    expect(planView(buildProject(kitchen()))).not.toContain('data-room');
  });
});
