import { Prisma } from '@prisma/client';
import { client, createApp, createInstitution, createUser, Ctx, loginAs, PASSWORD, resetDb, tokenFromMail } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createApp(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx); });

describe('Fluxo institucional completo', () => {
  it('admin cria escola → convida coordenador → coordenador convida professor → professor entra', async () => {
    await createUser(ctx, { email: 'admin@etica.br', admin: true });
    const admin = await loginAs(ctx, 'admin@etica.br');

    const escola = (await admin.post('/institutions', { name: 'EM Paulo Freire', city: 'Salvador', state: 'BA' })).body;
    const conviteCoord = await admin.post(`/institutions/${escola.id}/invitations`, { email: 'Coord@PauloFreire.edu.br', role: 'coordinator' });
    expect(conviteCoord.status).toBe(201);
    expect(conviteCoord.body).toMatchObject({ email: 'coord@paulofreire.edu.br', role: 'coordinator', status: 'pending', emailSent: true });
    const tokenCoord = tokenFromMail(ctx, 'coord@paulofreire.edu.br');
    expect(JSON.stringify(conviteCoord.body)).not.toContain(tokenCoord);

    const preview = await client(ctx).post('/invitations/preview', { token: tokenCoord });
    expect(preview.body).toMatchObject({ email: 'coord@paulofreire.edu.br', role: 'coordinator', institution: { name: 'EM Paulo Freire' }, accountExists: false });

    const coord = client(ctx);
    const aceite = await coord.post('/invitations/accept', { token: tokenCoord, name: 'Carla Coordenadora', password: 'coord-senha-1' });
    expect(aceite.status).toBe(200);
    expect(aceite.body.memberships).toEqual([expect.objectContaining({ role: 'coordinator', institution: expect.objectContaining({ id: escola.id }) })]);

    const conviteProf = await coord.post(`/institutions/${escola.id}/invitations`, { email: 'prof@paulofreire.edu.br', role: 'professor' });
    expect(conviteProf.status).toBe(201);
    const tokenProf = tokenFromMail(ctx, 'prof@paulofreire.edu.br');
    expect((await client(ctx).post('/invitations/accept', { token: tokenProf, name: 'Pedro Professor', password: 'prof-senha-1' })).status).toBe(200);

    const prof = await loginAs(ctx, 'prof@paulofreire.edu.br', 'prof-senha-1');
    const me = (await prof.get('/auth/me')).body;
    expect(me.memberships).toEqual([expect.objectContaining({ role: 'professor', institution: expect.objectContaining({ name: 'EM Paulo Freire' }) })]);
    expect(me.emailVerifiedAt).toBeTruthy();

    const membros = (await coord.get(`/institutions/${escola.id}/members`)).body.items;
    expect(membros.map((m: { role: string }) => m.role).sort()).toEqual(['coordinator', 'professor']);
    const acoes = (await admin.get(`/audit-logs?institutionId=${escola.id}`)).body.items.map((a: { action: string }) => a.action);
    expect(acoes.filter((a: string) => a === 'invitation.accepted')).toHaveLength(2);
  });
});

describe('Validade do convite', () => {
  let escola: { id: string };
  let coord: Awaited<ReturnType<typeof loginAs>>;
  beforeEach(async () => {
    escola = await createInstitution(ctx, 'Escola Teste');
    await createUser(ctx, { email: 'coord@escola.br', memberships: [{ institutionId: escola.id, role: 'coordinator' }] });
    coord = await loginAs(ctx, 'coord@escola.br');
  });
  const convidar = async (email = 'prof@escola.br') => {
    const res = await coord.post(`/institutions/${escola.id}/invitations`, { email, role: 'professor' });
    expect(res.status).toBe(201);
    return { id: res.body.id as string, token: tokenFromMail(ctx, email) };
  };
  const aceitar = (token: string, extra: object = {}) =>
    client(ctx).post('/invitations/accept', { token, name: 'Prof Teste', password: 'senha-nova-1', ...extra });

  it('expirado é recusado', async () => {
    const { id, token } = await convidar();
    await ctx.prisma.invitation.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await aceitar(token)).status).toBe(400);
    expect((await client(ctx).post('/invitations/preview', { token })).status).toBe(400);
    expect(await ctx.prisma.user.count({ where: { email: 'prof@escola.br' } })).toBe(0);
  });

  it('revogado é recusado', async () => {
    const { id, token } = await convidar();
    expect((await coord.delete(`/institutions/${escola.id}/invitations/${id}`)).status).toBe(204);
    expect((await aceitar(token)).status).toBe(400);
    expect((await coord.delete(`/institutions/${escola.id}/invitations/${id}`)).status).toBe(400);
  });

  it('é de uso único', async () => {
    const { token } = await convidar();
    expect((await aceitar(token)).status).toBe(200);
    const reuso = await aceitar(token, { name: 'Outra Pessoa', password: 'outra-senha-1' });
    expect(reuso.status).toBe(400);
    expect(await ctx.prisma.membership.count({ where: { institutionId: escola.id, role: 'professor' } })).toBe(1);
  });

  it('aceites simultâneos: apenas um tem sucesso', async () => {
    const { token } = await convidar();
    const resultados = await Promise.all([aceitar(token), aceitar(token), aceitar(token)]);
    expect(resultados.map((r) => r.status).filter((s) => s === 200)).toHaveLength(1);
    expect(await ctx.prisma.user.count({ where: { email: 'prof@escola.br' } })).toBe(1);
  });

  it('token adulterado ou inexistente é recusado com a mesma mensagem', async () => {
    const { token } = await convidar();
    const a = await aceitar(token.slice(0, -2) + 'xx');
    const b = await aceitar('x'.repeat(43));
    expect(a.status).toBe(400);
    expect(a.body.message).toBe(b.body.message);
  });

  it('papel e instituição vêm do convite: campos enviados pelo navegador são rejeitados', async () => {
    const outra = await createInstitution(ctx, 'Outra Escola');
    const { token } = await convidar();
    for (const extra of [{ role: 'coordinator' }, { institutionId: outra.id }, { email: 'outro@x.br' }]) {
      expect((await aceitar(token, extra)).status).toBe(400);
    }
    expect((await aceitar(token)).body.memberships).toEqual([expect.objectContaining({ role: 'professor', institution: expect.objectContaining({ id: escola.id }) })]);
  });

  it('novo convite para o mesmo e-mail invalida o anterior', async () => {
    const primeiro = await convidar();
    const segundo = await convidar();
    expect((await aceitar(primeiro.token)).status).toBe(400);
    expect((await aceitar(segundo.token)).status).toBe(200);
  });

  it('instituição desativada invalida convites pendentes', async () => {
    const { token } = await convidar();
    await ctx.prisma.institution.update({ where: { id: escola.id }, data: { status: 'inactive' } });
    expect((await aceitar(token)).status).toBe(400);
  });

  it('nome é obrigatório para conta nova e senha fraca é rejeitada', async () => {
    const { token } = await convidar();
    expect((await client(ctx).post('/invitations/accept', { token, password: 'senha-nova-1' })).status).toBe(400);
    expect((await aceitar(token, { password: '123' })).status).toBe(400);
  });
});

describe('Conta existente e múltiplas instituições', () => {
  it('quem já tem conta aceita convite de outra escola com a senha atual e passa a ter dois vínculos', async () => {
    const A = await createInstitution(ctx, 'Escola A');
    const B = await createInstitution(ctx, 'Escola B');
    await createUser(ctx, { email: 'admin@etica.br', admin: true });
    await createUser(ctx, { email: 'prof@x.br', memberships: [{ institutionId: A.id, role: 'professor' }] });
    const admin = await loginAs(ctx, 'admin@etica.br');
    await admin.post(`/institutions/${B.id}/invitations`, { email: 'prof@x.br', role: 'professor' });
    const token = tokenFromMail(ctx, 'prof@x.br');

    expect((await client(ctx).post('/invitations/preview', { token })).body.accountExists).toBe(true);
    const senhaErrada = await client(ctx).post('/invitations/accept', { token, password: 'nao-e-a-senha' });
    expect(senhaErrada.status).toBe(401);

    const ok = await client(ctx).post('/invitations/accept', { token, password: PASSWORD, name: 'Ignorado' });
    expect(ok.status).toBe(200);
    expect(ok.body.memberships.map((m: { institution: { id: string } }) => m.institution.id).sort()).toEqual([A.id, B.id].sort());
    expect(ok.body.name).toBe('prof');
    expect(await ctx.prisma.user.count({ where: { email: 'prof@x.br' } })).toBe(1);
  });
});

describe('Duplicidade', () => {
  it('não convida quem já tem vínculo ativo na instituição', async () => {
    const escola = await createInstitution(ctx, 'Escola');
    await createUser(ctx, { email: 'admin@etica.br', admin: true });
    await createUser(ctx, { email: 'prof@x.br', memberships: [{ institutionId: escola.id, role: 'professor' }] });
    const admin = await loginAs(ctx, 'admin@etica.br');
    const res = await admin.post(`/institutions/${escola.id}/invitations`, { email: 'PROF@x.br', role: 'professor' });
    expect(res.status).toBe(409);
  });

  it('o banco impede e-mail duplicado, e-mail não normalizado e vínculo duplicado', async () => {
    const escola = await createInstitution(ctx, 'Escola');
    const user = await createUser(ctx, { email: 'prof@x.br', memberships: [{ institutionId: escola.id, role: 'professor' }] });

    await expect(ctx.prisma.user.create({ data: { email: 'prof@x.br', name: 'Dup' } }))
      .rejects.toMatchObject({ code: 'P2002' });
    await expect(ctx.prisma.user.create({ data: { email: 'Outro@X.br', name: 'Maiúsculas' } }))
      .rejects.toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
    await expect(ctx.prisma.membership.create({ data: { userId: user.id, institutionId: escola.id, role: 'coordinator' } }))
      .rejects.toMatchObject({ code: 'P2002' });
  });

  it('coordenador revoga convite de professor, mas não convite de coordenador feito pelo administrador', async () => {
    const escola = await createInstitution(ctx, 'Escola');
    await createUser(ctx, { email: 'admin@etica.br', admin: true });
    await createUser(ctx, { email: 'coord@x.br', memberships: [{ institutionId: escola.id, role: 'coordinator' }] });
    const admin = await loginAs(ctx, 'admin@etica.br');
    const coord = await loginAs(ctx, 'coord@x.br');
    const deCoord = (await admin.post(`/institutions/${escola.id}/invitations`, { email: 'coord2@x.br', role: 'coordinator' })).body.id;
    const deProf = (await coord.post(`/institutions/${escola.id}/invitations`, { email: 'prof@x.br', role: 'professor' })).body.id;
    expect((await coord.delete(`/institutions/${escola.id}/invitations/${deCoord}`)).status).toBe(403);
    expect((await coord.delete(`/institutions/${escola.id}/invitations/${deProf}`)).status).toBe(204);
  });
});
