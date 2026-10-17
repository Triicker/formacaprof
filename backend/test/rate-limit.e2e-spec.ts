import { client, createApp, createUser, Ctx, loginAs, PASSWORD, resetDb } from './helpers';

// Limite de requisições LIGADO (os demais testes rodam com ele desligado).
// Todas as chamadas daqui saem do mesmo IP, como numa escola com uma única rede Wi-Fi.
let ctx: Ctx;
beforeAll(async () => { ctx = await createApp({ RATE_LIMIT_ENABLED: 'true' }); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx); });

describe('Limite de requisições numa rede compartilhada', () => {
  it('12 professores diferentes entram pelo mesmo IP no mesmo minuto', async () => {
    const emails = Array.from({ length: 12 }, (_, i) => `prof${i}@escola.br`);
    for (const email of emails) await createUser(ctx, { email });
    const status = [];
    for (const email of emails) status.push((await client(ctx).post('/auth/login', { email, password: PASSWORD })).status);
    expect(status).toEqual(Array(12).fill(200));
  });

  it('a mesma conta é limitada no 11º login do minuto, com mensagem em português, sem afetar os colegas', async () => {
    await createUser(ctx, { email: 'ana@escola.br' });
    await createUser(ctx, { email: 'bia@escola.br' });
    for (let i = 0; i < 10; i++) expect((await client(ctx).post('/auth/login', { email: 'ana@escola.br', password: PASSWORD })).status).toBe(200);
    const bloqueado = await client(ctx).post('/auth/login', { email: 'ANA@escola.br ', password: PASSWORD });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.message).toBe('Muitas tentativas em pouco tempo. Aguarde um minuto e tente novamente.');
    expect((await client(ctx).post('/auth/login', { email: 'bia@escola.br', password: PASSWORD })).status).toBe(200);
  });

  // Contadores ficam em memória entre os testes: cada teste usa contas próprias.
  it('com sessão, a cota é por pessoa: quem passa do limite não bloqueia outra sessão no mesmo IP', async () => {
    await createUser(ctx, { email: 'carla@escola.br' });
    await createUser(ctx, { email: 'duda@escola.br' });
    const carla = await loginAs(ctx, 'carla@escola.br');
    const duda = await loginAs(ctx, 'duda@escola.br');
    let ultimo = 0;
    for (let i = 0; i < 301; i++) ultimo = (await carla.get('/auth/me')).status;
    expect(ultimo).toBe(429);
    expect((await duda.get('/auth/me')).status).toBe(200);
  });

  it('o health check do Render nunca é limitado', async () => {
    const c = client(ctx);
    for (let i = 0; i < 20; i++) expect((await c.get('/health')).status).toBe(200);
  });
});
