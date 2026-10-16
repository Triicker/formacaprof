import { createApp, createInstitution, createUser, Ctx, loginAs, resetDb } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createApp(); });
afterAll(async () => { await ctx.app.close(); });

/** Cenário: duas escolas (A e B), cada uma com coordenação e professores; mais um administrador e um usuário sem vínculo. */
let A: { id: string }, B: { id: string };
let profA: { id: string }, coordA: { id: string }, profB: { id: string }, coordB: { id: string };
let mProfA: string, mProfB: string, mCoordB: string, mOutroCoordA: string;

beforeEach(async () => {
  await resetDb(ctx);
  A = await createInstitution(ctx, 'Escola A');
  B = await createInstitution(ctx, 'Escola B');
  await createUser(ctx, { email: 'admin@etica.br', admin: true });
  coordA = await createUser(ctx, { email: 'coord.a@a.br', memberships: [{ institutionId: A.id, role: 'coordinator' }] });
  const outroCoordA = await createUser(ctx, { email: 'coord2.a@a.br', memberships: [{ institutionId: A.id, role: 'coordinator' }] });
  profA = await createUser(ctx, { email: 'prof.a@a.br', memberships: [{ institutionId: A.id, role: 'professor' }] });
  coordB = await createUser(ctx, { email: 'coord.b@b.br', memberships: [{ institutionId: B.id, role: 'coordinator' }] });
  profB = await createUser(ctx, { email: 'prof.b@b.br', memberships: [{ institutionId: B.id, role: 'professor' }] });
  await createUser(ctx, { email: 'solto@x.br' });

  const m = await ctx.prisma.membership.findMany();
  const of = (userId: string) => m.find((x) => x.userId === userId)!.id;
  mProfA = of(profA.id); mProfB = of(profB.id); mCoordB = of(coordB.id); mOutroCoordA = of(outroCoordA.id);
});

describe('Professor', () => {
  it('vê os próprios dados e a própria instituição', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.get('/users/me')).body.memberships).toEqual([expect.objectContaining({ role: 'professor', institution: expect.objectContaining({ id: A.id }) })]);
    expect((await c.get('/institutions')).body.items.map((i: { id: string }) => i.id)).toEqual([A.id]);
    expect((await c.get(`/institutions/${A.id}`)).status).toBe(200);
  });

  it('não acessa endpoints de coordenador nem de administrador', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.get(`/institutions/${A.id}/members`)).status).toBe(403);
    expect((await c.get(`/institutions/${A.id}/invitations`)).status).toBe(403);
    expect((await c.post(`/institutions/${A.id}/invitations`, { email: 'x@a.br', role: 'professor' })).status).toBe(403);
    expect((await c.patch(`/institutions/${A.id}/members/${mProfA}`, { status: 'inactive' })).status).toBe(403);
    expect((await c.post('/institutions', { name: 'Nova Escola' })).status).toBe(403);
    expect((await c.patch(`/institutions/${A.id}`, { name: 'Renomeada' })).status).toBe(403);
    expect((await c.get('/users')).status).toBe(403);
    expect((await c.get('/audit-logs')).status).toBe(403);
    expect((await c.get('/organizations')).status).toBe(403);
  });

  it('não vê outra instituição', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.get(`/institutions/${B.id}`)).status).toBe(403);
  });
});

describe('Usuário sem instituição', () => {
  it('autentica, mas não tem vínculos nem acesso a dados institucionais', async () => {
    const c = await loginAs(ctx, 'solto@x.br');
    const me = await c.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.memberships).toEqual([]);
    expect((await c.get('/institutions')).body).toEqual({ items: [], total: 0 });
    expect((await c.get(`/institutions/${A.id}`)).status).toBe(403);
    expect((await c.get(`/institutions/${A.id}/members`)).status).toBe(403);
  });
});

describe('Coordenador', () => {
  it('lista apenas membros da própria instituição', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    const res = await c.get(`/institutions/${A.id}/members`);
    expect(res.status).toBe(200);
    const emails = res.body.items.map((i: { user: { email: string } }) => i.user.email).sort();
    expect(emails).toEqual(['coord.a@a.br', 'coord2.a@a.br', 'prof.a@a.br']);
  });

  it('não consulta nem convida em outra instituição', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    expect((await c.get(`/institutions/${B.id}`)).status).toBe(403);
    expect((await c.get(`/institutions/${B.id}/members`)).status).toBe(403);
    expect((await c.get(`/institutions/${B.id}/invitations`)).status).toBe(403);
    expect((await c.post(`/institutions/${B.id}/invitations`, { email: 'novo@b.br', role: 'professor' })).status).toBe(403);
    expect(await ctx.prisma.invitation.count()).toBe(0);
  });

  it('não altera vínculo de outra escola, nem trocando o id da instituição na URL', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    expect((await c.patch(`/institutions/${B.id}/members/${mProfB}`, { status: 'inactive' })).status).toBe(403);
    expect((await c.patch(`/institutions/${A.id}/members/${mProfB}`, { status: 'inactive' })).status).toBe(404);
    expect((await ctx.prisma.membership.findUniqueOrThrow({ where: { id: mProfB } })).status).toBe('active');
  });

  it('não pode redirecionar o convite para outra escola pelo corpo da requisição', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    const res = await c.post(`/institutions/${A.id}/invitations`, { email: 'novo@a.br', role: 'professor', institutionId: B.id });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Campo não permitido: institutionId/);
    expect(await ctx.prisma.invitation.count()).toBe(0);
  });

  it('convida professor da própria escola, mas não coordenador', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    expect((await c.post(`/institutions/${A.id}/invitations`, { email: 'novo@a.br', role: 'professor' })).status).toBe(201);
    expect((await c.post(`/institutions/${A.id}/invitations`, { email: 'chefe@a.br', role: 'coordinator' })).status).toBe(403);
  });

  it('desativa professor da própria escola e o acesso dele ao vínculo cessa imediatamente', async () => {
    const prof = await loginAs(ctx, 'prof.a@a.br');
    const c = await loginAs(ctx, 'coord.a@a.br');
    const res = await c.patch(`/institutions/${A.id}/members/${mProfA}`, { status: 'inactive' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('inactive');
    expect((await prof.get('/auth/me')).body.memberships).toEqual([]);
    expect((await prof.get(`/institutions/${A.id}`)).status).toBe(403);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'membership.updated', institutionId: A.id } })).toBe(1);

    expect((await c.patch(`/institutions/${A.id}/members/${mProfA}`, { status: 'active' })).status).toBe(200);
  });

  it('não altera papéis, outros coordenadores nem o próprio vínculo', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    const meuVinculo = (await ctx.prisma.membership.findFirstOrThrow({ where: { userId: coordA.id } })).id;
    expect((await c.patch(`/institutions/${A.id}/members/${mProfA}`, { role: 'coordinator' })).status).toBe(403);
    expect((await c.patch(`/institutions/${A.id}/members/${mOutroCoordA}`, { status: 'inactive' })).status).toBe(403);
    expect((await c.patch(`/institutions/${A.id}/members/${meuVinculo}`, { role: 'coordinator', status: 'active' })).status).toBe(403);
  });

  it('não acessa rotas de administração global', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    expect((await c.post('/institutions', { name: 'Escola Paralela' })).status).toBe(403);
    expect((await c.patch(`/institutions/${A.id}`, { name: 'Renomeada' })).status).toBe(403);
    expect((await c.get('/users')).status).toBe(403);
    expect((await c.patch(`/users/${profA.id}`, { status: 'disabled' })).status).toBe(403);
    expect((await c.get('/audit-logs')).status).toBe(403);
  });

  it('coordenador desativado perde os poderes na hora', async () => {
    const coord = await loginAs(ctx, 'coord.b@b.br');
    const admin = await loginAs(ctx, 'admin@etica.br');
    expect((await admin.patch(`/institutions/${B.id}/members/${mCoordB}`, { status: 'inactive' })).status).toBe(200);
    expect((await coord.get(`/institutions/${B.id}/members`)).status).toBe(403);
  });

  it('instituição inativa deixa de conceder acesso aos seus membros', async () => {
    const coord = await loginAs(ctx, 'coord.a@a.br');
    await ctx.prisma.institution.update({ where: { id: A.id }, data: { status: 'inactive' } });
    expect((await coord.get(`/institutions/${A.id}/members`)).status).toBe(403);
  });
});

describe('Elevação de privilégio', () => {
  it('usuário não consegue se tornar administrador nem mudar e-mail/papel pelo próprio perfil', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    for (const body of [{ platformRoles: ['platform_admin'] }, { role: 'platform_admin' }, { isPlatformAdmin: true }, { email: 'admin@etica.br' }, { memberships: [] }]) {
      const res = await c.patch('/users/me', body);
      expect(res.status).toBe(400);
    }
    expect(await ctx.prisma.platformRoleGrant.count({ where: { userId: coordA.id } })).toBe(0);
    expect((await c.get('/users/me')).body.platformRoles).toEqual([]);
  });

  it('PATCH /users/me altera apenas os campos permitidos', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    const res = await c.patch('/users/me', { name: 'Ana Paula Souza', welcomeSeen: true });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Ana Paula Souza');
    expect(res.body.welcomeSeenAt).toBeTruthy();
  });

  it('não há endpoint que conceda papel global', async () => {
    const admin = await loginAs(ctx, 'admin@etica.br');
    expect((await admin.patch(`/users/${profA.id}`, { platformRoles: ['platform_admin'] })).status).toBe(400);
    expect(await ctx.prisma.platformRoleGrant.count()).toBe(1);
  });
});

describe('Administrador geral', () => {
  it('administra instituições e organizações e registra auditoria', async () => {
    const admin = await loginAs(ctx, 'admin@etica.br');
    const org = await admin.post('/organizations', { name: 'Secretaria Municipal de Educação' });
    expect(org.status).toBe(201);
    const inst = await admin.post('/institutions', { name: 'Escola Nova Esperança', organizationId: org.body.id, state: 'ba', city: 'Salvador' });
    expect(inst.status).toBe(201);
    expect(inst.body).toMatchObject({ slug: 'escola-nova-esperanca', state: 'BA', organization: { id: org.body.id } });
    expect((await admin.patch(`/institutions/${inst.body.id}`, { status: 'inactive' })).body.status).toBe('inactive');
    expect((await admin.get('/institutions')).body.total).toBe(3);
    expect((await admin.get(`/institutions/${B.id}/members`)).status).toBe(200);

    const audit = await admin.get(`/audit-logs?institutionId=${inst.body.id}`);
    expect(audit.body.items.map((a: { action: string }) => a.action).sort()).toEqual(['institution.created', 'institution.updated']);
  });

  it('não visualiza senhas, hashes nem tokens em nenhuma listagem', async () => {
    const admin = await loginAs(ctx, 'admin@etica.br');
    await admin.post(`/institutions/${A.id}/invitations`, { email: 'novo@a.br', role: 'coordinator' });
    const bodies = await Promise.all(['/users', `/institutions/${A.id}/members`, `/institutions/${A.id}/invitations`, '/audit-logs'].map((u) => admin.get(u)));
    for (const b of bodies) {
      expect(b.status).toBe(200);
      expect(JSON.stringify(b.body)).not.toMatch(/passwordHash|password_hash|tokenHash|token_hash|\$argon2|token=/i);
    }
  });

  it('slug duplicado retorna conflito', async () => {
    const admin = await loginAs(ctx, 'admin@etica.br');
    expect((await admin.post('/institutions', { name: 'Outra', slug: 'escola-a' })).status).toBe(409);
    const auto = await admin.post('/institutions', { name: 'Escola A' });
    expect(auto.body.slug).toBe('escola-a-2');
  });
});
