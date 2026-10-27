import { describe, it, expect } from 'vitest';
import { makePreset, normalize } from '../web/rules.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { ACCESSORIES, ACC_KEYS } from '../web/norms.js';
import { sanitizeCatalog } from '../web/catalog.js';
import { hwPrice } from '../web/catalog.js';

const acc = (list, mod = () => {}) => { const P = makePreset('wardrobe'); P.sections[1].acc = list; mod(P); return normalize(P); };
const chk = P => checkBuild(buildSpec(P), P, { skipKin: true }).filter(f => f.code === 'acc');

describe('аксессуары секции шкафа', () => {
  it('нормализация: дубли и мусор убираются, пустой список удаляется, вне шкафа аксессуаров нет', () => {
    expect(acc(['pantograph', 'pantograph', 'x', 'shoeRack']).sections[1].acc).toEqual(['pantograph', 'shoeRack']);
    expect(acc(['x']).sections[1].acc).toBeUndefined();
    const R = makePreset('rack'); R.sections[0].acc = ['shoeRack']; normalize(R); expect(R.sections[0].acc).toBeUndefined();
  });
  it('каждый аксессуар попадает в спецификацию и фурнитуру со своим названием и крепежом', () => {
    for (const k of ACC_KEYS) {
      const sp = buildSpec(acc([k]));
      expect(sp.hw.find(([n]) => n === ACCESSORIES[k].hw), k).toEqual([ACCESSORIES[k].hw, 1]);
      expect(sp.hw.find(([n]) => /аксессуар/.test(n))[1]).toBe(4);
      expect(sp.extras.some(e => e.name === ACCESSORIES[k].label && e.sec === 2), k).toBe(true);
    }
  });
  it('без аксессуаров спецификация прежняя', () => {
    expect(buildSpec(acc([])).hw.some(([n]) => /аксессуар/.test(n))).toBe(false);
  });
  it('узкая секция и низкая внутренняя высота дают замечания с цифрами', () => {
    const P = acc(['pantograph'], P => { P.sections[1].width = 300; }); const w = chk(P);
    expect(w.some(f => /ширины не меньше 450 мм, а в секции 300 мм/.test(f.text))).toBe(true);
    expect(chk(acc(['trouserRack'])).length).toBe(0);
  });
  it('все аксессуары в типовой секции помещаются без замечаний сборки', () => {
    const P = acc(ACC_KEYS), sp = buildSpec(P);
    expect(sp.warnings).toEqual([]);
    expect(checkBuild(sp, P, { skipKin: true }).filter(f => f.level === 'error')).toEqual([]);
  });
  it('цена аксессуара по справочнику не путается со штангой', () => {
    const cat = sanitizeCatalog(null);
    cat.hardware.find(h => h.match === 'Выдвижная штанга').price = 777;
    expect(hwPrice(cat, ACCESSORIES.pullRod.hw)).toBe(777);
    expect(hwPrice(cat, 'Штанга Ø25, L=800 мм')).toBe(350);
  });
});
