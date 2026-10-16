import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { databaseUrl, shadowUrl } = JSON.parse(readFileSync(join(tmpdir(), 'formacaprof-test-db.json'), 'utf8'));
process.env.DATABASE_URL = databaseUrl;
process.env.SHADOW_DATABASE_URL = shadowUrl;
process.env.NODE_ENV = 'test';
