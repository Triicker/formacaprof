import { client, createApp, createInstitution, createUser, Ctx, loginAs, resetDb } from './helpers';

// Seletor de contas de teste na tela de login (período de testes com o seed:qa).
let ctx: Ctx;
beforeAll(async () => { ctx = await createApp(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx); });

const QA = '@qa.formacaprof.test';

describe('Login rápido de contas de teste', () => {
  it('lista só contas de QA ativas e sem papel de administrador', async () => {
    const escola = await createInstitution(ctx, 'Escola QA Alfa');
    await createUser(ctx, { email: `prof1.alfa${QA}`, name: 'QA Professora Um', memberships: [{ institutionId: escola.id, role: 'professor' }] });
    await createUser(ctx, { email: `coord.alfa${QA}`, name: 'QA Coordenação', memberships: [{ institutionId: escola.id, role: 'coordinator' }] });
    await createUser(ctx, { email: `admin${QA}`, admin: true });
    const desativada = await createUser(ctx, { email: `velha${QA}` });
    await ctx.prisma.user.update({ where: { id: desativada.id }, data: { status: 'disabled' } });
    await createUser(ctx, { email: 'ana@escola.br' });

    const r = await client(ctx).get('/auth/qa-accounts');
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: { email: string }) => i.email)).toEqual([`coord.alfa${QA}`, `prof1.alfa${QA}`]);
    expect(r.body.items[0]).toEqual({ email: `coord.alfa${QA}`, name: 'QA Coordenação', role: 'coordinator', institution: 'Escola QA Alfa' });
    expect(JSON.stringify(r.body)).not.toMatch(/password|hash/i);
  });

  it('entra sem senha numa conta de teste, abre sessão e registra na auditoria', async () => {
    await createUser(ctx, { email: `prof1.alfa${QA}` });
    const c = client(ctx);
    const r = await c.post('/auth/qa-login', { email: ` PROF1.ALFA${QA}` });
    expect(r.status).toBe(200);
    expect(r.body.email).toBe(`prof1.alfa${QA}`);
    expect((await c.get('/auth/me')).status).toBe(200);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'auth.qa_login' } })).toBe(1);
  });

  it('recusa conta real, administrador de teste e conta de teste desativada', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    await createUser(ctx, { email: `admin${QA}`, admin: true });
    const d = await createUser(ctx, { email: `velha${QA}` });
    await ctx.prisma.user.update({ where: { id: d.id }, data: { status: 'disabled' } });
    for (const email of ['ana@escola.br', `admin${QA}`, `velha${QA}`, `ninguem${QA}`]) {
      expect((await client(ctx).post('/auth/qa-login', { email })).status).toBe(404);
    }
  });

  it('conta de teste só convida e-mails de teste', async () => {
    const escola = await createInstitution(ctx, 'Escola QA Alfa');
    await createUser(ctx, { email: `coord.alfa${QA}`, memberships: [{ institutionId: escola.id, role: 'coordinator' }] });
    const c = await loginAs(ctx, `coord.alfa${QA}`);
    const real = await c.post(`/institutions/${escola.id}/invitations`, { email: 'pessoa.real@gmail.com', role: 'professor' });
    expect(real.status).toBe(400);
    expect(real.body.message).toBe('Contas de teste só podem convidar e-mails de teste (terminados em .test).');
    expect((await c.post(`/institutions/${escola.id}/invitations`, { email: `novo${QA}`, role: 'professor' })).status).toBe(201);
  });
});

describe('Login rápido desligado (QA_LOGIN_RAPIDO=nao)', () => {
  let off: Ctx;
  beforeAll(async () => { off = await createApp({ QA_LOGIN_RAPIDO: 'nao' }); });
  afterAll(async () => { await off.app.close(); });

  it('não lista contas nem permite entrar', async () => {
    await createUser(off, { email: `prof1.alfa${QA}` });
    expect((await client(off).get('/auth/qa-accounts')).body).toEqual({ items: [] });
    expect((await client(off).post('/auth/qa-login', { email: `prof1.alfa${QA}` })).status).toBe(404);
  });
});
