import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipRole, RecordStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PasswordService } from '../src/auth/password.service';
import { AppConfig, loadConfig } from '../src/config/app-config';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

export const API = '/api/v1';
export const PASSWORD = 'senha-segura-123';

export interface Ctx {
  app: INestApplication;
  prisma: PrismaService;
  mail: MailService;
  config: AppConfig;
}

export async function createApp(overrides: Record<string, string> = {}): Promise<Ctx> {
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    APP_URL: 'http://localhost:5173',
    MAIL_DRIVER: 'memory',
    RATE_LIMIT_ENABLED: 'false',
    SWAGGER_ENABLED: 'false',
    LOGIN_MAX_ATTEMPTS: '3',
    ...overrides,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, config);
  await app.init();
  return { app, prisma: app.get(PrismaService), mail: app.get(MailService), config };
}

export async function resetDb(ctx: Ctx) {
  await ctx.prisma.$executeRawUnsafe(
    'TRUNCATE certificates, feedbacks, lesson_progress, enrollments, institution_collection_access, lessons, modules, collections, media_assets, '
    + 'audit_logs, sessions, password_reset_tokens, invitations, memberships, platform_roles, users, institutions, organizations CASCADE',
  );
  ctx.mail.outbox.length = 0;
}

/** Cliente HTTP com cookie de sessão próprio e o cabeçalho CSRF já aplicado nas escritas. */
export function client(ctx: Ctx) {
  const agent = request.agent(ctx.app.getHttpServer());
  const csrf = (r: request.Test) => r.set('X-CSRF-Protection', '1');
  return {
    agent,
    get: (url: string) => agent.get(API + url),
    post: (url: string, body?: object) => csrf(agent.post(API + url)).send(body ?? {}),
    patch: (url: string, body?: object) => csrf(agent.patch(API + url)).send(body ?? {}),
    put: (url: string, body?: object) => csrf(agent.put(API + url)).send(body ?? {}),
    delete: (url: string) => csrf(agent.delete(API + url)),
  };
}
export type Client = ReturnType<typeof client>;

const passwords = new PasswordService();
let cachedHash: Promise<string> | undefined;

export async function createUser(
  ctx: Ctx,
  opts: { email: string; name?: string; admin?: boolean; memberships?: { institutionId: string; role: MembershipRole; status?: RecordStatus }[] },
) {
  cachedHash ??= passwords.hash(PASSWORD);
  const user = await ctx.prisma.user.create({
    data: { email: opts.email, name: opts.name ?? opts.email.split('@')[0], passwordHash: await cachedHash, emailVerifiedAt: new Date() },
  });
  if (opts.admin) await ctx.prisma.platformRoleGrant.create({ data: { userId: user.id, role: 'platform_admin' } });
  for (const m of opts.memberships ?? []) {
    await ctx.prisma.membership.create({ data: { userId: user.id, institutionId: m.institutionId, role: m.role, status: m.status } });
  }
  return user;
}

export function createInstitution(ctx: Ctx, name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return ctx.prisma.institution.create({ data: { name, slug } });
}

export async function loginAs(ctx: Ctx, email: string, password = PASSWORD): Promise<Client> {
  const c = client(ctx);
  const res = await c.post('/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`login ${email} falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return c;
}

/** Extrai o token do último e-mail enviado ao destinatário (driver de e-mail em memória). */
export function tokenFromMail(ctx: Ctx, to: string): string {
  const msg = [...ctx.mail.outbox].reverse().find((m) => m.to === to);
  const match = msg?.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`nenhum e-mail com token para ${to}`);
  return match[1];
}
