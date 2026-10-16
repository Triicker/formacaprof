import { execSync } from 'node:child_process';
import { ForbiddenException } from '@nestjs/common';
import { AccessPolicy } from '../src/access/access-policy.service';
import type { Actor } from '../src/common/actor';
import { hashToken, newToken, normalizeEmail, slugify } from '../src/common/tokens';
import { loadConfig } from '../src/config/app-config';

const base = { DATABASE_URL: 'postgresql://x', NODE_ENV: 'production', APP_URL: 'https://formacaprof.pages.dev', SMTP_HOST: 'smtp.example.com' };

describe('Configuração', () => {
  it('produção válida usa cookie seguro __Host- e SMTP', () => {
    const c = loadConfig(base);
    expect(c.cookieSecure).toBe(true);
    expect(c.sessionCookieName).toBe('__Host-fp_session');
    expect(c.mail.driver).toBe('smtp');
    expect(c.swaggerEnabled).toBe(false);
    expect(c.allowedOrigins).toEqual(['https://formacaprof.pages.dev']);
  });

  it.each([
    [{ MAIL_DRIVER: 'log' }, /MAIL_DRIVER/],
    [{ COOKIE_SECURE: 'false' }, /COOKIE_SECURE/],
    [{ APP_URL: 'http://formacaprof.pages.dev' }, /https/],
    [{ SMTP_HOST: '' }, /SMTP_HOST/],
    [{ DATABASE_URL: '' }, /DATABASE_URL/],
    [{ NODE_ENV: 'prod' }, /NODE_ENV/],
  ])('produção recusa configuração insegura %o', (override, erro) => {
    expect(() => loadConfig({ ...base, ...override })).toThrow(erro);
  });
});

describe('Tokens', () => {
  it('são aleatórios, longos e persistidos só como hash', () => {
    const a = newToken();
    expect(a).toHaveLength(43);
    expect(a).not.toBe(newToken());
    expect(hashToken(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normaliza e-mail e slug', () => {
    expect(normalizeEmail('  Ana@Escola.BR ')).toBe('ana@escola.br');
    expect(slugify('EM Profª Cecília Meireles!')).toBe('em-prof-cecilia-meireles');
  });
});

describe('AccessPolicy', () => {
  const policy = new AccessPolicy();
  const actor = (memberships: Actor['memberships'], isPlatformAdmin = false): Actor =>
    ({ userId: 'u1', sessionId: 's', email: 'x@x', isPlatformAdmin, memberships });
  const coordA = actor([{ id: 'm1', institutionId: 'A', role: 'coordinator' }]);
  const profA = actor([{ id: 'm2', institutionId: 'A', role: 'professor' }]);
  const admin = actor([], true);

  it('coordenador convida só professor da própria instituição', () => {
    expect(() => policy.assertCanInvite(coordA, 'A', 'professor')).not.toThrow();
    expect(() => policy.assertCanInvite(coordA, 'A', 'coordinator')).toThrow(ForbiddenException);
    expect(() => policy.assertCanInvite(coordA, 'B', 'professor')).toThrow(ForbiddenException);
    expect(() => policy.assertCanInvite(profA, 'A', 'professor')).toThrow(ForbiddenException);
    expect(() => policy.assertCanInvite(admin, 'B', 'coordinator')).not.toThrow();
  });

  it('coordenador altera só status de professor, nunca papel nem o próprio vínculo', () => {
    const prof = { institutionId: 'A', role: 'professor' as const, userId: 'u9' };
    expect(() => policy.assertCanChangeMembership(coordA, prof, {})).not.toThrow();
    expect(() => policy.assertCanChangeMembership(coordA, prof, { role: 'coordinator' })).toThrow(ForbiddenException);
    expect(() => policy.assertCanChangeMembership(coordA, { ...prof, role: 'coordinator' }, {})).toThrow(ForbiddenException);
    expect(() => policy.assertCanChangeMembership(coordA, { ...prof, userId: 'u1' }, {})).toThrow(ForbiddenException);
    expect(() => policy.assertCanChangeMembership(coordA, { ...prof, institutionId: 'B' }, {})).toThrow(ForbiddenException);
  });
});

describe('Migrations', () => {
  it('o schema Prisma não diverge das migrations versionadas', () => {
    // --exit-code: 0 = sem diferença, 2 = há diferença (falha o teste).
    execSync(
      `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "${process.env.SHADOW_DATABASE_URL}" --exit-code`,
      { stdio: 'pipe' },
    );
  });
});
