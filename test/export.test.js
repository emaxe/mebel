import { describe, it, expect } from 'vitest';
import { makePreset } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { toCSV, toDXF, groupParts, nest } from '../web/export.js';

describe('выгрузки открываются', () => {
  for (const type of ['wardrobe', 'rack', 'nightstand', 'dresser', 'tv']) {
    it(`${type}: CSV, DXF и раскрой`, () => {
      const P = makePreset(type), spec = buildSpec(P), G = groupParts(spec);
      const csv = toCSV(spec, 'Тест'), raw = toDXF(spec), N = nest(G);
      const dxf = typeof raw === 'string' ? raw : Buffer.from(raw).toString('latin1'); // DXF в cp1251
      expect(csv.length).toBeGreaterThan(200);
      expect(csv).not.toMatch(/undefined|NaN/);
      expect(dxf).toMatch(/SECTION/);
      expect(dxf).toMatch(/EOF/);
      expect(N.over).toEqual([]);
    });
  }
});

describe('корректность выгрузок', () => {
  it('CSV: нулевая координата отверстия не теряется', () => {
    const spec = buildSpec(makePreset('wardrobe')), G = groupParts(spec);
    const zero = G.flatMap(g => g.holes).filter(h => h.u === 0 || h.v === 0);
    expect(zero.length).toBeGreaterThan(0);
    const lines = toCSV(spec, 'Т').split('\r\n').filter(l => /^"";"";"\d+";"[^"]+";"[^"]*";"[^"]*";"\d+"/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) {
      const c = l.split(';');
      expect(c[4], l).not.toBe('""');
      expect(c[5], l).not.toBe('""');
    }
  });
  it('DXF: знак номера кодируется как cp1251 0xB9, а не «?»', () => {
    const raw = toDXF(buildSpec(makePreset('wardrobe')));
    const bytes = Buffer.from(raw);
    expect(bytes.includes(0xb9)).toBe(true);
    expect(bytes.toString('latin1')).not.toMatch(/\?\d+ /);
  });
});

describe('раскрой: направление текстуры', () => {
  const oak = w => {
    const P = makePreset('wardrobe');
    P.bodyName = 'Дуб';
    P.sections.forEach(s => { s.width = (w - (P.sections.length + 1) * P.thickness) / P.sections.length; });
    return buildSpec(P);
  };
  it('широкий цоколь из текстурного декора помещается на лист', () => {
    const N = nest(groupParts(oak(2472)));
    expect(N.over.filter(o => !/ХДФ/.test(o.mat))).toEqual([]);
  });
  it('все детали лежат строго внутри листа и не пересекаются', () => {
    const N = nest(groupParts(oak(1800)));
    for (const sh of N.sheets) {
      const ps = sh.pieces;
      for (const a of ps) { expect(a.x).toBeGreaterThanOrEqual(0); expect(a.y).toBeGreaterThanOrEqual(0); expect(a.x + a.l).toBeLessThanOrEqual(sh.L + 1e-6); expect(a.y + a.w).toBeLessThanOrEqual(sh.W + 1e-6); }
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i], b = ps[j];
        expect(a.x < b.x + b.l && b.x < a.x + a.l && a.y < b.y + b.w && b.y < a.y + a.w).toBe(false);
      }
    }
  });
});

import { checkBuild } from '../web/check.js';
describe('задняя стенка больше листа', () => {
  const big = (w, backType) => {
    const P = makePreset('wardrobe');
    P.backType = backType;
    P.sections.forEach(s => { s.width = (w - (P.sections.length + 1) * P.thickness) / P.sections.length; });
    return buildSpec(P);
  };
  for (const bt of ['groove', 'overlay']) {
    it(`${bt}: делится на части, которые помещаются на лист`, () => {
      const spec = big(2472, bt), backs = spec.parts.filter(p => p.name === 'Задняя стенка');
      expect(backs.length).toBeGreaterThan(1);
      expect(nest(groupParts(spec)).over).toEqual([]);
      const xs = backs.map(p => [p.c[0] - p.L / 2, p.c[0] + p.L / 2]).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < xs.length; i++) expect(xs[i][0] - xs[i - 1][1]).toBeGreaterThan(0.4);
    });
    it(`${bt}: общая ширина частей равна ширине проёма`, () => {
      const spec = big(2472, bt), backs = spec.parts.filter(p => p.name === 'Задняя стенка');
      const total = backs.reduce((a, p) => a + p.L, 0) + (backs.length - 1);
      expect(total).toBeCloseTo(bt === 'groove' ? 2472 - 36 + 14 : 2472 - 4, 0);
    });
  }
  it('штатный шкаф остаётся одной стенкой', () => {
    expect(buildSpec(makePreset('wardrobe')).parts.filter(p => p.name === 'Задняя стенка').length).toBe(1);
  });
  it('разбитая стенка не даёт ошибок пересечения', () => {
    const P = makePreset('wardrobe');
    P.sections.forEach(s => { s.width = (2472 - 4 * P.thickness) / 3; });
    const errs = checkBuild(buildSpec(P), P, { skipKin: true }).filter(i => i.level === 'error');
    expect(errs.map(e => e.text)).toEqual([]);
  });
});

import { STAGES } from '../web/model.js';
describe('средний цоколь', () => {
  it('ставится после стяжки перегородок, а не до неё', () => {
    const P = makePreset('wardrobe'), spec = buildSpec(P), mids = spec.parts.filter(p => p.name === 'Цоколь средний');
    expect(mids.length).toBeGreaterThan(0);
    for (const m of mids) expect(STAGES.indexOf(m.asm)).toBeGreaterThanOrEqual(STAGES.indexOf('dividers'));
  });
});

describe('заглушки на видимые конфирматы', () => {
  const visible = spec => [['Боковина левая', 'A'], ['Боковина правая', 'B'], ['Крышка', 'A']].reduce((a, [n, f]) => a + spec.parts.find(p => p.name === n).holes.filter(h => h.f === f && h.d === 7 && h.h === 'скв.').length, 0);
  for (const top of ['overlay', 'inset']) it(`конфирмат, крышка ${top}: заглушек столько же, сколько видимых шляпок`, () => {
    const P = makePreset('dresser'); P.topType = top; P.joint = 'confirmat';
    const spec = buildSpec(P), plug = [...spec.hw].find(([k]) => /^Заглушка/.test(k));
    expect(visible(spec)).toBeGreaterThan(0);
    expect(plug[1]).toBe(visible(spec));
  });
  it('минификс и шканты: заглушки не нужны', () => {
    for (const joint of ['minifix', 'dowel']) {
      const P = makePreset('dresser'); P.joint = joint;
      expect([...buildSpec(P).hw].some(([k]) => /^Заглушка/.test(k))).toBe(false);
    }
  });
});


describe('МДФ-фасады и ссылка', () => {
  it('фасады «рамка» и «под стекло» не кромятся, пильный размер равен чистовому', () => {
    for (const style of ['shaker', 'glass']) {
      const P = makePreset('wardrobe'); P.sections.forEach(s => { s.door = 'double'; s.frontStyle = style; });
      const doors = buildSpec(P).parts.filter(p => p.name === 'Фасад двери');
      expect(doors.length).toBeGreaterThan(0);
      for (const d of doors) { expect(Object.values(d.edges).every(v => !v)).toBe(true); const g = groupParts({ parts: [d] })[0]; expect(g.saw.L).toBe(g.L); expect(g.saw.W).toBe(g.W); }
    }
  });
  it('гладкие фасады из ЛДСП по-прежнему кромятся по периметру', () => {
    const d = buildSpec(makePreset('wardrobe')).parts.find(p => p.name === 'Фасад двери');
    expect(Object.values(d.edges).every(v => v > 0)).toBe(true);
  });
  it('production.html сохраняет ?share= при смене режима', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../web/production.html', import.meta.url), 'utf8');
    expect(src).toMatch(/location\.pathname \+ location\.search/);
    expect(src).not.toMatch(/mebel-bought:' \+ \(shareToken \|\| projName\)/);
  });
});

describe('антресоль при купе', () => {
  it('предупреждение вместо молчаливого пропуска', () => {
    const P = makePreset('wardrobe'); P.doorType = 'sliding'; P.sections[0].split = 400;
    const spec = buildSpec(P);
    expect(spec.warnings.some(w => /антресоль/.test(w))).toBe(true);
  });
});
