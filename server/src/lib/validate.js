// Проверка проекта на сервере: форма (zod) + размер + ядро (normalize, buildSpec) — то же, что исполняется в браузере.
import { z } from 'zod';
import { normalize } from '../../../web/rules.js';
import { buildSpec } from '../../../web/model.js';

export const MAX_PROJECT_BYTES = 512 * 1024;
export const MAX_CATALOG_BYTES = 256 * 1024;

const Section = z.object({ width: z.number().positive().max(5000), items: z.array(z.any()).max(200) }).passthrough();
const Params = z.object({
  type: z.string().max(40).optional(),
  height: z.number().positive().max(5000),
  depth: z.number().positive().max(2000),
  thickness: z.number().positive().max(60),
  sections: z.array(Section).min(1).max(30),
}).passthrough();

export const projectBody = z.object({
  name: z.string().trim().min(1).max(60),
  P: Params,
  baseVersion: z.number().int().min(0).default(0),
});

export const catalogBody = z.object({ data: z.object({}).passthrough(), baseVersion: z.number().int().min(0).default(0) });

/** Возвращает текст ошибки или null. */
export function checkProject(P) {
  if (JSON.stringify(P).length > MAX_PROJECT_BYTES) return 'Проект слишком большой';
  try {
    const Q = normalize(structuredClone(P));
    buildSpec(Q);
    for (const m of Q.modules || []) buildSpec(m.P);
  } catch { return 'Параметры проекта не проходят расчёт'; }
  return null;
}
