import { loadConfig } from './config.js';
import { connect, migrate } from './db/index.js';
import { createMailer } from './lib/mail.js';
import { buildApp } from './app.js';

const cfg = loadConfig();
const sql = connect(cfg.databaseUrl);
await migrate(sql);
const app = await buildApp({ sql, cfg, mailer: createMailer(cfg), logger: true });
await app.listen({ port: cfg.port, host: '0.0.0.0' });

for (const s of ['SIGINT', 'SIGTERM']) process.on(s, async () => { await app.close(); await sql.end(); process.exit(0); });
