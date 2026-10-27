// Справочники: декоры, листы, кромка, фурнитура, работы, параметры раскроя. Без DOM: работает и в node.
export const CATALOG_KEY = 'mebel-catalog';
/** Версия схемы справочника: при её росте в сохранённый справочник дописываются новые модели по умолчанию (по id). */
export const CATALOG_VERSION = 2;
/** Подписка на запись справочника (синхронизация с сервером): catalogHooks.onSave = () => … */
export const catalogHooks = { onSave: null };

export const DEFAULT_CATALOG = {
  version: CATALOG_VERSION,
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
    { match: 'Заглушка', price: 2, art: '' },
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
  // Модели фурнитуры для списка покупок. kind — категория (как в spec.hwx), variant — функциональный тип (необязателен),
  // price — за упаковку (pack штук) или за хлыст (stockLen мм) для штанг и профилей, art и url заполняются своими.
  // params — параметры присадки и геометрии модели (см. hwparams.js); пусто = значения по умолчанию.
  fittings: [
    { id: 'confirmat', kind: 'confirmat', variant: '', brand: '', name: 'Конфирмат 7×50', art: '', price: 150, pack: 50, stockLen: 0, url: '', params: {} },
    { id: 'plug', kind: 'plug', variant: '', brand: '', name: 'Заглушка на конфирмат', art: '', price: 100, pack: 50, stockLen: 0, url: '', params: {} },
    { id: 'minifix', kind: 'minifix', variant: '', brand: '', name: 'Эксцентрик (минификс) Ø15 + штифт', art: '', price: 120, pack: 10, stockLen: 0, url: '', params: {} },
    { id: 'dowel', kind: 'dowel', variant: '', brand: '', name: 'Шкант 8×35', art: '', price: 150, pack: 100, stockLen: 0, url: '', params: {} },
    { id: 'pin', kind: 'shelfPin', variant: '', brand: '', name: 'Полкодержатель Ø5', art: '', price: 40, pack: 20, stockLen: 0, url: '', params: {} },
    { id: 'pin-glass', kind: 'shelfPin', variant: 'glass', brand: '', name: 'Полкодержатель для стекла', art: '', price: 24, pack: 4, stockLen: 0, url: '', params: {} },
    { id: 'rodholder', kind: 'rodHolder', variant: '', brand: '', name: 'Штангодержатель', art: '', price: 80, pack: 2, stockLen: 0, url: '', params: {} },
    { id: 'rod', kind: 'rod', variant: '', brand: '', name: 'Штанга Ø25 хромированная', art: '', price: 700, pack: 1, stockLen: 3000, url: '', params: {} },
    { id: 'hinge-soft', kind: 'hinge', variant: 'soft', brand: '', name: 'Петля накладная 110° с доводчиком', art: '', price: 120, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'hinge-plain', kind: 'hinge', variant: 'plain', brand: '', name: 'Петля накладная 110° без доводчика', art: '', price: 70, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'hinge-wide', kind: 'hinge', variant: 'wide', brand: '', name: 'Петля накладная 165° с доводчиком', art: '', price: 220, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'hinge-half', kind: 'hinge', variant: 'half-soft', brand: '', name: 'Петля полунакладная с доводчиком', art: '', price: 130, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'hinge-half-plain', kind: 'hinge', variant: 'half-plain', brand: '', name: 'Петля полунакладная без доводчика', art: '', price: 80, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'hinge-half-wide', kind: 'hinge', variant: 'half-wide', brand: '', name: 'Петля полунакладная 165° с доводчиком', art: '', price: 230, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'hinge-flap', kind: 'hinge', variant: 'flap', brand: '', name: 'Петля для откидного фасада', art: '', price: 140, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'slide-ball', kind: 'slide', variant: 'ball', brand: '', name: 'Направляющие шариковые полного выдвижения (пара)', art: '', price: 650, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'slide-ballsoft', kind: 'slide', variant: 'ballSoft', brand: '', name: 'Направляющие шариковые с доводчиком (пара)', art: '', price: 900, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'slide-hidden', kind: 'slide', variant: 'hidden', brand: '', name: 'Направляющие скрытые с доводчиком (пара)', art: '', price: 1300, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'slide-roller', kind: 'slide', variant: 'roller', brand: '', name: 'Направляющие роликовые (пара)', art: '', price: 300, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'slide-push', kind: 'slide', variant: 'push', brand: '', name: 'Направляющие push-to-open (пара)', art: '', price: 1100, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'handle-bar', kind: 'handle', variant: 'bar', brand: '', name: 'Ручка-скоба', art: '', price: 180, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'handle-knob', kind: 'handle', variant: 'knob', brand: '', name: 'Ручка-кнопка', art: '', price: 120, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'handle-profile', kind: 'handle', variant: 'profile', brand: '', name: 'Ручка-профиль', art: '', price: 350, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'push', kind: 'pushLatch', variant: '', brand: '', name: 'Толкатель push-to-open', art: '', price: 90, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'bracket', kind: 'bracket', variant: '', brand: '', name: 'Уголок мебельный', art: '', price: 300, pack: 20, stockLen: 0, url: '', params: {} },
    { id: 'leg', kind: 'leg', variant: '', brand: '', name: 'Опора мебельная регулируемая', art: '', price: 60, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'screw', kind: 'screw', variant: '', brand: '', name: '', art: '', price: 100, pack: 100, stockLen: 0, url: '', params: {} },
    { id: 'glue', kind: 'glue', variant: '', brand: '', name: 'Клей ПВА столярный, 250 г', art: '', price: 180, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'gaslift', kind: 'gasLift', variant: '', brand: '', name: 'Газлифт подъёмный 80N', art: '', price: 450, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'stay', kind: 'stay', variant: '', brand: '', name: 'Стабилизатор откидного фасада', art: '', price: 300, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'kupe-rail-top', kind: 'kupeRail', variant: 'top', brand: '', name: 'Рельс купе верхний', art: '', price: 900, pack: 1, stockLen: 3000, url: '', params: {} },
    { id: 'kupe-rail-bottom', kind: 'kupeRail', variant: 'bottom', brand: '', name: 'Рельс купе нижний', art: '', price: 600, pack: 1, stockLen: 3000, url: '', params: {} },
    { id: 'kupe-profile-v', kind: 'kupeProfile', variant: 'v', brand: '', name: 'Профиль купе вертикальный', art: '', price: 800, pack: 1, stockLen: 3000, url: '', params: {} },
    { id: 'kupe-profile-h', kind: 'kupeProfile', variant: 'h', brand: '', name: 'Профиль купе горизонтальный', art: '', price: 800, pack: 1, stockLen: 3000, url: '', params: {} },
    { id: 'kupe-roller', kind: 'kupeRoller', variant: '', brand: '', name: 'Ролики двери-купе (комплект)', art: '', price: 600, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'wall-angle', kind: 'wallFix', variant: '', brand: '', name: 'Анкерный уголок для крепления к стене', art: '', price: 40, pack: 1, stockLen: 0, url: '', params: {} },
    { id: 'wall-dowel', kind: 'wallDowel', variant: '', brand: '', name: '', art: '', price: 40, pack: 4, stockLen: 0, url: '', params: {} },
  ],
  milling: { frameW: 70, recessDepth: 8, cornerR: 3, glassOverlap: 5, rebateDepth: 5, glassChamfer: 0, glassCornerR: 0 }, // фрезеровка фасадов и кромка стекла (hwparams.js)
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
  const own = v => (over && typeof over === 'object' && Object.prototype.hasOwnProperty.call(over, v) ? over[v] : undefined); // только свои свойства: у строки есть trim, у объекта — constructor
  for (const k of Object.keys(base)) out[k] = merge(base[k], own(k));
  return out;
};

/**
 * Справочник может прийти откуда угодно (хранилище, сервер, чужая ссылка): приводим форму к ожидаемой, чтобы страницы не падали.
 * Списки — массивы объектов, таблицы цен — объекты, числа — конечные числа; всё остальное заменяется значениями по умолчанию.
 */
export function sanitizeCatalog(c) {
  const out = merge(DEFAULT_CATALOG, c && typeof c === 'object' && !Array.isArray(c) ? c : {}), had = c && typeof c === 'object' && Number.isFinite(+c.version) ? +c.version : 1;
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  for (const k of ['decors', 'sheets', 'hardware', 'fittings']) {
    if (!Array.isArray(out[k])) out[k] = clone(DEFAULT_CATALOG[k]);
    out[k] = out[k].filter(isObj);
  }
  for (const k of ['edge', 'works', 'special', 'cut', 'milling']) if (!isObj(out[k])) out[k] = clone(DEFAULT_CATALOG[k]);
  if (!Array.isArray(out.cut.minOffcut) || out.cut.minOffcut.length < 2) out.cut.minOffcut = [...DEFAULT_CATALOG.cut.minOffcut];
  const num = (o, k, d) => { if (!Number.isFinite(+o[k]) || o[k] === '' || o[k] === null) o[k] = d; else o[k] = +o[k]; };
  for (const s of out.sheets) { num(s, 'T', 18); num(s, 'L', 2800); num(s, 'W', 2070); num(s, 'price', 0); if (typeof s.mat !== 'string') s.mat = 'ЛДСП'; }
  for (const d of out.decors) { if (typeof d.name !== 'string') d.name = 'Декор'; if (typeof d.color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(d.color)) d.color = '#cccccc'; num(d, 'price', 0); }
  for (const h of out.hardware) { if (typeof h.match !== 'string') h.match = ''; num(h, 'price', 0); }
  for (const f of out.fittings) {
    for (const k of ['id', 'kind', 'variant', 'brand', 'name', 'art', 'url']) if (typeof f[k] !== 'string') f[k] = '';
    num(f, 'price', 0); num(f, 'pack', 1); num(f, 'stockLen', 0);
    if (f.pack < 1) f.pack = 1;
    if (!isObj(f.params)) f.params = {};
    if (f.variant === 'half') f.variant = 'half-soft'; // до версии 2 полунакладные петли не делились на варианты
  }
  // справочник старой версии: дописываем модели по умолчанию, которых в нём ещё нет
  if (had < CATALOG_VERSION) { const ids = new Set(out.fittings.map(f => f.id)); for (const f of DEFAULT_CATALOG.fittings) if (!ids.has(f.id)) out.fittings.push(clone(f)); }
  out.version = CATALOG_VERSION;
  for (const [o, ks] of [[out.works, ['cut', 'edge', 'hole', 'assembly']], [out.special, ['glass', 'mirror']], [out.cut, ['kerf', 'trim']], [out.milling, Object.keys(DEFAULT_CATALOG.milling)]]) for (const k of ks) num(o, k, DEFAULT_CATALOG[o === out.works ? 'works' : o === out.special ? 'special' : o === out.cut ? 'cut' : 'milling'][k]);
  num(out, 'markup', DEFAULT_CATALOG.markup);
  out.cut.minOffcut = out.cut.minOffcut.map((v, i) => (Number.isFinite(+v) ? +v : DEFAULT_CATALOG.cut.minOffcut[i]));
  for (const k of Object.keys(out.edge)) if (!Number.isFinite(+out.edge[k])) delete out.edge[k]; else out.edge[k] = +out.edge[k];
  if (typeof out.currency !== 'string') out.currency = '₽';
  return out;
}

export function loadCatalog(storage = globalThis.localStorage) {
  let saved = null;
  try { saved = JSON.parse(storage.getItem(CATALOG_KEY) || 'null'); } catch { /* нет хранилища */ }
  return sanitizeCatalog(saved);
}
export function saveCatalog(c, storage = globalThis.localStorage) {
  try { storage.setItem(CATALOG_KEY, JSON.stringify(c)); } catch { /* нет хранилища */ }
  if (catalogHooks.onSave) try { catalogHooks.onSave(); } catch { /* подписчик не должен ломать сохранение */ }
}

const matKind = label => (/^ХДФ/.test(label) || /^МДФ/.test(label) ? label.slice(0, 3) : 'ЛДСП');
/** Лист для материала из спецификации («ЛДСП Белый», «МДФ Дуб, рамка», «ХДФ») и толщины. */
export function sheetFor(cat, label, T) {
  const k = matKind(label);
  const same = cat.sheets.filter(s => s.mat === k);
  return same.find(s => s.T === T) || same.slice().sort((a, b) => Math.abs(a.T - T) - Math.abs(b.T - T) || a.T - b.T)[0] || cat.sheets[0];
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
