// Справочники: декоры, листы, кромка, фурнитура, работы, параметры раскроя. Без DOM: работает и в node.
export const CATALOG_KEY = 'mebel-catalog';
/** Подписка на запись справочника (синхронизация с сервером): catalogHooks.onSave = () => … */
export const catalogHooks = { onSave: null };

export const DEFAULT_CATALOG = {
  decors: [
    { name: 'Белый', color: '#ecebe7', textured: false, price: 0 },
    { name: 'Бежевый', color: '#d9cdb8', textured: false, price: 0 },
    { name: 'Дуб', color: '#c49a6c', textured: true, price: 0 },
    { name: 'Орех', color: '#6e4b33', textured: true, price: 0 },
    { name: 'Шалфей', color: '#9aa595', textured: false, price: 0 },
    { name: 'Графит', color: '#3a3b3d', textured: false, price: 0 },
  ],
  // price — за лист; mat — начало названия материала в спецификации (ЛДСП, МДФ, ХДФ)
  sheets: [
    { mat: 'ЛДСП', T: 16, L: 2800, W: 2070, price: 2200 },
    { mat: 'ЛДСП', T: 18, L: 2800, W: 2070, price: 2500 },
    { mat: 'ЛДСП', T: 22, L: 2800, W: 2070, price: 3100 },
    { mat: 'ЛДСП', T: 25, L: 2800, W: 2070, price: 3500 },
    { mat: 'МДФ', T: 16, L: 2800, W: 2070, price: 5200 },
    { mat: 'МДФ', T: 19, L: 2800, W: 2070, price: 6000 },
    { mat: 'МДФ', T: 22, L: 2800, W: 2070, price: 6800 },
    { mat: 'ХДФ', T: 4, L: 2800, W: 2070, price: 700 },
  ],
  edge: { 0.4: 12, 1: 25, 2: 40 }, // руб. за пог. м
  hardware: [
    { match: 'Конфирмат', price: 3, art: '' },
    { match: 'Эксцентрик', price: 12, art: '' },
    { match: 'Шкант', price: 1.5, art: '' },
    { match: 'Полкодержатель', price: 2, art: '' },
    { match: 'Штанга', price: 350, art: '' },
    { match: 'Штангодержатель', price: 40, art: '' },
    { match: 'Петля', price: 120, art: '' },
    { match: 'Планка', price: 25, art: '' },
    { match: 'Направляющие', price: 650, art: '' },
    { match: 'Ручка', price: 180, art: '' },
    { match: 'Уголок мебельный', price: 15, art: '' },
    { match: 'Опора мебельная', price: 60, art: '' },
    { match: 'Саморез', price: 1, art: '' },
    { match: 'Газлифт', price: 450, art: '' },
  ],
  works: { cut: 60, edge: 45, hole: 8, assembly: 12 }, // распил руб./м реза, кромкование руб./м, присадка руб./отв., сборка % от материалов и фурнитуры
  special: { glass: 2800, mirror: 3200 }, // руб. за м² стекла и зеркала
  markup: 30, // %
  currency: '₽',
  cut: { kerf: 4, trim: 10, minOffcut: [300, 100] },
};

const clone = o => JSON.parse(JSON.stringify(o));
const merge = (base, over) => {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? clone(base) : clone(over);
  const out = {};
  for (const k of Object.keys(base)) out[k] = merge(base[k], over && over[k]);
  return out;
};

export function loadCatalog(storage = globalThis.localStorage) {
  let saved = null;
  try { saved = JSON.parse(storage.getItem(CATALOG_KEY) || 'null'); } catch { /* нет хранилища */ }
  return merge(DEFAULT_CATALOG, saved || {});
}
export function saveCatalog(c, storage = globalThis.localStorage) {
  try { storage.setItem(CATALOG_KEY, JSON.stringify(c)); } catch { /* нет хранилища */ }
  if (catalogHooks.onSave) try { catalogHooks.onSave(); } catch { /* подписчик не должен ломать сохранение */ }
}

const matKind = label => (/^ХДФ/.test(label) || /^МДФ/.test(label) ? label.slice(0, 3) : 'ЛДСП');
/** Лист для материала из спецификации («ЛДСП Белый», «МДФ Дуб, рамка», «ХДФ») и толщины. */
export function sheetFor(cat, label, T) {
  const k = matKind(label);
  return cat.sheets.find(s => s.mat === k && s.T === T) || cat.sheets.find(s => s.mat === k) || cat.sheets[0];
}
/** Текстура (направление волокон) берётся из флага декора, а не из названия. */
export function isTextured(cat, label) {
  return cat.decors.some(d => d.textured && label.includes(d.name));
}
/** Цена позиции фурнитуры по началу названия; null — цены нет. */
export function hwPrice(cat, name) {
  const h = cat.hardware.find(x => name.startsWith(x.match));
  return h && h.price > 0 ? h.price : null;
}
