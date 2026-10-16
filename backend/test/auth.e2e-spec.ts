import request from 'supertest';
import { API, client, createApp, createInstitution, createUser, Ctx, loginAs, PASSWORD, resetDb, tokenFromMail } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createApp(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx); });

describe('Login', () => {
  it('login válido cria sessão em cookie HttpOnly e /auth/me retorna o perfil sem segredos', async () => {
    const inst = await createInstitution(ctx, 'Escola Alfa');
    await createUser(ctx, { email: 'ana@escola.br', name: 'Ana', memberships: [{ institutionId: inst.id, role: 'professor' }] });
    const c = client(ctx);

    const res = await c.post('/auth/login', { email: '  ANA@Escola.br ', password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/fp_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(res.body).toMatchObject({ email: 'ana@escola.br', platformRoles: [], memberships: [{ role: 'professor', institution: { name: 'Escola Alfa' } }] });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash|\$argon2/);

    const me = await c.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.lastLoginAt).toBeTruthy();
  });

  it('senha errada e e-mail inexistente recebem a mesma resposta genérica', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const errada = await client(ctx).post('/auth/login', { email: 'ana@escola.br', password: 'outra-senha' });
    const inexistente = await client(ctx).post('/auth/login', { email: 'ninguem@escola.br', password: 'outra-senha' });
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    expect(errada.body.message).toBe(inexistente.body.message);
    expect(errada.headers['set-cookie']).toBeUndefined();
  });

  it('bloqueia a conta após tentativas excessivas, inclusive para a senha correta', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const c = client(ctx);
    expect((await c.post('/auth/login', { email: 'ana@escola.br', password: 'x1' })).status).toBe(401);
    expect((await c.post('/auth/login', { email: 'ana@escola.br', password: 'x2' })).status).toBe(401);
    expect((await c.post('/auth/login', { email: 'ana@escola.br', password: 'x3' })).status).toBe(429);
    expect((await c.post('/auth/login', { email: 'ana@escola.br', password: PASSWORD })).status).toBe(429);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'auth.login_locked' } })).toBe(1);

    await ctx.prisma.user.update({ where: { email: 'ana@escola.br' }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect((await c.post('/auth/login', { email: 'ana@escola.br', password: PASSWORD })).status).toBe(200);
  });

  it('conta desativada não autentica', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    await ctx.prisma.user.update({ where: { email: 'ana@escola.br' }, data: { status: 'disabled' } });
    expect((await client(ctx).post('/auth/login', { email: 'ana@escola.br', password: PASSWORD })).status).toBe(403);
  });

  it('valida o corpo: e-mail inválido e campos extras são rejeitados', async () => {
    expect((await client(ctx).post('/auth/login', { email: 'nao-e-email', password: 'x' })).status).toBe(400);
    const extra = await client(ctx).post('/auth/login', { email: 'a@b.br', password: 'x', role: 'coordinator' });
    expect(extra.status).toBe(400);
    expect(extra.body.message).toMatch(/Campo não permitido: role/);
  });
});

describe('Sessão', () => {
  it('logout revoga a sessão no servidor: o mesmo cookie deixa de funcionar', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const c = await loginAs(ctx, 'ana@escola.br');
    const cookie = (await ctx.prisma.session.findFirstOrThrow()).id;

    expect((await c.post('/auth/logout')).status).toBe(204);
    expect((await ctx.prisma.session.findUniqueOrThrow({ where: { id: cookie } })).revokedAt).not.toBeNull();
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('cookie antigo reutilizado após logout continua inválido', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const res = await request(ctx.app.getHttpServer()).post(`${API}/auth/login`).set('X-CSRF-Protection', '1')
      .send({ email: 'ana@escola.br', password: PASSWORD });
    const setCookie = String(res.headers['set-cookie']).split(';')[0];
    await request(ctx.app.getHttpServer()).post(`${API}/auth/logout`).set('X-CSRF-Protection', '1').set('Cookie', setCookie).expect(204);
    await request(ctx.app.getHttpServer()).get(`${API}/auth/me`).set('Cookie', setCookie).expect(401);
  });

  it('sessão expirada é recusada', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const c = await loginAs(ctx, 'ana@escola.br');
    await ctx.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const me = await c.get('/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.message).toMatch(/Sessão expirada/);
  });

  it('desativar a conta pelo administrador encerra as sessões abertas', async () => {
    await createUser(ctx, { email: 'admin@etica.br', admin: true });
    const ana = await createUser(ctx, { email: 'ana@escola.br' });
    const anaClient = await loginAs(ctx, 'ana@escola.br');
    const admin = await loginAs(ctx, 'admin@etica.br');
    expect((await admin.patch(`/users/${ana.id}`, { status: 'disabled' })).status).toBe(200);
    expect((await anaClient.get('/auth/me')).status).toBe(401);
  });

  it('rotas privadas exigem sessão', async () => {
    expect((await client(ctx).get('/users/me')).status).toBe(401);
    expect((await client(ctx).get('/institutions')).status).toBe(401);
  });
});

describe('Proteção CSRF', () => {
  it('escrita sem o cabeçalho X-CSRF-Protection é bloqueada', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const res = await request(ctx.app.getHttpServer()).post(`${API}/auth/login`).send({ email: 'ana@escola.br', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('escrita vinda de outra origem é bloqueada mesmo com o cabeçalho', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const res = await request(ctx.app.getHttpServer()).post(`${API}/auth/login`)
      .set('X-CSRF-Protection', '1').set('Origin', 'https://site-malicioso.example')
      .send({ email: 'ana@escola.br', password: PASSWORD });
    expect(res.status).toBe(403);
  });

  it('a origem do frontend configurada é aceita', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const res = await request(ctx.app.getHttpServer()).post(`${API}/auth/login`)
      .set('X-CSRF-Protection', '1').set('Origin', 'http://localhost:5173')
      .send({ email: 'ana@escola.br', password: PASSWORD });
    expect(res.status).toBe(200);
  });
});

describe('Recuperação de senha', () => {
  it('responde igual para e-mail inexistente e não envia nada', async () => {
    const res = await client(ctx).post('/auth/forgot-password', { email: 'ninguem@escola.br' });
    expect(res.status).toBe(202);
    expect(ctx.mail.outbox).toHaveLength(0);
  });

  it('token de uso único redefine a senha e revoga todas as sessões', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    const sessaoAntiga = await loginAs(ctx, 'ana@escola.br');

    expect((await client(ctx).post('/auth/forgot-password', { email: 'ana@escola.br' })).status).toBe(202);
    await new Promise((r) => setTimeout(r, 50));
    const token = tokenFromMail(ctx, 'ana@escola.br');
    expect(ctx.mail.outbox[0].text).toContain('http://localhost:5173/redefinir-senha?token=');
    expect(await ctx.prisma.passwordResetToken.count({ where: { tokenHash: token } })).toBe(0);

    expect((await client(ctx).post('/auth/reset-password', { token, password: 'nova-senha-456' })).status).toBe(204);
    expect((await sessaoAntiga.get('/auth/me')).status).toBe(401);
    expect((await client(ctx).post('/auth/login', { email: 'ana@escola.br', password: PASSWORD })).status).toBe(401);
    expect((await client(ctx).post('/auth/login', { email: 'ana@escola.br', password: 'nova-senha-456' })).status).toBe(200);

    expect((await client(ctx).post('/auth/reset-password', { token, password: 'outra-senha-789' })).status).toBe(400);
  });

  it('token expirado é recusado; um novo pedido invalida o anterior', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    await client(ctx).post('/auth/forgot-password', { email: 'ana@escola.br' });
    await new Promise((r) => setTimeout(r, 50));
    const primeiro = tokenFromMail(ctx, 'ana@escola.br');
    await client(ctx).post('/auth/forgot-password', { email: 'ana@escola.br' });
    await new Promise((r) => setTimeout(r, 50));
    const segundo = tokenFromMail(ctx, 'ana@escola.br');

    expect((await client(ctx).post('/auth/reset-password', { token: primeiro, password: 'nova-senha-456' })).status).toBe(400);
    await ctx.prisma.passwordResetToken.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await client(ctx).post('/auth/reset-password', { token: segundo, password: 'nova-senha-456' })).status).toBe(400);
  });

  it('senha curta é rejeitada', async () => {
    const res = await client(ctx).post('/auth/reset-password', { token: 'x'.repeat(43), password: '123' });
    expect(res.status).toBe(400);
  });
});

describe('Segredo do proxy', () => {
  it('com PROXY_SECRET, a API recusa acesso direto e aceita o proxy; health continua público', async () => {
    const secret = 's'.repeat(40);
    const proxied = await createApp({ PROXY_SECRET: secret });
    try {
      const server = proxied.app.getHttpServer();
      expect((await request(server).get(`${API}/auth/me`)).status).toBe(403);
      expect((await request(server).get(`${API}/auth/me`).set('X-Proxy-Secret', 'errado')).status).toBe(403);
      expect((await request(server).get(`${API}/auth/me`).set('X-Proxy-Secret', secret)).status).toBe(401);
      expect((await request(server).get(`${API}/health`)).status).toBe(200);
    } finally {
      await proxied.app.close();
    }
  });
});
