import { describe, it, expect } from 'vitest';
import { makePreset, normalizeCutouts } from '../web/rules.js';
import { renderProduction, esc, safeUrlOf, shopId } from '../web/production-view.js';
import { DEFAULT_CATALOG, sanitizeCatalog } from '../web/catalog.js';

const date = new Date('2026-01-05T12:00:00');
const base = o => renderProduction({ P: makePreset('wardrobe'), cat: DEFAULT_CATALOG, projName: 'Шкаф', date, ...o });

describe('страница задания', () => {
  it('содержит все режимы и проверку конструкции', () => {
    const { html, title } = base();
    for (const m of ['m-task', 'm-kp', 'm-labels', 'm-asm', 'm-buy']) expect(html).toContain(m);
    expect(html).toMatch(/Проверка конструкции/);
    expect(html).toContain('Список покупок');
    expect(html).toContain('Инструкция по сборке');
    expect(title).toMatch(/^Шкаф \d+×\d+×\d+ мм$/);
    expect(html).not.toMatch(/NaN|undefined/);
  });
  it('вырезы, фрезеровка и положение детали попадают в задание', () => {
    const P = makePreset('wardrobe'); P.sections[0].frontStyle = 'glass'; P.cutouts = normalizeCutouts([{ part: 'Задняя стенка', kind: 'hole', w: 60, h: 40, r: 8, u: 400, v: 300 }]);
    const { html } = base({ P });
    expect(html).toMatch(/Вырез/); expect(html).toMatch(/Окно под стекло, насквозь/); expect(html).toMatch(/Четверть под стекло/);
    expect(html).toMatch(/Петли (слева|справа)/);
  });
  it('у позиций без ссылки нет ссылки', () => {
    const { html } = base();
    expect(html).not.toContain('>ссылка</a>');
  });
  it('отметки «куплено» применяются', () => {
    const { shop } = base(), first = shop[0];
    const { html } = base({ bought: new Set([shopId(first)]) });
    expect((html.match(/class="done"/g) || []).length).toBe(1);
  });
});

describe('защита от подмены через справочник по ссылке', () => {
  const evil = url => { const c = sanitizeCatalog(JSON.parse(JSON.stringify(DEFAULT_CATALOG))); c.fittings.find(f => f.id === 'hinge-soft').url = url; c.fittings.find(f => f.id === 'hinge-soft').name = '<img src=x onerror=alert(1)>"\''; c.fittings.find(f => f.id === 'hinge-soft').art = '"><script>alert(2)</script>'; return c; };
  const render = (url, projName = 'Шкаф') => renderProduction({ P: makePreset('wardrobe'), cat: evil(url), projName, date }).html;

  it('javascript: и data: не попадают в href', () => {
    for (const u of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', ' javascript:alert(1)', 'vbscript:x']) {
      const h = render(u);
      expect(h, u).not.toMatch(/href="[^"]*(javascript|data|vbscript):/i);
    }
  });
  it('кавычка в ссылке не выходит из атрибута', () => {
    const h = render('https://example.com/x" onmouseover="alert(1)');
    expect(h).not.toMatch(/onmouseover="alert/);
    expect(h).toContain('rel="noopener noreferrer"');
  });
  it('нормальная ссылка работает', () => {
    expect(render('https://example.com/p?a=1&b=2')).toContain('href="https://example.com/p?a=1&amp;b=2"');
  });
  it('названия, артикулы и имя проекта экранируются', () => {
    const h = render('', '"><script>alert(3)</script>');
    expect(h).not.toMatch(/<script>alert|<img src=x onerror/);
    expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;');
  });
  it('esc и safeUrlOf', () => {
    expect(esc(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
    expect(safeUrlOf('//evil.com/x', 'https://app.example/')).toBe('https://evil.com/x');
    expect(safeUrlOf('/rel', 'https://app.example/')).toBe('https://app.example/rel');
    expect(safeUrlOf('javascript:1')).toBe('');
    expect(safeUrlOf('')).toBe('');
    expect(safeUrlOf('   ')).toBe('');
  });
});
