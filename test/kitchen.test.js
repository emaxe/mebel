import { describe, it, expect } from 'vitest';
import { makePreset, normalize, TYPE_RULES, innerH } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { groupParts, nest } from '../web/export.js';
import { APPLIANCES } from '../web/norms.js';

const KITCHEN = ['kbase', 'kwall', 'ktall'];
const errors = P => checkBuild(buildSpec(P), P, { skipKin: true }).filter(f => f.level === 'error').map(f => f.text);

describe('кухонные модули', () => {
  for (const type of KITCHEN) {
    it(`${type}: пресет собирается без ошибок проверки и предупреждений ядра`, () => {
      const P = makePreset(type), spec = buildSpec(P);
      expect(errors(P)).toEqual([]);
      expect(spec.warnings).toEqual([]);
      expect(spec.parts.length).toBeGreaterThanOrEqual(8);
      expect(nest(groupParts(spec)).over).toEqual([]);
    });
    it(`${type}: размеры в пределах правил, внутренняя высота положительна`, () => {
      const P = makePreset(type), R = TYPE_RULES[type];
      expect(P.height).toBeGreaterThanOrEqual(R.height[0]); expect(P.height).toBeLessThanOrEqual(R.height[1]);
      expect(P.depth).toBeGreaterThanOrEqual(R.depth[0]); expect(innerH(P)).toBeGreaterThan(150);
    });
  }
  it('нижний модуль: две царги вместо крышки, ширина и положение по правилам', () => {
    const P = makePreset('kbase'), spec = buildSpec(P), names = spec.parts.map(p => p.name);
    expect(names).not.toContain('Крышка');
    const rear = spec.parts.find(p => p.name === 'Царга задняя'), front = spec.parts.find(p => p.name === 'Царга передняя');
    expect(rear.W).toBe(P.railW); expect(front.W).toBe(P.railW);
    expect(rear.L).toBeCloseTo(spec.meta.W - 2 * P.thickness, 6);
    const Dc = P.backType === 'overlay' ? spec.meta.D - 4 : spec.meta.D;
    expect(front.c[2] - rear.c[2]).toBeCloseTo(Dc - P.railW, 6);
    expect(rear.c[1]).toBeCloseTo(P.height - P.thickness / 2, 6);
  });
  it('царги соединены с боковинами и перегородками парными отверстиями', () => {
    const P = makePreset('kbase');
    P.sections = [{ ...P.sections[0] }, { ...P.sections[0] }];
    normalize(P);
    const spec = buildSpec(P);
    expect(errors(P)).toEqual([]);
    for (const nm of ['Царга задняя', 'Царга передняя']) {
      const rail = spec.parts.find(p => p.name === nm);
      expect(rail.holes.filter(h => h.f === 'w1').length).toBeGreaterThan(0);
      expect(rail.holes.filter(h => h.f === 'w2').length).toBeGreaterThan(0);
      expect(rail.holes.filter(h => h.f === 'A').length).toBeGreaterThan(0);
    }
  });
  it('царги работают со всеми видами крепежа', () => {
    for (const joint of ['confirmat', 'minifix', 'dowel']) { const P = makePreset('kbase', { joint }); expect(errors(P), joint).toEqual([]); }
  });
  it('царги доступны только нижнему модулю, остальным заменяются крышкой', () => {
    for (const type of ['wardrobe', 'kwall', 'ktall', 'dresser']) { const P = makePreset(type); P.topType = 'rails'; normalize(P); expect(P.topType, type).not.toBe('rails'); }
    const P = makePreset('kbase'); P.topType = 'rails'; normalize(P); expect(P.topType).toBe('rails');
  });
  it('ширина царги ограничивается', () => {
    const P = makePreset('kbase'); P.railW = 5; normalize(P); expect(P.railW).toBe(60);
    P.railW = 999; normalize(P); expect(P.railW).toBe(200);
  });
  it('верхний модуль на навесах, без анкерных уголков', () => {
    const hw = Object.fromEntries(buildSpec(makePreset('kwall')).hw);
    expect(hw['Навес кухонный регулируемый (комплект)']).toBe(2);
    expect(Object.keys(hw).some(k => /^Анкерный уголок/.test(k))).toBe(false);
    const hw2 = Object.fromEntries(buildSpec(makePreset('kbase')).hw);
    expect(Object.keys(hw2).some(k => /^Анкерный уголок/.test(k))).toBe(true);
  });
  it('нижний модуль на ножках с двумя дверьми и полкой, верхний без основания', () => {
    const b = buildSpec(makePreset('kbase')), w = buildSpec(makePreset('kwall'));
    expect(b.extras.filter(e => e.name === 'Ножка').length).toBeGreaterThanOrEqual(4);
    expect(w.parts.some(p => /Цоколь/.test(p.name))).toBe(false);
    expect(b.parts.filter(p => p.name === 'Фасад двери').length).toBe(2);
  });
  it('подъёмный фасад у верхнего модуля и ящики у нижнего допустимы', () => {
    const w = makePreset('kwall'); w.sections[0].door = 'flapUp'; normalize(w);
    expect(w.sections[0].door).toBe('flapUp'); expect(errors(w)).toEqual([]);
    const k = makePreset('kbase', {}); k.sections[0].door = 'none'; k.sections[0].items = [{ type: 'drawer', y: 0, h: 200 }, { type: 'drawer', y: 200, h: 200 }, { type: 'drawer', y: 400, h: 200 }]; normalize(k);
    expect(errors(k)).toEqual([]);
  });
  it('в проекте нижний и верхний модули стоят вместе, верхний поднят', async () => {
    const { addModule, buildProject } = await import('../web/project.js');
    const r = makePreset('kbase'); addModule(r, makePreset('kwall'), { name: 'Верх', y: 1400 });
    const pr = buildProject(r);
    expect(pr.mods[1].y).toBe(1400);
    expect(pr.spec.meta.H).toBeGreaterThanOrEqual(1400 + pr.mods[1].H - 1e-6);
  });
});

describe('цокольная планка', () => {
  it('у нижнего модуля и пенала по умолчанию, размеры по ножкам', () => {
    for (const type of ['kbase', 'ktall']) {
      const P = makePreset(type), spec = buildSpec(P), s = spec.parts.find(p => p.name === 'Цокольная планка');
      expect(s, type).toBeTruthy(); expect(s.L).toBeCloseTo(spec.meta.W, 6); expect(s.W).toBe(P.plinth - 5); expect(s.T).toBe(16);
      expect(s.c[1] - s.W / 2).toBeCloseTo(3, 6);
      expect(s.c[2] + s.T / 2).toBeCloseTo(P.depth / 2 - 50, 6);
      expect(errors(P)).toEqual([]);
    }
  });
  it('клипсы по числу ножек', () => {
    const spec = buildSpec(makePreset('kbase')), legs = spec.extras.filter(e => e.name === 'Ножка').length, hw = Object.fromEntries(spec.hw);
    expect(hw['Клипса цокольная (к ножке)']).toBe(legs);
  });
  it('выключается, нужна только на ножках', () => {
    const off = makePreset('kbase'); delete off.plinthStrip; expect(buildSpec(off).parts.some(p => p.name === 'Цокольная планка')).toBe(false);
    const on = makePreset('kbase'); on.base = 'plinth'; normalize(on); expect(on.plinthStrip).toBeUndefined();
    expect(buildSpec(makePreset('wardrobe')).parts.some(p => p.name === 'Цокольная планка')).toBe(false);
  });
  it('фасадный декор, попадает в раскрой отдельной деталью из фасадного материала', () => {
    const P = makePreset('kbase'), spec = buildSpec(P), s = spec.parts.find(p => p.name === 'Цокольная планка');
    expect(s.label).toBe(`ЛДСП ${P.frontName}`); expect(s.mat).toBe('front');
    expect(nest(groupParts(spec)).over).toEqual([]);
  });
});

describe('узкие фасады с рамкой', () => {
  it('окно под стекло не получает отрицательный размер: стекло не создаётся, есть предупреждение и ошибка рамки', () => {
    const P = makePreset('kwall'); P.sections[0].width = 150; P.sections[0].door = 'double'; P.sections[0].frontStyle = 'glass'; normalize(P);
    const spec = buildSpec(P);
    expect(spec.warnings.some(w => /слишком мал для окна под стекло/.test(w))).toBe(true);
    expect(spec.parts.some(p => p.name === 'Стекло фасада')).toBe(false);
    expect(spec.parts.every(p => Number.isFinite(p.L) && p.L > 0 && p.W > 0)).toBe(true);
    expect(checkBuild(spec, P, { skipKin: true }).some(f => f.code === 'frame')).toBe(true);
  });
  it('нормальный фасад под стекло не меняется', () => {
    const P = makePreset('kwall'); P.sections[0].door = 'double'; P.sections[0].frontStyle = 'glass'; normalize(P);
    const spec = buildSpec(P);
    expect(spec.parts.some(p => p.name === 'Стекло фасада')).toBe(true); expect(spec.warnings.some(w => /слишком мал/.test(w))).toBe(false);
  });
});

describe('встраиваемая техника в нише', () => {
  const build = (type, appliance, o = {}) => { const P = makePreset(type); P.appliance = appliance; Object.assign(P, o); const N = normalize(P); return { N, spec: buildSpec(N) }; };
  it('допустима только для своих типов и убирает наполнение первой секции', () => {
    expect(build('kbase', 'oven').N.appliance).toBe('oven');
    expect(build('kbase', 'fridge').N.appliance).toBeUndefined();
    expect(build('wardrobe', 'oven').N.appliance).toBeUndefined();
    expect(build('kbase', 'none').N.appliance).toBeUndefined();
    const { N } = build('kbase', 'oven');
    expect(N.sections[0].items).toEqual([]);
    expect(N.sections[0].door).toBe('none');
  });
  it('посудомойка и холодильник сохраняют фасад', () => {
    const P = makePreset('kbase'); P.sections[0].door = 'left'; P.appliance = 'dishwasher';
    expect(normalize(P).sections[0].door).toBe('left');
  });
  it('прибор попадает в 3D (extras) и в список фурнитуры', () => {
    const { spec } = build('kbase', 'oven');
    expect(spec.extras.filter(e => e.name === 'Духовой шкаф').length).toBe(2);
    expect(spec.hwx.find(e => e.kind === 'appliance').name).toBe('Духовой шкаф встраиваемый');
    expect(spec.warnings).toEqual([]);
  });
  it('габариты прибора лежат внутри корпуса', () => {
    for (const [t, a] of [['kbase', 'oven'], ['kbase', 'dishwasher'], ['ktall', 'oven'], ['ktall', 'micro'], ['ktall', 'fridge'], ['kwall', 'hood'], ['kwall', 'micro']]) {
      const { spec } = build(t, a), { yB, yT } = spec.meta;
      for (const e of spec.extras.filter(x => x.name === APPLIANCES[a].label)) {
        expect(e.c[1] - e.s[1] / 2).toBeGreaterThanOrEqual(yB - 1e-6);
        expect(e.c[1] + e.s[1] / 2).toBeLessThanOrEqual(yT + 1e-6);
      }
    }
  });
  it('тесная ниша даёт предупреждения', () => {
    const P = makePreset('kbase'); P.appliance = 'oven'; P.sections[0].width = 400; P.depth = 400;
    const w = buildSpec(normalize(P)).warnings.join('|');
    expect(w).toMatch(/Духовой шкаф: ниша шириной/);
    expect(w).toMatch(/глубина ниши/);
  });
  it('в списке «не подтверждено» и в шаблонах библиотеки', async () => {
    const { unverifiedList } = await import('../web/verify.js');
    expect(unverifiedList(build('kbase', 'oven').N).some(u => u.id === 'appliance')).toBe(true);
    expect(unverifiedList(makePreset('kbase')).some(u => u.id === 'appliance')).toBe(false);
    const { TEMPLATES, instantiate } = await import('../web/library.js');
    for (const id of ['k-oven-app', 'k-dishwasher', 't-fridge', 'w-hood']) {
      const tp = TEMPLATES.find(x => x.id === id);
      expect(tp, id).toBeTruthy();
      expect(instantiate(tp).P.appliance).toBeTruthy();
    }
  });
});

describe('техника: высота установки, две единицы в нише, вытяжка над варкой', () => {
  const tall = (o = {}) => { const P = makePreset('ktall'); Object.assign(P, o); return normalize(P); };
  const box = (spec, label) => spec.extras.find(e => e.name === label && e.s[2] > 10);
  it('у духовки и СВЧ в пенале есть высота установки, у холодильника и кухонных типов нет', () => {
    expect(tall({ appliance: 'oven' }).applianceY).toBe(800);
    expect(tall({ appliance: 'micro' }).applianceY).toBe(1400);
    expect(tall({ appliance: 'fridge' }).applianceY).toBeUndefined();
    const P = makePreset('kbase'); P.appliance = 'oven'; P.applianceY = 900;
    expect(normalize(P).applianceY).toBeUndefined();
    expect(tall({ appliance: 'oven', applianceY: 99999 }).applianceY).toBe(2400);
  });
  it('низ духовки стоит на заданной высоте над полом', () => {
    const s = buildSpec(tall({ appliance: 'oven', applianceY: 1000 })), e = box(s, 'Духовой шкаф');
    expect(e.c[1] - e.s[1] / 2).toBeCloseTo(1000, 6);
    expect(s.warnings).toEqual([]);
  });
  it('вторая техника встаёт на первую; одинаковая и лишняя отбрасываются', () => {
    const P = tall({ appliance: 'oven', appliance2: 'micro' }), s = buildSpec(P), o = box(s, 'Духовой шкаф'), m = box(s, 'Микроволновая печь');
    expect(m.c[1] - m.s[1] / 2).toBeCloseTo(o.c[1] + o.s[1] / 2, 6);
    expect(s.hwx.filter(e => e.kind === 'appliance').length).toBe(2);
    expect(tall({ appliance: 'oven', appliance2: 'oven' }).appliance2).toBeUndefined();
    expect(tall({ appliance: 'fridge', appliance2: 'micro' }).appliance2).toBeUndefined();
    expect(tall({ appliance2: 'micro' }).appliance2).toBeUndefined();
  });
  it('прибор выше ниши — предупреждение, но внутри корпуса', () => {
    const s = buildSpec(tall({ appliance: 'oven', applianceY: 2300 }));
    expect(s.warnings.join('|')).toMatch(/не помещается в нишу/);
    expect(box(s, 'Духовой шкаф').c[1] + box(s, 'Духовой шкаф').s[1] / 2).toBeLessThanOrEqual(s.meta.yT + 1e-6);
  });
  it('вытяжка над варочной панелью: допустимое расстояние и нарушения', async () => {
    const { addModule, buildProject } = await import('../web/project.js');
    const run = y => {
      const r = makePreset('kbase'); r.sections[0].width = 600;
      const h = makePreset('kwall'); h.appliance = 'hood'; h.sections[0].width = 600;
      addModule(r, h, { name: 'Вытяжка', over: true, y });
      r.countertop = { T: 38, front: 30, side: 0, cutouts: [{ kind: 'hob', w: 560, h: 490, x: 20, y: 50, r: 8 }] };
      return buildProject(normalize(r)).warnings.filter(w => /^Вытяжка/.test(w));
    };
    expect(run(1550)).toEqual([]);
    expect(run(1000).join('|')).toMatch(/меньше 650/);
    expect(run(2000).join('|')).toMatch(/больше 850/);
  });
  it('вытяжка без варочной панели не ругается; расстояние в списке «не подтверждено»', async () => {
    const { addModule, buildProject } = await import('../web/project.js'), { unverifiedList } = await import('../web/verify.js');
    const r = makePreset('kbase'), h = makePreset('kwall'); h.appliance = 'hood';
    addModule(r, h, { name: 'Вытяжка', over: true, y: 1400 });
    expect(buildProject(normalize(r)).warnings.filter(w => /^Вытяжка/.test(w))).toEqual([]);
    expect(unverifiedList(normalize(h)).some(u => u.id === 'hood.gap')).toBe(true);
  });
});

describe('ящик под духовкой и шаблон вытяжки', () => {
  it('ящик остаётся под духовкой, если хватает высоты, и не пересекается с ней', () => {
    const P = makePreset('kbase'); P.plinth = 60; P.appliance = 'oven'; const N = normalize(P), it0 = N.sections[0].items;
    expect(it0.length).toBe(1); expect(it0[0].type).toBe('drawer');
    const s = buildSpec(N), oven = s.extras.find(e => e.name === 'Духовой шкаф' && e.s[2] > 10);
    expect(s.meta.yB + it0[0].y + it0[0].h).toBeLessThan(oven.c[1] - oven.s[1] / 2 + 1e-6);
    expect(s.warnings).toEqual([]);
  });
  it('на стандартном нижнем модуле места под ящик нет', () => {
    const P = makePreset('kbase'); P.appliance = 'oven';
    expect(normalize(P).sections[0].items).toEqual([]);
  });
  it('шаблон вытяжки поднят на 1550 мм и проходит проверку расстояния', async () => {
    const { TEMPLATES, instantiate } = await import('../web/library.js');
    expect(instantiate(TEMPLATES.find(t => t.id === 'w-hood')).y).toBe(1550);
  });
});
