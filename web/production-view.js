// Страница «Задание на распил»: расчёт и HTML целиком, без DOM и хранилища — поэтому проверяется в node.
// Данные для обработчиков (скачивание, отметки «куплено») возвращаются наружу; их вешает production.html.
import { buildSpec } from './model.js';
import { buildProject } from './project.js';
import { planView } from './plan.js';
import { groupParts, nest, edgeSummary, grainOf } from './export.js';
import { partDrawing } from './partdraw.js';
import { sheetFor, isTextured } from './catalog.js';
import { estimate } from './estimate.js';
import { frontView, sideView } from './drawings.js';
import { checkBuild } from './check.js';
import { assemblySteps } from './assembly.js';
import { axoView } from './axo.js';
import { shoppingList, resolveHw, KIND_LABELS } from './fittings.js';
import { partKey } from './export.js';
import { orientLines, machiningRows } from './partinfo.js';

export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** Ссылка из справочника (он может прийти по публичной ссылке от другого человека): только http и https. */
export const safeUrlOf = (u, baseHref = 'http://localhost/') => { if (!String(u ?? '').trim()) return ''; try { const x = new URL(String(u), baseHref); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; } };
/** Порядок разделов в полном пакете: блок без своего id наследует id предыдущего (шаги сборки идут за инструкцией). */
export const PACK_ORDER = ['pre', 'sec-cover', 'sec-task', 'sec-views', 'sec-plan', 'sec-mats', 'sec-spec', 'sec-cut', 'sec-parts', 'sec-asm', 'sec-buy', 'sec-est', 'sec-kp', 'sec-labels'];
export function packOrder(entries) {
  let grp = 'pre';
  const rank = id => { const k = PACK_ORDER.findIndex(p => id === p || (p === 'sec-asm' && /^sec-asm/.test(id))); return k < 0 ? PACK_ORDER.length : k; };
  return entries.map((e, i) => { if (e.id) grp = e.id; return { i, grp, r: rank(grp) }; }).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.i);
}
export const shopId = l => `${l.kind}|${l.variant}|${l.title}`;
export const shopUnit = l => (l.unit === 'уп.' ? `${l.packs} уп. × ${l.pack} шт` : l.unit === 'хлыст' ? `${l.packs} хлыст.` : `${l.packs} шт`);

/**
 * P, cat, projName — проект и справочник; preview — снимок 3D для КП (data URL, только свой); bought — Set отмеченных покупок;
 * baseHref — для разбора ссылок; date — дата в шапках. Возвращает { html, spec, title, stamp, shop, rub }.
 */
export function renderProduction({ P, cat, projName, preview = null, shareToken = '', bought = new Set(), baseHref = 'http://localhost/', date = new Date() }) {
  const HW = resolveHw(cat, P), PJ = buildProject(P, { hwFor: p => resolveHw(cat, p) }), spec = PJ.spec, mods = PJ.mods, multi = PJ.multi, G = groupParts(spec), E = edgeSummary(G);
  const NEST = { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: cat.cut.kerf, trim: cat.cut.trim, minOffcut: cat.cut.minOffcut, stock: cat.stock };
  const N = nest(G, NEST);
  const EST = estimate(spec, G, N, E, cat, P);
  const CHK = multi
    ? mods.flatMap(m => checkBuild(m.spec, m.P, { N: nest(groupParts(m.spec), { ...NEST, stock: [] }), hw: resolveHw(cat, m.P) }).map(f => ({ ...f, text: `${m.name}: ${f.text}` })))
    : checkBuild(spec, P, { N, hw: HW });
  const SHOP = shoppingList(spec, cat, P);
  const cur = cat.currency || '₽', rub = v => v.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ' + cur;
  const W = Math.round(spec.meta.W), TYPES = { kcorner: 'Угловой кухонный модуль', kfill: 'Фальшпанель', kbase: 'Нижний кухонный модуль', kwall: 'Верхний кухонный модуль', ktall: 'Кухонный пенал', wardrobe: 'Шкаф', rack: 'Стеллаж', nightstand: 'Тумба прикроватная', dresser: 'Комод', tv: 'ТВ-тумба' };
  const title = multi ? `Проект из ${mods.length} модулей ${W}×${Math.round(spec.meta.H)}×${Math.round(spec.meta.D)} мм` : `${TYPES[P.type] || 'Изделие'} ${W}×${P.height}×${P.depth} мм`;
  const safeUrl = u => safeUrlOf(u, baseHref);
  const fmt = v => String(v).replace('.', ',');
  const stamp = multi ? `proekt_${mods.length}mod_${W}x${Math.round(spec.meta.H)}x${Math.round(spec.meta.D)}` : `${P.type}_${W}x${P.height}x${P.depth}`;

  // materials summary
  const mats = new Map();
  for (const g of G) { const k = `${g.label}|${g.T}`; const m = mats.get(k) || { label: g.label, T: g.T, area: 0, n: 0 }; m.area += g.L * g.W * g.qty / 1e6; m.n += g.qty; mats.set(k, m); }
  const sheetsBy = {}, stockBy = {}; N.sheets.forEach(s => { if (s.stock) stockBy[s.mat] = (stockBy[s.mat] || 0) + 1; else sheetsBy[s.mat] = (sheetsBy[s.mat] || 0) + 1; });
  const sheetsTxt = key => `${sheetsBy[key] ?? (stockBy[key] ? 0 : '—')}${stockBy[key] ? ` + ${stockBy[key]} ост.` : ''}`;

  let html = `<div class="bar"><button data-m="task">Задание</button><button data-m="kp">КП для клиента</button><button data-m="labels">Этикетки</button><button data-m="asm">Сборка</button><button data-m="buy">Покупки</button><button data-m="all">Полный пакет</button><button class="pri" id="pr">Печать / PDF</button><button id="csv">CSV / Excel</button><button id="dxf">DXF</button><a href="index.html">← В конструктор</a></div>`;
  {
    const errs = CHK.filter(f => f.level === 'error'), warns = CHK.filter(f => f.level === 'warn' && f.code !== 'kin');
    html += errs.length || warns.length
      ? `<div class="chk${errs.length ? ' bad' : ''} m-task m-asm"><b>Проверка конструкции:</b> ${errs.length ? `ошибок ${errs.length}` : 'ошибок нет'}${warns.length ? `, замечаний ${warns.length}` : ''}<ul>${[...new Set(errs.map(f => `<li class="e">${esc(f.text)}</li>`)), ...new Set(warns.map(f => `<li class="w">${esc(f.text)}</li>`))].join('')}</ul></div>`
      : `<div class="chk m-task m-asm"><b>Проверка конструкции:</b> всё сходится — детали не пересекаются, присадка парная, всё крепится и собирается в указанном порядке.</div>`;
  }
  if (spec.warnings.length) html += `<div class="warn m-task"><b>Проверьте конструкцию:</b><br>${spec.warnings.map(esc).join('<br>')}</div>`;
  html += `<section id="sec-task" class="sheet m-task"><h1>Задание на распил и присадку</h1><div class="muted">${esc(title)} · ${date.toLocaleDateString('ru-RU')}</div>
  <div class="meta">
  ${multi ? mods.map(m => `<div><span>${esc(m.name)}</span>${esc(TYPES[m.P.type] || 'Изделие')} ${Math.round(m.W)} × ${m.P.height} × ${m.P.depth} мм${m.y ? `, подъём ${m.y} мм` : ''}, ЛДСП ${esc(m.P.bodyName)} ${m.P.thickness} мм, фасады ${esc(m.P.frontName)}</div>`).join('') + `<div><span>Габариты проекта</span>${W} × ${Math.round(spec.meta.H)} × ${Math.round(spec.meta.D)} мм</div>` : `<div><span>Габариты</span>${W} × ${P.height} × ${P.depth} мм</div>
  <div><span>Корпус</span>ЛДСП ${esc(P.bodyName)}, ${P.thickness} мм</div>
  <div><span>Фасады</span>${esc(P.frontName)}, ${P.frontT} мм</div>
  <div><span>Кромка</span>лицевая ${fmt(P.edgeFront)} мм, скрытая ${P.edgeHidden ? fmt(P.edgeHidden) + ' мм' : 'нет'}</div>
  <div><span>Задняя стенка</span>${{ groove: 'ХДФ 4 мм в паз', overlay: 'ХДФ 4 мм накладная', none: 'нет' }[P.backType]}</div>`}
  <div><span>Деталей</span>${G.reduce((a, g) => a + g.qty, 0)} шт., ${G.length} позиций</div>
  </div></section>`;

  html += `<section id="sec-views" class="sheet m-task"><h2>Общий вид</h2>${mods.map(m => `${multi ? `<h3>${esc(m.name)}</h3>` : ''}<div class="views">${frontView(m.spec, m.P)}${frontView(m.spec, m.P, { fronts: true })}${sideView(m.spec, m.P)}</div>`).join('')}</section>`;

  if (multi || PJ.worktops.length || PJ.room) html += `<section id="sec-plan" class="sheet m-task"><h2>План</h2><div class="views">${planView(PJ)}</div></section>`;

  // смета
  const nz = v => String(v).replace('.', ',');
  html += `<section id="sec-est" class="sheet est m-task"><h2>Смета</h2>${EST.sections.map(s => `<h3>${s.title}</h3><table><tr><th>Позиция</th><th class="n">Кол-во</th><th>Ед.</th><th class="n">Цена</th><th class="n">Сумма</th></tr>${s.lines.map(l => `<tr><td>${esc(l.name)}</td><td class="n">${nz(l.qty)}</td><td>${l.unit}</td><td class="n${l.price == null ? ' nop' : ''}">${l.price == null ? 'нет цены' : nz(l.price)}</td><td class="n">${nz(l.sum)}</td></tr>`).join('')}<tr class="tot"><td colspan="4">${s.title}: итого</td><td class="n">${rub(s.sum)}</td></tr></table>`).join('')}
  <table style="margin-top:14px"><tr><td>Себестоимость</td><td class="n">${rub(EST.subtotal)}</td></tr><tr><td>Наценка ${EST.markupPct}%</td><td class="n">${rub(EST.markup)}</td></tr><tr class="tot"><td>Итого</td><td class="n">${rub(EST.total)}</td></tr></table>
  ${EST.missing.length ? `<p class="nop">Нет цены в справочнике: ${esc(EST.missing.join('; '))}. Заполните цены кнопкой «Справочник и цены» в конструкторе — позиции без цены не входят в итог.</p>` : ''}</section>`;

  // коммерческое предложение
  html += `<section id="sec-kp" class="sheet kp m-kp"><h1>Коммерческое предложение</h1><div class="muted">${esc(projName)} · ${date.toLocaleDateString('ru-RU')}</div>
  ${preview ? `<p><img alt="Вид изделия" src="${preview}"></p>` : ''}
  <div class="meta"><div><span>Изделие</span>${esc(title)}</div>${multi ? mods.map(m => `<div><span>${esc(m.name)}</span>${esc(TYPES[m.P.type] || 'Изделие')} ${Math.round(m.W)} × ${m.P.height} × ${m.P.depth} мм, ЛДСП ${esc(m.P.bodyName)}, фасады ${esc(m.P.frontName)}</div>`).join('') : `<div><span>Корпус</span>ЛДСП ${esc(P.bodyName)}, ${P.thickness} мм</div><div><span>Фасады</span>${esc(P.frontName)}</div><div><span>Задняя стенка</span>${{ groove: 'ХДФ 4 мм в паз', overlay: 'ХДФ 4 мм накладная', none: 'нет' }[P.backType]}</div>`}</div>
  <div class="price">${rub(EST.total)}</div><div class="muted">Стоимость включает материалы, фурнитуру, раскрой, кромление, присадку и сборку.${EST.missing.length ? ' <span class="nop">Не все позиции оценены: проверьте цены в справочнике.</span>' : ''}</div>
  <h2 style="margin-top:20px">Условия</h2><div class="terms" contenteditable="true">Срок изготовления: 14 рабочих дней.\nОплата: 50% предоплата, остаток при получении.\nПредложение действительно 14 дней.</div></section>`;

  // этикетки: по одной на каждую деталь, 24 на лист А4, QR с реквизитами детали
  const qrSvg = text => {
    try {
      const q = globalThis.qrcode(0, 'M'); q.addData(text); q.make();
      const n = q.getModuleCount(); let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
      return `<svg viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><path d="${d}"/></svg>`;
    } catch { return ''; }
  };
  const edgeIcon = g => { const e = g.edges, c = v => (v >= 1 ? '#000' : v > 0 ? '#888' : 'none'), w = v => (v >= 1 ? 1.6 : 1);
    return `<svg width="15mm" height="9mm" viewBox="0 0 30 18"><rect x="3" y="3" width="24" height="12" fill="none" stroke="#bbb" stroke-width=".6"/>
    <line x1="3" y1="15" x2="27" y2="15" stroke="${c(e.d1)}" stroke-width="${w(e.d1)}"/><line x1="3" y1="3" x2="27" y2="3" stroke="${c(e.d2)}" stroke-width="${w(e.d2)}"/>
    <line x1="3" y1="3" x2="3" y2="15" stroke="${c(e.w1)}" stroke-width="${w(e.w1)}"/><line x1="27" y1="3" x2="27" y2="15" stroke="${c(e.w2)}" stroke-width="${w(e.w2)}"/></svg>`; };
  const labels = [];
  for (const g of G) for (let i = 1; i <= g.qty; i++) labels.push(`<div class="lab"><div><b>№${g.no} ${esc(g.name)}</b></div><div><div class="sz">${fmt(g.L)} × ${fmt(g.W)} × ${g.T}</div><div class="sz">пил. ${fmt(g.saw.L)} × ${fmt(g.saw.W)}</div><div class="mt">${esc(g.label)} · сек. ${g.secLabel}${g.qty > 1 ? ` · ${i}/${g.qty}` : ''}</div></div><div class="mt">${esc(projName)}</div><div class="qr">${qrSvg(`${projName}|№${g.no}|${g.name}|${g.L}x${g.W}x${g.T}|сек.${g.secLabel}`)}</div><div class="edge">${edgeIcon(g)}</div></div>`);
  html += `<section id="sec-labels" class="sheet m-labels"><h2>Этикетки деталей</h2><p class="muted">${labels.length} шт., 70×37 мм, 24 на лист А4 (печать без полей, масштаб 100%). Кромка на схеме: чёрная — 1 мм и толще, серая — 0,4 мм; Д1 — снизу, Д2 — сверху, Ш1 — слева, Ш2 — справа. QR содержит проект, номер, название и размер детали.</p><div class="labels">${labels.join('')}</div></section>`;

  // инструкция по сборке: перечень, затем шаги с аксонометрией (для проекта из модулей — по каждому модулю, номера деталей общие)
  for (const m of mods) {
    const Gm = groupParts(m.spec).map(g => ({ ...g, no: (G.find(x => partKey(x) === partKey(g)) || g).no }));
    const STEPS = assemblySteps(m.spec, Gm, m.P);
    const numbers = new Map(m.spec.parts.map(p => [p, (G.find(g => partKey(g) === partKey(p)) || {}).no]));
    const tools = [...new Set(STEPS.flatMap(s => s.tools))].filter(Boolean);
    html += `<section id="sec-asm-${m.i}" class="sheet m-asm"><h1>Инструкция по сборке${multi ? `: ${esc(m.name)}` : ''}</h1><div class="muted">${esc(title)} · ${date.toLocaleDateString('ru-RU')}</div>
    <div class="views" style="margin-top:14px">${axoView(m.spec, { highlight: null, explode: false, width: 520 })}</div>
    <div class="grid2" style="margin-top:16px"><div><h2>Что понадобится</h2><p>${tools.map(esc).join('; ')}.</p><p class="muted">Номера деталей (№) совпадают с заданием на распил и этикетками. Перед сборкой разложите детали по номерам и сверьте с этикетками. Шагов: ${STEPS.length}.</p></div>
    <div><h2>Фурнитура (всё в списке покупок)</h2><table><tr><th>Позиция</th><th class="n">шт.</th></tr>${m.spec.hw.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('')}</table></div></div></section>`;
    const shown = new Set();
    for (const st of STEPS) {
      shown.add(st.stage);
      let focus = null, explode = true;
      if (st.stage === 'drawerBox') { const gid = st.partRefs[0].group && st.partRefs[0].group.id; focus = st.partRefs.filter(p => p.group && p.group.id === gid); explode = false; }
      const svg = axoView(m.spec, { shown: new Set(shown), highlight: st.stage, numbers, focus, explode, width: 560 });
      html += `<section class="sheet step m-asm"><h2><span class="no">${st.no}</span>${esc(st.title)}</h2><div class="cols"><div>${svg}${focus ? '<div class="muted">Схема одного короба; остальные собираются так же.</div>' : ''}</div><div>
      ${st.text.map(t => `<p>${esc(t)}</p>`).join('')}
      ${st.parts.length ? `<table><tr><th class="n">№</th><th>Деталь</th><th class="n">Размер</th><th class="n">Шт</th></tr>${st.parts.map(x => `<tr><td class="n">${x.no}</td><td>${esc(x.name)}</td><td class="n">${fmt(x.L)}×${fmt(x.W)}×${x.T}</td><td class="n">${x.qty}</td></tr>`).join('')}</table>` : ''}
      ${st.hw.length ? `<table><tr><th>Крепёж и фурнитура</th><th class="n">Шт</th></tr>${st.hw.map(x => `<tr><td>${esc(x.name)}</td><td class="n">${x.qty}</td></tr>`).join('')}</table>` : ''}
      <div class="tools">Инструмент: ${st.tools.map(esc).join('; ')}</div></div></div></section>`;
    }
    html += `<section class="sheet step m-asm"><h2><span class="no">✓</span>Готово${multi ? `: ${esc(m.name)}` : ''}</h2><div class="cols"><div>${axoView(m.spec, { highlight: null, explode: false, width: 560 })}</div><div><p>Проверьте зазоры дверей и ящиков, отрегулируйте петли, снимите защитную плёнку. Поставьте изделие по уровню${m.P.wallFix ? ' и закрепите к стене' : ''}.</p>${m.P.wallFix ? '' : '<p class="muted">Высокое изделие лучше крепить к стене: включите «Крепление к стене» в параметрах.</p>'}</div></div></section>`;
  }

  // список покупок с отметками «куплено»
  {
    const id = shopId;
    const total = SHOP.reduce((a, l) => a + l.sum, 0), unit = shopUnit;
    html += `<section id="sec-buy" class="sheet buy m-buy"><h1>Список покупок</h1><div class="muted">${esc(title)} · ${date.toLocaleDateString('ru-RU')}</div>
    <p class="muted">Мелкий крепёж взят с запасом (10%, не меньше двух штук) и округлён до упаковки; штанги и профили рассчитаны по хлыстам. Артикулы и ссылки заполняются в «Справочник и цены → Модели фурнитуры».</p>
    <div class="bar" style="margin:10px 0"><button id="bcsv">CSV</button><button id="bcopy">Скопировать списком</button><button id="breset">Сбросить отметки</button></div>
    <table><tr><th class="c"></th><th>Категория</th><th>Позиция</th><th>Арт.</th><th class="n">Нужно</th><th class="n">Запас</th><th class="n">Купить</th><th class="n">Цена</th><th class="n">Сумма</th><th>Ссылка</th></tr>
    ${SHOP.map((l, i) => `<tr data-i="${i}" class="${bought.has(id(l)) ? 'done' : ''}"><td class="c"><input type="checkbox" ${bought.has(id(l)) ? 'checked' : ''}></td><td>${esc(KIND_LABELS[l.kind] || l.kind)}</td><td>${esc((l.brand ? l.brand + ' ' : '') + l.title)}${l.note ? `<div class="muted">${esc(l.note)}</div>` : ''}</td><td>${esc(l.art || '—')}</td><td class="n">${l.need}</td><td class="n">${l.reserve || ''}</td><td class="n">${unit(l)}</td><td class="n${l.missing ? ' nop' : ''}">${l.missing ? 'нет цены' : nz(l.price)}</td><td class="n">${nz(l.sum)}</td><td>${safeUrl(l.url) ? `<a href="${esc(safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">ссылка</a>` : (l.url ? esc(l.url) : '')}</td></tr>`).join('')}
    <tr class="tot"><td colspan="8">Итого за фурнитуру</td><td class="n">${rub(total)}</td><td></td></tr><tr><td colspan="8" id="left">Осталось купить</td><td class="n" id="leftv"></td><td></td></tr></table></section>`;
  }

  html += `<section id="sec-mats" class="sheet m-task"><h2>Сводка материалов</h2><div class="grid2"><div><table><tr><th>Материал</th><th class="n">мм</th><th class="n">м²</th><th class="n">Листов</th></tr>
  ${[...mats.values()].map(m => `<tr><td>${esc(m.label)}</td><td class="n">${m.T}</td><td class="n">${fmt(m.area.toFixed(2))}</td><td class="n">${sheetsTxt(`${m.label}, ${m.T} мм`)}</td></tr>`).join('')}
  </table><p class="muted">${[...new Set(N.sheets.map(s => `${s.L}×${s.W}`))].join(', ') || '—'} мм, обрезка ${cat.cut.trim} мм, пропил ${cat.cut.kerf} мм. Раскрой гильотинный.</p>
  <table><tr><th>Кромка ПВХ</th><th class="n">пог. м</th><th class="n">+10%</th></tr>${E.map(e => `<tr><td>${fmt(e.t)} мм</td><td class="n">${fmt(e.m.toFixed(1))}</td><td class="n">${fmt((e.m * 1.1).toFixed(1))}</td></tr>`).join('')}</table></div>
  <div><table><tr><th>Фурнитура</th><th class="n">шт.</th></tr>${spec.hw.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td></tr>`).join('')}</table></div></div></section>`;

  const eTxt = v => (v ? fmt(v) : '—');
  html += `<section id="sec-spec" class="sheet m-task"><h2>Спецификация деталей</h2><table><tr><th class="n">№</th><th>Деталь</th><th>Материал</th><th class="n">T</th><th class="n">Длина</th><th class="n">Ширина</th><th class="n">Пил. Д×Ш</th><th class="n">Шт</th><th class="n">Д1 Д2 Ш1 Ш2</th><th class="n">Отв.</th><th>Секция / примечание</th></tr>
  ${G.map(g => `<tr><td class="n">${g.no}</td><td>${esc(g.name)}</td><td>${esc(g.label)}</td><td class="n">${g.T}</td><td class="n">${fmt(g.L)}</td><td class="n">${fmt(g.W)}</td><td class="n">${fmt(g.saw.L)}×${fmt(g.saw.W)}</td><td class="n">${g.qty}</td><td class="n">${[g.edges.d1, g.edges.d2, g.edges.w1, g.edges.w2].map(eTxt).join(' ')}</td><td class="n">${g.holes.length || ''}</td><td>${g.secLabel}${g.notes.length || g.grooves.length ? ' · ' + esc([...g.grooves.map(x => `паз ${x.w}×${x.depth} в ${x.at} мм от Д1`), ...g.notes].join('; ')) : ''}</td></tr>`).join('')}
  </table><p class="muted">Длина — вдоль Д1/Д2 (длинные кромки чертежа), ширина — вдоль Ш1/Ш2. Пильный размер = чистовой − кромка ≥ 1 мм. Для декоров «Дуб», «Орех» текстура вдоль длины (у фасадов — вдоль высоты).</p></section>`;

  // cutting maps
  html += `<section id="sec-cut" class="sheet m-task"><h2>Карты раскроя</h2>${N.over.length ? `<div class="warn">Не помещаются на лист: ${N.over.map(o => '№' + o.no).join(', ')}</div>` : ''}<div class="grid2">`;
  for (const s of N.sheets) {
    const k = 1;
    html += `<div><div style="display:flex;justify-content:space-between;margin-bottom:6px"><b>${esc(s.mat)}</b><span class="muted">${s.stock ? 'остаток' : 'лист'} ${s.idx}/${s.of} · ${s.L}×${s.W} · ${Math.round(s.use * 100)}% · рез ${fmt((s.cutLen / 1000).toFixed(1))} м</span></div>
    <svg viewBox="-20 -20 ${s.L + 40} ${s.W + 40}" style="width:100%;background:#faf9f6;border:1px solid #e6e2da">
    <rect x="0" y="0" width="${s.L}" height="${s.W}" fill="#efe9dd" stroke="#8a8478" stroke-width="4"/>
    ${s.offcuts.map(o => `<rect x="${o.x + s.trim}" y="${o.y + s.trim}" width="${o.l}" height="${o.w}" fill="#e8f1e4" stroke="#7fa06f" stroke-width="3" stroke-dasharray="14 8"/>${Math.min(o.l, o.w) > 150 ? `<text x="${o.x + s.trim + o.l / 2}" y="${o.y + s.trim + o.w / 2}" font-size="38" text-anchor="middle" dominant-baseline="middle" fill="#4f7a40">остаток ${Math.round(o.l)}×${Math.round(o.w)}</text>` : ''}`).join('')}
    ${s.cuts.map(c => c.dir === 'H'
      ? `<line x1="${s.trim + c.from}" y1="${s.trim + c.pos}" x2="${s.trim + c.to}" y2="${s.trim + c.pos}" stroke="#c0392b" stroke-width="3" stroke-dasharray="20 10"/><text x="${s.trim + c.from + 24}" y="${s.trim + c.pos - 8}" font-size="34" fill="#c0392b">${c.n}</text>`
      : `<line x1="${s.trim + c.pos}" y1="${s.trim + c.from}" x2="${s.trim + c.pos}" y2="${s.trim + c.to}" stroke="#c0392b" stroke-width="3" stroke-dasharray="20 10"/><text x="${s.trim + c.pos + 8}" y="${s.trim + c.from + 40}" font-size="34" fill="#c0392b">${c.n}</text>`).join('')}
    ${s.pieces.map(p => { const x = p.x + s.trim, y = p.y + s.trim, fs = Math.max(26, Math.min(70, Math.min(p.l, p.w) / 4));
      return `<rect x="${x}" y="${y}" width="${p.l}" height="${p.w}" fill="#fff" stroke="#1f1e1b" stroke-width="3"/>
      ${Math.min(p.l, p.w) > 60 ? `<text x="${x + p.l / 2}" y="${y + p.w / 2}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="#1f1e1b">${p.no}${p.l > 380 && p.w > 160 ? `<tspan x="${x + p.l / 2}" dy="${fs * 1.1}" font-size="${fs * 0.7}" fill="#6f6a60">${Math.round(p.l)}×${Math.round(p.w)}</tspan>` : ''}</text>` : ''}`; }).join('')}
    </svg>${s.cuts.length ? `<details class="cuts"><summary>Порядок резов (${s.cuts.length})</summary><ol>${s.cuts.map(c => `<li>${c.dir === 'H' ? 'Горизонтальный' : 'Вертикальный'} рез на ${fmt(Math.round(c.pos * 10) / 10)} мм ${c.dir === 'H' ? 'от верхнего края' : 'от левого края'} (от ${fmt(Math.round(c.from * 10) / 10)} до ${fmt(Math.round(c.to * 10) / 10)} мм, длина ${fmt(Math.round(c.len))} мм)</li>`).join('')}</ol><p class="muted">Размеры отсчитываются от края листа после обрезки${s.trim ? ` ${s.trim} мм` : ''}; каждый следующий рез идёт по куску, оставшемуся после предыдущих.</p></details>` : ''}</div>`;
  }
  html += `</div></section>`;

  // part drawings
  const textured = g => (isTextured(cat, g.label) ? grainOf(g) : null);
  const FACE = { A: { yz: 'пласть A (слева)', xz: 'пласть A (верх)', xy: 'пласть A (лицо)' }, B: { yz: 'пласть B (справа)', xz: 'пласть B (низ)', xy: 'пласть B (тыл)' } };
  const fName = (f, pl) => (FACE[f] ? FACE[f][pl] : 'торец ' + ({ w1: 'Ш1', w2: 'Ш2', d1: 'Д1', d2: 'Д2' }[f]));
  html += `<section id="sec-parts" class="sheet m-task"><h2>Чертежи деталей: кромка и присадка</h2>
  <div class="legend" style="margin-bottom:14px"><span><i style="background:#d4672a"></i>Ø35×13 чашка петли</span><span><i style="background:#2b6cb0"></i>Ø7 скв. конфирмат</span><span><i style="background:#8e44ad"></i>Ø15×13 эксцентрик</span><span><i style="background:#2f8f5b"></i>Ø8 шкант / Ø8×34 стяжка в торец</span><span><i style="background:#1f1e1b"></i>Ø5×12 полкодержатель / планка / направляющая</span><span><i style="background:#8a8478"></i>Ø3×10 штангодержатель</span><span>▶ Ø5×50 в торец</span><span>○ пунктир — пласть B</span><span><i style="background:#2b6cb0;border-radius:0"></i>фрезеровка (пунктир — глубина, сплошная — сквозное окно)</span><span><i style="background:#f8d7d3;border:1px solid #c0392b;border-radius:0"></i>вырез</span><span><i style="background:#c0392b;border-radius:0"></i>кромка ≥1 мм</span><span><i style="background:#d9a441;border-radius:0"></i>кромка 0,4 мм</span></div>
  <p class="muted" style="margin-top:0">Координаты X — от торца Ш1 вдоль длины, Y — от кромки Д1. Пласть A для вертикальных деталей — левая, для горизонтальных — верхняя, для фасадов — лицевая.</p>`;
  for (const g of G) {
    if (g.mat === 'glass' || g.mat === 'mirror') continue;
    const hg = new Map();
    for (const h of g.holes) { const k = `${h.note}|${h.d}|${h.h}|${h.f}`; if (!hg.has(k)) hg.set(k, []); hg.get(k).push(h); }
    html += `<div class="part"><div class="ph"><b>№${g.no} ${esc(g.name)}</b><span>${fmt(g.L)} × ${fmt(g.W)} × ${g.T} мм</span><span>${esc(g.label)}</span><span>${g.qty} шт.</span><span>секция ${g.secLabel}</span></div>
    <p class="muted" style="margin:0 0 6px">${esc(orientLines(g).join(' '))}</p>
    ${partDrawing(g, { grain: textured(g) })}
    ${g.holes.some(h => h.f === 'B') ? partDrawing(g, { view: 'B', grain: textured(g) }) : ''}
    ${(() => { const m = machiningRows(g); return m.length ? `<table><tr><th>Фрезеровка / вырез</th><th class="n">Размер, мм</th><th>Положение</th><th>Пласть</th><th class="n">Глубина</th><th>Примечание</th></tr>${m.map(x => `<tr><td>${esc(x.title)}</td><td class="n">${esc(x.size)}</td><td>${esc(x.pos)}</td><td>${esc(x.face)}</td><td class="n">${esc(x.depth)}</td><td>${esc(x.note)}</td></tr>`).join('')}</table>` : ''; })()}
    ${hg.size ? `<table><tr><th>Назначение</th><th>Сторона</th><th class="n">Ø</th><th class="n">Глубина</th><th class="n">Шт</th><th>Координаты X/Y, мм</th></tr>${[...hg.values()].map(hs => `<tr><td>${esc(hs[0].note)}</td><td>${fName(hs[0].f, g.plane)}</td><td class="n">${hs[0].d}</td><td class="n">${hs[0].h}</td><td class="n">${hs.length}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:11px">${hs.map(h => `${fmt(h.u)}/${fmt(h.v)}`).join('  ')}</td></tr>`).join('')}</table>` : '<p class="muted">Присадки нет.</p>'}
    ${g.notes.length ? `<p class="muted">${esc(g.notes.join('; '))}</p>` : ''}</div>`;
  }
  html += '</section>';
  {
    const toc = [['sec-task', 'Задание на распил и присадку'], ['sec-views', 'Общий вид'], ...(multi || PJ.worktops.length ? [['sec-plan', 'План']] : []), ['sec-mats', 'Сводка материалов'], ['sec-spec', 'Спецификация деталей'], ['sec-cut', 'Карты раскроя'], ['sec-parts', 'Чертежи деталей'],
      ...mods.map(m => [`sec-asm-${m.i}`, `Инструкция по сборке${multi ? `: ${m.name}` : ''}`]), ['sec-buy', 'Список покупок'], ['sec-est', 'Смета'], ['sec-kp', 'Коммерческое предложение'], ['sec-labels', 'Этикетки деталей']];
    const sheets = N.sheets.filter(x => !x.stock).length;
    const cover = `<section id="sec-cover" class="sheet m-all cover"><h1>${esc(projName)}</h1><div class="muted">${esc(title)} · ${date.toLocaleDateString('ru-RU')}</div>
    <div class="meta"><div><span>Деталей</span>${G.reduce((a, g) => a + g.qty, 0)} шт., ${G.length} позиций</div><div><span>Листов</span>${sheets}${N.sheets.some(x => x.stock) ? ` + ${N.sheets.filter(x => x.stock).length} ост.` : ''}</div><div><span>Модулей</span>${mods.length}</div><div><span>Итого по смете</span>${rub(EST.total)}</div></div>
    <h2 style="margin-top:20px">Содержание</h2><ol class="toc">${toc.map(([id, t]) => `<li><a href="#${id}">${esc(t)}</a></li>`).join('')}</ol></section>`;
    const barEnd = html.indexOf('</div>') + 6;
    html = html.slice(0, barEnd) + cover + html.slice(barEnd);
  }
  return { html, spec, title, stamp, shop: SHOP, rub };
}
