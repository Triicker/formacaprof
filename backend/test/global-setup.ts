/**
 * Sobe um PostgreSQL real, isolado e descartável para a suíte (diretório temporário + porta livre)
 * e aplica as migrations versionadas do zero: prova que elas são reproduzíveis em um banco vazio.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEST_DB_FILE = join(tmpdir(), 'formacaprof-test-db.json');

// Pacote ESM-only: carregado via require(esm) do Node 22, sem tipagem (uso restrito ao harness de testes).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EmbeddedPostgres = require('embedded-postgres').default as new (opts: object) => Pg;
export interface Pg { initialise(): Promise<void>; start(): Promise<void>; stop(): Promise<void>; createDatabase(name: string): Promise<void>; }

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export default async function globalSetup() {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), 'formacaprof-pg-'));
  const pg = new EmbeddedPostgres({ databaseDir: dir, port, user: 'postgres', password: 'postgres', persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('formacaprof_test');
  await pg.createDatabase('formacaprof_shadow');
  (globalThis as { __PG__?: Pg }).__PG__ = pg;

  const base = `postgresql://postgres:postgres@localhost:${port}`;
  const databaseUrl = `${base}/formacaprof_test`;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'pipe' });
  writeFileSync(TEST_DB_FILE, JSON.stringify({ databaseUrl, shadowUrl: `${base}/formacaprof_shadow` }));
}
