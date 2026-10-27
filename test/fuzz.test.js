// Расширенный перебор: крайние значения параметров. Что обязано держаться на любых проектах:
//  1) ни одна выгрузка не падает и не содержит NaN;
//  2) если расчёт не предупредил о проблеме, проверка собираемости не должна находить ошибок
//     (кроме ошибок о фасадах, которые решает пользователь: узкая рамка, вес двери).
import { describe, it, expect } from 'vitest';
import * as THREE from '../web/vendor/three/build/three.module.js';
import { extremeProject } from './helpers.js';
import { buildSpec } from '../web/model.js';
import { checkBuild } from '../web/check.js';
import { groupParts, nest, edgeSummary, toCSV, toDXF } from '../web/export.js';
import { DEFAULT_CATALOG as cat, sheetFor, isTextured } from '../web/catalog.js';
import { estimate } from '../web/estimate.js';
import { assemblySteps } from '../web/assembly.js';
import { axoView } from '../web/axo.js';
import { build3D } from '../web/build3d.js';
import { resolveHw, shoppingList } from '../web/fittings.js';

const USER_DECIDES = new Set(['frame', 'door-weight', 'sheet']);

describe('расширенный перебор', () => {
  it('400 проектов с крайними значениями: выгрузки целы, расчёт не молчит об ошибках', () => {
    const silent = [], bad = [];
    for (let seed = 1; seed <= 400; seed++) {
      const P = extremeProject(seed), hw = resolveHw(cat, P);
      try {
        const spec = buildSpec(P, { hw }), G = groupParts(spec), E = edgeSummary(G);
        const N = nest(G, { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: 4, trim: 10, minOffcut: [300, 100] });
        const est = estimate(spec, G, N, E, cat, P);
        if (![est.total, est.subtotal].every(Number.isFinite)) bad.push(`seed ${seed}: смета NaN`);
        const csv = toCSV(spec, 't'), dxf = Buffer.from(toDXF(spec)).toString('latin1');
        if (/NaN|undefined|Infinity/.test(csv + dxf)) bad.push(`seed ${seed}: NaN в CSV или DXF`);
        const steps = assemblySteps(spec, G, P);
        if (steps.reduce((a, s) => a + s.parts.reduce((b, x) => b + x.qty, 0), 0) !== spec.parts.length) bad.push(`seed ${seed}: инструкция потеряла детали`);
        const done = new Set();
        for (const s of steps) { done.add(s.stage); if (/NaN|undefined/.test(axoView(spec, { shown: new Set(done), highlight: s.stage }))) bad.push(`seed ${seed}: NaN в схеме ${s.stage}`); }
        if (!shoppingList(spec, cat, P).every(l => Number.isFinite(l.sum))) bad.push(`seed ${seed}: NaN в списке покупок`);
        const root = build3D(THREE, spec, P);
        root.traverse(o => { if (o.isMesh && [...o.geometry.attributes.position.array].some(v => !Number.isFinite(v))) bad.push(`seed ${seed}: NaN в 3D ${o.name}`); });
        if (spec.warnings.length === 0) {
          const errs = checkBuild(spec, P, { hw, N, skipKin: true }).filter(f => f.level === 'error' && !USER_DECIDES.has(f.code));
          if (errs.length) silent.push(`seed ${seed} (${P.type}, ${P.joint}, t=${P.thickness}): ${errs[0].code}: ${errs[0].text}`);
        }
      } catch (e) { bad.push(`seed ${seed}: исключение ${String(e.stack).split('\n').slice(0, 2).join(' | ')}`); }
    }
    expect(bad.join('\n')).toBe('');
    expect(silent.join('\n')).toBe('');
  });
});
