import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { randomProject } from './helpers.js';

const errors = (spec, P) => checkBuild(spec, P).filter(f => f.level === 'error');
const fmt = list => [...new Set(list.map(f => `${f.code}: ${f.text}`))].slice(0, 6).join('\n');

describe('пресеты собираются', () => {
  for (const type of ['wardrobe', 'rack', 'nightstand', 'dresser', 'tv']) for (const joint of ['confirmat', 'minifix', 'dowel']) for (const thickness of [16, 18, 22]) {
    it(`${type} · ${joint} · ${thickness} мм`, () => {
      const P = makePreset(type, { joint, thickness }), spec = buildSpec(P);
      expect(fmt(errors(spec, P))).toBe('');
    });
  }
  it('шкаф-купе', () => {
    const P = makePreset('wardrobe', { doorType: 'sliding' }), spec = buildSpec(P);
    expect(fmt(errors(spec, P))).toBe('');
  });
});

describe('случайные проекты', () => {
  it('300 допустимых проектов собираются без ошибок', () => {
    let tested = 0, skipped = 0;
    const bad = [];
    for (let seed = 1; seed <= 300; seed++) {
      const P = randomProject(seed), spec = buildSpec(P);
      if (spec.warnings.length) { skipped++; continue; } // сам расчёт уже сообщил о проблеме
      tested++;
      const e = errors(spec, P);
      if (e.length) bad.push(`seed ${seed} (${P.type}, ${P.joint}, t=${P.thickness}, ${P.slide}/${P.hinge}${P.push ? '/push' : ''}, ${P.base}, ${P.backType}):\n${fmt(e.slice(0, 3))}`);
    }
    expect(tested).toBeGreaterThan(120);
    expect(bad.join('\n\n')).toBe('');
    void skipped;
  });
});

describe('проверка ловит поломки', () => {
  const fresh = (type = 'wardrobe', keep = {}) => { const P = makePreset(type, keep); return [P, buildSpec(P)]; };
  const codes = (spec, P) => new Set(checkBuild(spec, P).map(f => f.code));

  it('удалённое ответное отверстие в торце', () => {
    const [P, spec] = fresh();
    const d = spec.parts.find(p => p.name === 'Перегородка'), i = d.holes.findIndex(h => h.note === 'конфирмат');
    d.holes.splice(i, 1);
    expect(codes(spec, P)).toContain('mate');
  });
  it('полка без полкодержателей', () => {
    const [P, spec] = fresh('rack');
    const side = spec.parts.find(p => p.name === 'Боковина левая');
    side.holes = side.holes.filter(h => h.note !== 'полкодержатель');
    expect(codes(spec, P)).toContain('shelf-pin');
  });
  it('push вместе с доводчиком и ручками', () => {
    const [P, spec] = fresh('wardrobe');
    P.push = true;
    expect(codes(spec, P)).toContain('push');
  });
  it('отверстие вне детали', () => {
    const [P, spec] = fresh();
    spec.parts.find(p => p.name === 'Боковина левая').holes.push({ f: 'A', u: 10, v: 99999, d: 5, h: 12, note: 'лишнее' });
    expect(codes(spec, P)).toContain('hole-out');
  });
  it('сквозное сверление с двух сторон', () => {
    const [P, spec] = fresh();
    const s = spec.parts.find(p => p.name === 'Боковина левая');
    s.holes.push({ f: 'A', u: 500, v: 100, d: 5, h: 12, note: 'x' }, { f: 'B', u: 500, v: 100, d: 5, h: 12, note: 'x' });
    expect(codes(spec, P)).toContain('hole-through');
  });
  it('пересекающиеся детали', () => {
    const [P, spec] = fresh();
    const s = spec.parts.find(p => p.name === 'Боковина левая');
    spec.parts.push({ ...s, name: 'Лишняя', holes: [], notes: [] });
    expect(codes(spec, P)).toContain('overlap');
  });
  it('деталь, висящая в воздухе', () => {
    const [P, spec] = fresh('rack');
    const sh = spec.parts.find(p => p.name === 'Полка съёмная');
    spec.parts.push({ ...sh, name: 'Парящая', c: [sh.c[0], sh.c[1] + 77, sh.c[2]], holes: [], notes: [] });
    expect(codes(spec, P)).toContain('floating');
  });
  it('лишний крепёж в списке', () => {
    const [P, spec] = fresh();
    spec.hwx.find(e => e.kind === 'confirmat').qty += 3;
    expect(codes(spec, P)).toContain('count-confirmat');
  });
  it('лишняя петля по высоте двери', () => {
    const [P, spec] = fresh();
    const d = spec.parts.find(p => p.name === 'Фасад двери'), i = d.holes.findIndex(h => h.note === 'чашка петли');
    d.holes.splice(i, 1);
    expect(codes(spec, P)).toContain('hinge-count');
  });
  it('высокий шкаф без крепления к стене — предупреждение, у пресета крепление включено', () => {
    expect(codes(...fresh('wardrobe').reverse())).not.toContain('tip');
    const [P, spec] = fresh('wardrobe', { wallFix: false });
    const tip = checkBuild(spec, P).find(f => f.code === 'tip');
    expect(tip && tip.level).toBe('warn');
  });
});
