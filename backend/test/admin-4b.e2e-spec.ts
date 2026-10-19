import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import request from 'supertest';
import { loadCatalogContent, seedCatalog } from '../src/catalog/content-seed';
import { API, Client, createApp, createInstitution, createUser, Ctx, loginAs, resetDb } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createApp({ STORAGE_DIR: resolve(require('node:os').tmpdir(), `formacaprof-storage-${process.pid}`) }); });
afterAll(async () => { await ctx.app.close(); });

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a9f00000000049454e44ae426082', 'hex');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(16)]);
const csrf = (r: request.Test) => r.set('X-CSRF-Protection', '1');
const upload = (c: Client, url: string, buf: Buffer, name: string, fields: Record<string, string> = {}) => {
  let r = csrf(c.agent.post(API + url)).attach('file', buf, name);
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  return r;
};

let A: { id: string };
let admin: Client;
let ids: Record<string, string>;
const CONFIRMA = { confirmImpact: true, justification: 'Mudança editorial aprovada' };

beforeEach(async () => {
  await resetDb(ctx);
  await seedCatalog(ctx.prisma, loadCatalogContent());
  A = await createInstitution(ctx, 'Escola A');
  ids = {
    admin: (await createUser(ctx, { email: 'admin@etica.br', admin: true })).id,
    coord: (await createUser(ctx, { email: 'coord@a.br', memberships: [{ institutionId: A.id, role: 'coordinator' }] })).id,
    prof: (await createUser(ctx, { email: 'prof@a.br', memberships: [{ institutionId: A.id, role: 'professor' }] })).id,
    prof2: (await createUser(ctx, { email: 'prof2@a.br', memberships: [{ institutionId: A.id, role: 'professor' }] })).id,
  };
  admin = await loginAs(ctx, 'admin@etica.br');
});

describe('Rotas de conteúdo e mídia são exclusivas do administrador', () => {
  it('coordenador e professor recebem 403', async () => {
    const col = await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
    for (const email of ['coord@a.br', 'prof@a.br']) {
      const c = await loginAs(ctx, email);
      expect((await c.get('/admin/collections')).status).toBe(403);
      expect((await c.post('/admin/collections', { title: 'Coleção X' })).status).toBe(403);
      expect((await c.patch(`/admin/collections/${col.id}`, { title: 'Hack' })).status).toBe(403);
      expect((await c.get('/admin/media')).status).toBe(403);
      expect((await upload(c, '/admin/media/upload', PNG, 'a.png')).status).toBe(403);
    }
  });
});

describe('Editor de coleções, módulos e aulas', () => {
  it('cria coleção em rascunho, módulos e aulas, reordena, publica e o professor matriculado acessa', async () => {
    const video = (await admin.post('/admin/media/external', { externalUrl: 'https://midiasave-5c064.web.app/video3.mp4', mimeType: 'video/mp4', title: 'Vídeo 3', durationSeconds: 72 })).body;
    const capa = (await upload(admin, '/admin/media/upload', PNG, 'capa.png', { title: 'Capa' })).body;
    expect(capa).toMatchObject({ kind: 'image', visibility: 'public', title: 'Capa' });

    const col = await admin.post('/admin/collections', { title: 'Educação para o Trânsito 2', coverAssetId: capa.id, layout: 'basta' });
    expect(col.status).toBe(201);
    expect(col.body).toMatchObject({ slug: 'educacao-para-o-transito-2', status: 'draft' });

    const m1 = (await admin.post(`/admin/collections/${col.body.id}/modules`, { title: 'Módulo 1', status: 'published' })).body;
    const m2 = (await admin.post(`/admin/collections/${col.body.id}/modules`, { title: 'Módulo 2', status: 'published' })).body;
    const a1 = await admin.post(`/admin/modules/${m1.id}/lessons`, { title: 'Aula 1', lessonType: 'video', mediaAssetId: video.id, durationSeconds: 72, status: 'published' });
    expect(a1.status).toBe(201);
    expect(a1.body).toMatchObject({ slug: 'aula-1', requiredForCompletion: true });
    expect((await admin.post(`/admin/modules/${m2.id}/lessons`, { title: 'Aula 1', lessonType: 'video', slug: 'aula-1' })).status).toBe(409);
    expect((await admin.post(`/admin/modules/${m1.id}/lessons`, { title: 'PDF errado', lessonType: 'document', mediaAssetId: video.id })).status).toBe(400);
    expect((await admin.post(`/admin/modules/${m1.id}/lessons`, { title: 'Capa como vídeo', lessonType: 'video', mediaAssetId: capa.id })).status).toBe(400);

    expect((await admin.put(`/admin/collections/${col.body.id}/modules/order`, { ids: [m2.id, m1.id] })).status).toBe(204);
    expect((await admin.put(`/admin/collections/${col.body.id}/modules/order`, { ids: [m2.id] })).status).toBe(400);
    const det = (await admin.get(`/admin/collections/${col.body.id}`)).body;
    expect(det.modules.map((m: { title: string }) => m.title)).toEqual(['Módulo 2', 'Módulo 1']);
    expect(det.modules[1].lessons[0]).toMatchObject({ title: 'Aula 1', mediaUrl: `/api/v1/media/${video.id}` });

    // Rascunho não pode ser liberado; publicado sim.
    expect((await admin.put(`/admin/institutions/${A.id}/collections/${col.body.id}/access`, { status: 'active' })).status).toBe(400);
    expect((await admin.patch(`/admin/collections/${col.body.id}`, { status: 'published' })).status).toBe(200);
    expect((await admin.put(`/admin/institutions/${A.id}/collections/${col.body.id}/access`, { status: 'active' })).status).toBe(200);
    const coord = await loginAs(ctx, 'coord@a.br');
    expect((await coord.post(`/institutions/${A.id}/enrollments`, { userId: ids.prof, collectionId: col.body.id })).status).toBe(201);

    const prof = await loginAs(ctx, 'prof@a.br');
    const card = (await prof.get('/me/collections')).body.items.find((i: { slug: string }) => i.slug === 'educacao-para-o-transito-2');
    expect(card).toMatchObject({ state: 'available', coverUrl: `/api/v1/media/${capa.id}`, progress: { requiredTotal: 1 } });
    expect((await prof.get(`/media/${capa.id}`)).headers['content-type']).toMatch(/image\/png/);

    const acoes = (await admin.get(`/audit-logs?entityId=${col.body.id}`)).body.items.map((a: { action: string }) => a.action);
    expect(acoes).toEqual(expect.arrayContaining(['collection.created', 'collection.status_changed', 'modules.reordered']));
  });

  it('slug de coleção publicada não muda; aula com histórico não é excluída (arquivar)', async () => {
    const basta = await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
    expect((await admin.patch(`/admin/collections/${basta.id}`, { slug: 'basta-2' })).status).toBe(400);
    await ctx.prisma.institutionCollectionAccess.create({ data: { institutionId: A.id, collectionId: basta.id } });
    const e = await ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: ids.prof, collectionId: basta.id } });
    const aula = await ctx.prisma.lesson.findFirstOrThrow({ where: { slug: 'anos-iniciais-1' } });
    await ctx.prisma.lessonProgress.create({ data: { enrollmentId: e.id, lessonId: aula.id, status: 'completed', completedAt: new Date() } });
    expect((await admin.delete(`/admin/lessons/${aula.id}`)).status).toBe(409);
    const arq = await admin.patch(`/admin/lessons/${aula.id}`, { status: 'archived' });
    expect(arq.status).toBe(409);
    expect((await admin.patch(`/admin/lessons/${aula.id}`, { status: 'archived', ...CONFIRMA })).status).toBe(200);
    expect(await ctx.prisma.lessonProgress.count({ where: { lessonId: aula.id } })).toBe(1);
    const mod = await ctx.prisma.module.findFirstOrThrow({ where: { slug: 'eja' } });
    expect((await admin.delete(`/admin/modules/${mod.id}`)).status).toBe(409);
  });
});

describe('17. Edição de curso sem invalidar dados históricos', () => {
  it('nova aula obrigatória exige confirmação; certificado emitido e conclusão certificada são preservados', async () => {
    const basta = await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
    await ctx.prisma.institutionCollectionAccess.create({ data: { institutionId: A.id, collectionId: basta.id } });
    const certificada = await ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: ids.prof, collectionId: basta.id } });
    const semCert = await ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: ids.prof2, collectionId: basta.id } });
    const req = await ctx.prisma.lesson.findMany({ where: { requiredForCompletion: true, status: 'published', module: { collectionId: basta.id } } });
    for (const e of [certificada, semCert]) {
      await ctx.prisma.lessonProgress.createMany({ data: req.map((l) => ({ enrollmentId: e.id, lessonId: l.id, status: 'completed' as const, completedAt: new Date() })) });
      await ctx.prisma.enrollment.update({ where: { id: e.id }, data: { completedAt: new Date() } });
    }
    const prof = await loginAs(ctx, 'prof@a.br');
    const cert = (await prof.post(`/me/enrollments/${certificada.id}/certificate`)).body;
    expect(cert.valid).toBe(true);

    const mod = await ctx.prisma.module.findFirstOrThrow({ where: { slug: 'eja', collectionId: basta.id } });
    const nova = { title: 'Capítulo 9 – Revisão', lessonType: 'video', status: 'published', requiredForCompletion: true };
    const semConfirmar = await admin.post(`/admin/modules/${mod.id}/lessons`, nova);
    expect(semConfirmar.status).toBe(409);
    expect(semConfirmar.body.impact).toMatchObject({ completedEnrollments: 2, certificates: 1 });
    const criada = await admin.post(`/admin/modules/${mod.id}/lessons`, { ...nova, ...CONFIRMA });
    expect(criada.status).toBe(201);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'lesson.created', entityId: criada.body.id } });
    expect(log.metadata).toMatchObject({ justification: 'Mudança editorial aprovada', required: true });

    // Qualquer atualização de progresso reavalia a conclusão: com certificado ela é mantida, sem certificado não.
    const p1 = await prof.put(`/me/lessons/${req[0].id}/progress`, { liked: true });
    expect(p1.body.summary).toMatchObject({ requiredTotal: 40, requiredCompleted: 39, status: 'in_progress' });
    expect((await ctx.prisma.enrollment.findUniqueOrThrow({ where: { id: certificada.id } })).completedAt).not.toBeNull();
    const prof2 = await loginAs(ctx, 'prof2@a.br');
    await prof2.put(`/me/lessons/${req[0].id}/progress`, { liked: true });
    expect((await ctx.prisma.enrollment.findUniqueOrThrow({ where: { id: semCert.id } })).completedAt).toBeNull();

    const verif = await request(ctx.app.getHttpServer()).get(`${API}/certificates/verify/${cert.verificationCode}`);
    expect(verif.body).toMatchObject({ valid: true, holderName: 'prof' });
    expect((await prof.get(`/me/certificates/${cert.id}`)).body).toMatchObject({ requiredLessons: 39, valid: true });
    expect(await ctx.prisma.lessonProgress.count({ where: { enrollmentId: { in: [certificada.id, semCert.id] } } })).toBe(78);
  });
});

describe('Liberação por instituição', () => {
  it('revogar com professores matriculados exige confirmação e não apaga o histórico', async () => {
    const basta = await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
    expect((await admin.put(`/admin/institutions/${A.id}/collections/${basta.id}/access`, { status: 'active' })).status).toBe(200);
    const coord = await loginAs(ctx, 'coord@a.br');
    const e = (await coord.post(`/institutions/${A.id}/enrollments`, { userId: ids.prof, collectionId: basta.id })).body;
    const prof = await loginAs(ctx, 'prof@a.br');
    const aula = await ctx.prisma.lesson.findFirstOrThrow({ where: { slug: 'anos-iniciais-2' } });
    await prof.put(`/me/lessons/${aula.id}/progress`, { completed: true });

    const sem = await admin.put(`/admin/institutions/${A.id}/collections/${basta.id}/access`, { status: 'revoked' });
    expect(sem.status).toBe(409);
    expect(sem.body.impact).toEqual({ activeEnrollments: 1 });
    expect((await admin.put(`/admin/institutions/${A.id}/collections/${basta.id}/access`, { status: 'revoked', confirmImpact: true, justification: 'Contrato encerrado em 2026' })).status).toBe(200);

    expect((await prof.get('/collections/basta/modules')).status).toBe(403);
    expect(await ctx.prisma.lessonProgress.count({ where: { enrollmentId: e.id } })).toBe(1);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'collection_access.revoked' } });
    expect(log).toMatchObject({ actorUserId: ids.admin, institutionId: A.id, entityId: basta.id, metadata: { from: 'active', to: 'revoked', justification: 'Contrato encerrado em 2026' } });
  });
});

describe('Biblioteca de mídia', () => {
  it('valida o conteúdo real do arquivo e o tamanho', async () => {
    expect((await upload(admin, '/admin/media/upload', Buffer.from('não sou png'), 'falso.png')).status).toBe(400);
    expect((await upload(admin, '/admin/media/upload', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg')).status).toBe(400);
    const v = await upload(admin, '/admin/media/upload', MP4, 'video.mp4');
    expect(v.status).toBe(400);
    expect(v.body.message).toMatch(/link externo|upload direto/);
    expect((await csrf(admin.agent.post(`${API}/admin/media/upload`))).status).toBe(400);
    expect((await admin.post('/admin/media/external', { externalUrl: 'http://inseguro.com/v.mp4', mimeType: 'video/mp4', title: 'x' })).status).toBe(400);
    expect((await admin.post('/admin/media/direct-upload')).status).toBe(501);
  });

  it('PDF protegido: arquivo gravado no storage, servido só a quem pode, substituição guarda histórico', async () => {
    const pdf = (await upload(admin, '/admin/media/upload', PDF, 'plano.pdf', { title: 'Plano' })).body;
    expect(pdf).toMatchObject({ kind: 'pdf', visibility: 'protected', usageTotal: 0 });
    const row = await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { id: pdf.id } });
    expect(row.storageKey).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
    expect(existsSync(resolve(ctx.config.storageDir, row.storageKey!))).toBe(true);
    expect((await admin.get(`/media/${pdf.id}`)).status).toBe(200);
    expect((await (await loginAs(ctx, 'prof@a.br')).get(`/media/${pdf.id}`)).status).toBe(403);

    expect((await upload(admin, `/admin/media/${pdf.id}/replace`, PNG, 'img.png')).status).toBe(400);
    const novo = await upload(admin, `/admin/media/${pdf.id}/replace`, PDF, 'plano-v2.pdf');
    expect(novo.status).toBe(201);
    expect(novo.body).toMatchObject({ id: pdf.id, replacements: 1 });
    expect(((await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { id: pdf.id } })).metadata as { history: { storageKey: string }[] }).history[0].storageKey).toBe(row.storageKey);
  });

  it('lista não utilizados e só remove o que não está em uso', async () => {
    const solto = (await upload(admin, '/admin/media/upload', PNG, 'solto.png')).body;
    const naoUsados = (await admin.get('/admin/media?unused=true&pageSize=100')).body.items.map((m: { id: string }) => m.id);
    expect(naoUsados).toContain(solto.id);
    const usado = await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { key: 'cover.basta' } });
    expect(naoUsados).not.toContain(usado.id);
    expect(naoUsados).not.toContain((await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { key: 'platform.welcome-video' } })).id);
    expect((await admin.delete(`/admin/media/${usado.id}`)).status).toBe(409);
    expect((await admin.delete(`/admin/media/${solto.id}`)).status).toBe(204);
    expect((await admin.get('/admin/media?pageSize=100')).body.items.map((m: { id: string }) => m.id)).not.toContain(solto.id);
    expect((await admin.patch(`/admin/media/${usado.id}`, { visibility: 'protected' })).status).toBe(400);
  });
});
