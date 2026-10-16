import request from 'supertest';
import { API, client, createApp, createInstitution, createUser, Ctx, loginAs, PASSWORD, resetDb, tokenFromMail } from './helpers';
import { loadCatalogContent, seedCatalog } from '../src/catalog/content-seed';

let ctx: Ctx;
beforeAll(async () => { ctx = await createApp(); });
afterAll(async () => { await ctx.app.close(); });

let A: { id: string }, B: { id: string };
let ids: Record<string, string>;

beforeEach(async () => {
  await resetDb(ctx);
  A = await createInstitution(ctx, 'Escola A');
  B = await createInstitution(ctx, 'Escola B');
  const u = async (email: string, memberships: { institutionId: string; role: 'professor' | 'coordinator' }[] = [], admin = false) =>
    (await createUser(ctx, { email, admin, memberships })).id;
  ids = {
    admin: await u('admin@etica.br', [], true),
    coordA: await u('coord.a@a.br', [{ institutionId: A.id, role: 'coordinator' }]),
    profA: await u('prof.a@a.br', [{ institutionId: A.id, role: 'professor' }]),
    profAB: await u('prof.ab@x.br', [{ institutionId: A.id, role: 'professor' }, { institutionId: B.id, role: 'professor' }]),
    profB: await u('prof.b@b.br', [{ institutionId: B.id, role: 'professor' }]),
  };
});

describe('Proteção das rotas administrativas', () => {
  it('16. professor e coordenador recebem 403 em toda rota /admin e de gestão global', async () => {
    for (const email of ['prof.a@a.br', 'coord.a@a.br']) {
      const c = await loginAs(ctx, email);
      for (const url of ['/admin/dashboard', '/admin/institutions', `/admin/institutions/${A.id}`, '/admin/coordinators', '/admin/invitations', '/users', `/users/${ids.profA}`, '/audit-logs']) {
        expect([url, (await c.get(url)).status]).toEqual([url, 403]);
      }
      expect((await c.post(`/admin/institutions/${A.id}/coordinators`, { userId: ids.profA })).status).toBe(403);
      expect((await c.post(`/users/${ids.profA}/sessions/revoke`)).status).toBe(403);
      expect((await c.put(`/users/${ids.coordA}/platform-role`, { grant: true, justification: 'quero ser admin', currentPassword: PASSWORD })).status).toBe(403);
    }
    expect((await request(ctx.app.getHttpServer()).get(`${API}/admin/dashboard`)).status).toBe(401);
  });
});

describe('Dashboard global', () => {
  it('mostra números reais e filtra por instituição', async () => {
    await ctx.prisma.institution.update({ where: { id: B.id }, data: { status: 'inactive' } });
    const c = await loginAs(ctx, 'admin@etica.br');
    const geral = (await c.get('/admin/dashboard')).body;
    expect(geral).toMatchObject({ institutions: { total: 2, active: 1, inactive: 1 }, professors: 2, coordinators: 1 });
    expect(geral.recentActivity).toEqual(expect.any(Array));
    const soA = (await c.get(`/admin/dashboard?institutionId=${A.id}`)).body;
    expect(soA).toMatchObject({ institutions: { total: 1 }, professors: 2, coordinators: 1 });
    expect((await c.get('/admin/dashboard?from=nao-e-data')).status).toBe(400);
  });
});

describe('Instituições', () => {
  it('região do IBGE obrigatória no formato oficial e UF coerente com a região', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    const ok = await c.post('/institutions', { name: 'Escola Feira', region: 'Nordeste', state: 'BA', city: 'Feira de Santana' });
    expect(ok.status).toBe(201);
    expect((await c.post('/institutions', { name: 'Escola X', region: 'Bahia', state: 'BA' })).status).toBe(400);
    const errada = await c.post('/institutions', { name: 'Escola Y', region: 'Sul', state: 'BA' });
    expect(errada.status).toBe(400);
    expect(errada.body.message).toContain('não pertence à região Sul');
    // Troca só a UF: confere contra a região já gravada.
    expect((await c.patch(`/institutions/${ok.body.id}`, { state: 'SP' })).status).toBe(400);
    expect((await c.patch(`/institutions/${ok.body.id}`, { region: 'Sudeste', state: 'SP', city: 'Campinas' })).status).toBe(200);
  });

  it('lista com contagens, busca e paginação; detalhe com coordenadores e direitos', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    const lista = await c.get('/admin/institutions?pageSize=1&sort=name');
    expect(lista.body).toMatchObject({ total: 2, page: 1, pageSize: 1, pages: 2 });
    expect(lista.body.items[0]).toMatchObject({ name: 'Escola A', counts: { coordinators: 1, professors: 2, authorizedCollections: 0 } });
    expect((await c.get('/admin/institutions?q=escola b')).body.items.map((i: { name: string }) => i.name)).toEqual(['Escola B']);
    const det = await c.get(`/admin/institutions/${A.id}`);
    expect(det.body.coordinators).toEqual([expect.objectContaining({ user: expect.objectContaining({ email: 'coord.a@a.br' }) })]);
    expect(det.body.counts).toMatchObject({ professors: 2, pendingInvitations: 0 });
  });

  it('desativar/reativar instituição usa PATCH existente e é auditado', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    expect((await c.patch(`/institutions/${A.id}`, { status: 'inactive' })).body.status).toBe('inactive');
    expect((await c.patch(`/institutions/${A.id}`, { status: 'active' })).body.status).toBe('active');
    expect(await ctx.prisma.auditLog.count({ where: { action: 'institution.updated', institutionId: A.id } })).toBe(2);
  });
});

describe('Coordenadores', () => {
  it('designa usuário existente (promove o vínculo) e remover o vínculo não apaga a conta nem outros vínculos', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    const r = await c.post(`/admin/institutions/${A.id}/coordinators`, { userId: ids.profAB });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ role: 'coordinator', status: 'active' });
    expect(await ctx.prisma.auditLog.count({ where: { action: 'membership.coordinator_assigned' } })).toBe(1);

    const lista = await c.get(`/admin/coordinators?institutionId=${A.id}`);
    expect(lista.body.items.map((m: { user: { email: string } }) => m.user.email).sort()).toEqual(['coord.a@a.br', 'prof.ab@x.br']);

    // Substituição: o antigo coordenador é desativado só nesta instituição.
    const antigo = (await ctx.prisma.membership.findFirstOrThrow({ where: { userId: ids.coordA, institutionId: A.id } })).id;
    expect((await c.patch(`/institutions/${A.id}/members/${antigo}`, { status: 'inactive' })).status).toBe(200);
    expect((await ctx.prisma.user.findUniqueOrThrow({ where: { id: ids.coordA } })).status).toBe('active');

    const vinculoAB = r.body.id;
    expect((await c.patch(`/institutions/${A.id}/members/${vinculoAB}`, { status: 'inactive' })).status).toBe(200);
    const mB = await ctx.prisma.membership.findFirstOrThrow({ where: { userId: ids.profAB, institutionId: B.id } });
    expect(mB.status).toBe('active');
    expect((await (await loginAs(ctx, 'prof.ab@x.br')).get('/auth/me')).body.memberships.map((m: { institution: { id: string } }) => m.institution.id)).toEqual([B.id]);
  });

  it('não designa conta desativada nem em instituição inativa', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    await ctx.prisma.user.update({ where: { id: ids.profB }, data: { status: 'disabled' } });
    expect((await c.post(`/admin/institutions/${A.id}/coordinators`, { userId: ids.profB })).status).toBe(400);
    await ctx.prisma.institution.update({ where: { id: B.id }, data: { status: 'inactive' } });
    expect((await c.post(`/admin/institutions/${B.id}/coordinators`, { userId: ids.profA })).status).toBe(400);
  });
});

describe('Usuários', () => {
  it('busca, filtra por papel/instituição/status, pagina e nunca expõe segredos', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    const coords = await c.get(`/users?role=coordinator&institutionId=${A.id}`);
    expect(coords.body.items.map((u: { email: string }) => u.email)).toEqual(['coord.a@a.br']);
    expect((await c.get(`/users?role=professor&institutionId=${B.id}`)).body.total).toBe(2);
    expect((await c.get('/users?role=platform_admin')).body.items.map((u: { email: string }) => u.email)).toEqual(['admin@etica.br']);
    expect((await c.get('/users?q=PROF.B')).body.total).toBe(1);
    const pag = await c.get('/users?pageSize=2&page=3&sort=name');
    expect(pag.body).toMatchObject({ total: 5, pages: 3, page: 3 });
    expect(pag.body.items).toHaveLength(1);
    expect(JSON.stringify((await c.get('/users')).body)).not.toMatch(/passwordHash|tokenHash|\$argon2/);
    expect((await c.get('/users?role=diretor')).status).toBe(400);
  });

  it('edita dados permitidos, desativa (encerrando sessões) e mantém o histórico', async () => {
    const prof = await loginAs(ctx, 'prof.a@a.br');
    const c = await loginAs(ctx, 'admin@etica.br');
    expect((await c.patch(`/users/${ids.profA}`, { name: 'Professora Atualizada' })).body.name).toBe('Professora Atualizada');
    expect((await c.patch(`/users/${ids.profA}`, { email: 'outro@x.br' })).status).toBe(400);
    expect((await c.patch(`/users/${ids.profA}`, { status: 'disabled' })).status).toBe(200);
    expect((await prof.get('/auth/me')).status).toBe(401);

    const det = await c.get(`/users/${ids.profA}`);
    expect(det.body).toMatchObject({ status: 'disabled', activeSessions: 0, memberships: [expect.objectContaining({ role: 'professor' })] });
    const hist = await c.get(`/audit-logs?subjectUserId=${ids.profA}`);
    expect(hist.body.items.map((a: { action: string }) => a.action).sort()).toEqual(['user.disabled', 'user.updated']);
    expect(hist.body.items.find((a: { action: string }) => a.action === 'user.updated').metadata).toMatchObject({ from: { name: 'prof.a' }, to: { name: 'Professora Atualizada' } });
  });

  it('revoga as sessões sem desativar a conta', async () => {
    const prof = await loginAs(ctx, 'prof.a@a.br');
    const c = await loginAs(ctx, 'admin@etica.br');
    expect((await c.post(`/users/${ids.profA}/sessions/revoke`)).body).toEqual({ revoked: 1 });
    expect((await prof.get('/auth/me')).status).toBe(401);
    expect((await client(ctx).post('/auth/login', { email: 'prof.a@a.br', password: PASSWORD })).status).toBe(200);
  });
});

describe('Papel global (administrador geral)', () => {
  const body = (extra = {}) => ({ grant: true, justification: 'Nova pessoa da equipe Ética', currentPassword: PASSWORD, ...extra });

  it('exige senha do executor e justificativa; é auditado e tem efeito imediato', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    expect((await c.put(`/users/${ids.coordA}/platform-role`, body({ currentPassword: 'errada' }))).status).toBe(401);
    expect((await c.put(`/users/${ids.coordA}/platform-role`, body({ justification: 'curta' }))).status).toBe(400);
    expect((await c.put(`/users/${ids.coordA}/platform-role`, { grant: true, currentPassword: PASSWORD })).status).toBe(400);

    const coord = await loginAs(ctx, 'coord.a@a.br');
    expect((await coord.get('/admin/dashboard')).status).toBe(403);
    expect((await c.put(`/users/${ids.coordA}/platform-role`, body())).body).toEqual({ userId: ids.coordA, platformRoles: ['platform_admin'] });
    expect((await coord.get('/admin/dashboard')).status).toBe(200);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'platform_role.granted' } });
    expect(log).toMatchObject({ actorUserId: ids.admin, entityId: ids.coordA, metadata: { justification: 'Nova pessoa da equipe Ética' } });
    expect(JSON.stringify(log.metadata)).not.toContain(PASSWORD);

    expect((await c.put(`/users/${ids.coordA}/platform-role`, body({ grant: false }))).body.platformRoles).toEqual([]);
    expect((await coord.get('/admin/dashboard')).status).toBe(403);
  });

  it('não remove o próprio papel nem o último administrador', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    expect((await c.put(`/users/${ids.admin}/platform-role`, body({ grant: false }))).status).toBe(400);
    await ctx.prisma.platformRoleGrant.create({ data: { userId: ids.coordA, role: 'platform_admin' } });
    const outro = await loginAs(ctx, 'coord.a@a.br');
    expect((await outro.put(`/users/${ids.admin}/platform-role`, body({ grant: false }))).status).toBe(200);
    expect((await outro.put(`/users/${ids.coordA}/platform-role`, body({ grant: false }))).status).toBe(400);
  });
});

describe('Convites: reenvio e visão global', () => {
  it('reenviar gera novo link e invalida o anterior', async () => {
    const coord = await loginAs(ctx, 'coord.a@a.br');
    const inv = (await coord.post(`/institutions/${A.id}/invitations`, { email: 'novo@a.br', role: 'professor' })).body;
    const antigo = tokenFromMail(ctx, 'novo@a.br');
    const re = await coord.post(`/institutions/${A.id}/invitations/${inv.id}/resend`);
    expect(re.status).toBe(201);
    const novo = tokenFromMail(ctx, 'novo@a.br');
    expect(novo).not.toBe(antigo);
    expect((await client(ctx).post('/invitations/preview', { token: antigo })).status).toBe(400);
    expect((await client(ctx).post('/invitations/accept', { token: novo, name: 'Novo Prof', password: 'senha-nova-1' })).status).toBe(200);
    expect((await coord.post(`/institutions/${A.id}/invitations/${re.body.id}/resend`)).status).toBe(400);
  });

  it('coordenador não reenvia convite de coordenador nem de outra escola', async () => {
    const admin = await loginAs(ctx, 'admin@etica.br');
    const deCoord = (await admin.post(`/institutions/${A.id}/invitations`, { email: 'c2@a.br', role: 'coordinator' })).body.id;
    const deB = (await admin.post(`/institutions/${B.id}/invitations`, { email: 'p@b.br', role: 'professor' })).body.id;
    const coord = await loginAs(ctx, 'coord.a@a.br');
    expect((await coord.post(`/institutions/${A.id}/invitations/${deCoord}/resend`)).status).toBe(403);
    expect((await coord.post(`/institutions/${A.id}/invitations/${deB}/resend`)).status).toBe(404);
    expect((await coord.post(`/institutions/${B.id}/invitations/${deB}/resend`)).status).toBe(403);

    const pend = await admin.get('/admin/invitations?status=pending&role=coordinator');
    expect(pend.body.items.map((i: { email: string }) => i.email)).toEqual(['c2@a.br']);
    expect(pend.body.items[0].institution.name).toBe('Escola A');
    expect(JSON.stringify(pend.body)).not.toMatch(/token/i);
  });
});

describe('Vínculo direto pelo administrador', () => {
  it('admin se vincula à instituição, é matriculado nas coleções liberadas e acessa; o acesso segue a liberação', async () => {
    await seedCatalog(ctx.prisma, loadCatalogContent());
    const basta = await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
    const c = await loginAs(ctx, 'admin@etica.br');
    const bastaCard = async (inst = A.id) => ((await c.get(`/me/collections${inst ? `?institutionId=${inst}` : ''}`)).body.items as { slug: string; state: string; reason?: string }[])
      .find((i) => i.slug === 'basta')!;

    // Sem vínculo: bloqueado, mesmo sendo administrador; e não pode usar o contexto de uma instituição alheia.
    expect((await bastaCard('')).state).toBe('locked');
    expect((await c.get(`/me/collections?institutionId=${A.id}`)).status).toBe(403);

    expect((await c.put(`/admin/institutions/${A.id}/collections/${basta.id}/access`, { status: 'active' })).status).toBe(200);
    const r = await c.post(`/admin/institutions/${A.id}/members`, { userId: ids.admin, role: 'professor', enrollInCollections: true });
    expect(r.status).toBe(201);
    expect(r.body.enrolledCollections).toEqual([basta.id]);
    expect((await bastaCard()).state).toBe('available');

    // Repetir não duplica matrícula; papel pode ser trocado.
    const r2 = await c.post(`/admin/institutions/${A.id}/members`, { userId: ids.admin, role: 'coordinator', enrollInCollections: true });
    expect(r2.body.enrolledCollections).toEqual([]);
    expect(r2.body.membership.role).toBe('coordinator');

    // Liberação suspensa: o acesso cai junto.
    await c.put(`/admin/institutions/${A.id}/collections/${basta.id}/access`, { status: 'suspended', justification: 'teste de suspensão', confirmImpact: true });
    expect((await bastaCard()).state).toBe('locked');

    const audit = (await c.get(`/audit-logs?institutionId=${A.id}&actionPrefix=membership.`)).body.items.map((a: { action: string }) => a.action);
    expect(audit).toContain('membership.assigned');
  });

  it('sem matrícula quando não pedida; só administrador; usuário desativado recusado', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    const r = await c.post(`/admin/institutions/${B.id}/members`, { userId: ids.profA, role: 'professor' });
    expect(r.status).toBe(201);
    expect(r.body.enrolledCollections).toEqual([]);
    expect((await c.post(`/admin/institutions/${B.id}/members`, { userId: ids.profA, role: 'platform_admin' })).status).toBe(400);
    const coord = await loginAs(ctx, 'coord.a@a.br');
    expect((await coord.post(`/admin/institutions/${A.id}/members`, { userId: ids.coordA, role: 'professor' })).status).toBe(403);
    await ctx.prisma.user.update({ where: { id: ids.profB }, data: { status: 'disabled' } });
    expect((await c.post(`/admin/institutions/${A.id}/members`, { userId: ids.profB, role: 'professor' })).status).toBe(400);
  });
});
