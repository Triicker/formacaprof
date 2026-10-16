// PostgreSQL local para desenvolvimento, sem Docker (binários oficiais via embedded-postgres).
// Uso: npm run db:local  → mantém o servidor rodando em localhost:5433 até Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../.pgdata', import.meta.url));
const port = Number(process.env.LOCAL_PG_PORT || 5433);
const pg = new EmbeddedPostgres({ databaseDir: dataDir, port, user: 'postgres', password: 'postgres', persistent: true });

if (!existsSync(dataDir)) await pg.initialise();
await pg.start();
for (const db of ['formacaprof_dev', 'formacaprof_test']) {
  await pg.createDatabase(db).catch((e) => { if (!String(e.message).includes('already exists')) throw e; });
}
console.log(`PostgreSQL pronto: postgresql://postgres:postgres@localhost:${port}/formacaprof_dev`);
const parar = async () => { await pg.stop(); process.exit(0); };
process.on('SIGINT', parar);
process.on('SIGTERM', parar);
