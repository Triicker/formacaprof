import type { Pg } from './global-setup';

export default async function globalTeardown() {
  await (globalThis as { __PG__?: Pg }).__PG__?.stop();
}
