// Содержимое выгрузок (CSV, DXF, раскрой, операции ЧПУ): имя, тип и данные. Без DOM.
import { toCSV, toDXF, groupParts, nest } from './export.js';
import { toCutCSV, toDrillJSON } from './export-cut.js';
import { nestMapDXF } from './dxf.js';
import { sheetFor, isTextured } from './catalog.js';
import { moduleList, cabinetOf, moduleCount } from './project.js';
import { typeLabel, stampOf } from './ui-util.js';

export const nestWith = (spec, cat) => nest(groupParts(spec), { sheetFor: (l, T) => sheetFor(cat, l, T), textured: l => isTextured(cat, l), kerf: cat.cut.kerf, trim: cat.cut.trim, minOffcut: cat.cut.minOffcut, stock: cat.stock });

export const FILE_EXPORTS = ['csv', 'dxf', 'cutcsv', 'cutmap', 'drill'];

/** c: { proj, root, P, spec, cat, projectName }. Возвращает { name, type, data }. */
export function buildExport(kind, c) {
  const { proj, root, P, spec, cat } = c, st = stampOf(proj, root, P, spec), r = Math.round;
  switch (kind) {
    case 'csv': {
      const title = proj.multi ? `Проект из ${moduleCount(root)} модулей ${r(proj.spec.meta.W)} × ${r(proj.spec.meta.H)} × ${r(proj.spec.meta.D)} мм` : `${typeLabel(P.type)} ${r(spec.meta.W)} × ${P.height} × ${P.depth} мм`;
      return { name: st + '.csv', type: 'text/csv;charset=utf-8', data: toCSV(proj.spec, title) };
    }
    case 'dxf': return { name: st + '.dxf', type: 'application/dxf', data: toDXF(proj.spec) };
    case 'cutcsv': return { name: st + '_raskroy.csv', type: 'text/csv;charset=utf-8', data: toCutCSV(groupParts(proj.spec), { textured: l => isTextured(cat, l) }) };
    case 'cutmap': return { name: st + '_karta_raskroya.dxf', type: 'application/dxf', data: nestMapDXF(nestWith(proj.spec, cat)) };
    case 'drill': return { name: st + '_operacii.json', type: 'application/json', data: toDrillJSON(groupParts(proj.spec), { project: c.projectName || '', modules: moduleList(root).map(m => ({ name: m.name, type: cabinetOf(root, m.i).type })) }) };
    default: throw new Error('Неизвестная выгрузка: ' + kind);
  }
}
