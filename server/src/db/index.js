import postgres from 'postgres';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../../migrations/', import.meta.url));

export const connect = url => postgres(url, { max: 10, onnotice: () => {} });

/** Применяет migrations/*.sql по порядку; применённые записаны в schema_migrations. Под advisory-локом: безопасно при нескольких репликах. */
export async function migrate(sql) {
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(727274)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Set((await tx`SELECT name FROM schema_migrations`).map(r => r.name));
    for (const f of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await tx.unsafe(readFileSync(MIGRATIONS + f, 'utf8'));
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
    }
  });
}
