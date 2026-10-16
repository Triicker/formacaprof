import request from 'supertest';
import { loadCatalogContent, seedCatalog } from '../src/catalog/content-seed';
import { API, client, Client, createApp, createInstitution, createUser, Ctx, loginAs, resetDb } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createApp(); });
afterAll(async () => { await ctx.app.close(); });

/**
 * Cenário: catálogo real (content/catalog.json). Escola A tem direito ao BASTA; escola B não.
 * profA matriculada; profA2 da mesma escola sem matrícula; profB na escola B; coordenações de A e B; admin.
 */
let A: { id: string }, B: { id: string };
let basta: { id: string }, paz: { id: string };
let ids: Record<string, string>;
let enrollProfA: string;
let lessonCap1: string, lessonP1: string;
let pdfAsset: string, videoAsset: string, welcomeAsset: string;

async function grant(institutionId: string, collectionId: string, status = 'active') {
  const admin = await loginAs(ctx, 'admin@etica.br');
  const r = await admin.put(`/admin/institutions/${institutionId}/collections/${collectionId}/access`, { status });
  expect(r.status).toBe(200);
}

beforeEach(async () => {
  await resetDb(ctx);
  await seedCatalog(ctx.prisma, loadCatalogContent());
  A = await createInstitution(ctx, 'Escola A');
  B = await createInstitution(ctx, 'Escola B');
  const u = async (email: string, inst?: string, role: 'professor' | 'coordinator' = 'professor', admin = false) =>
    (await createUser(ctx, { email, admin, memberships: inst ? [{ institutionId: inst, role }] : [] })).id;
  ids = {
    admin: await u('admin@etica.br', undefined, 'professor', true),
    coordA: await u('coord.a@a.br', A.id, 'coordinator'),
    coordB: await u('coord.b@b.br', B.id, 'coordinator'),
    profA: await u('prof.a@a.br', A.id),
    profA2: await u('prof.a2@a.br', A.id),
    profB: await u('prof.b@b.br', B.id),
  };
  basta = await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
  paz = await ctx.prisma.collection.update({ where: { slug: 'paz-nas-escolas' }, data: { status: 'published' } });

  await ctx.prisma.institutionCollectionAccess.create({ data: { institutionId: A.id, collectionId: basta.id, grantedById: ids.admin } });
  enrollProfA = (await ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: ids.profA, collectionId: basta.id } })).id;

  const lesson = (moduleSlug: string, slug: string) =>
    ctx.prisma.lesson.findFirstOrThrow({ where: { slug, module: { slug: moduleSlug, collectionId: basta.id } }, include: { media: true } });
  const cap1 = await lesson('anos-iniciais', 'anos-iniciais-1');
  lessonCap1 = cap1.id; videoAsset = cap1.mediaAssetId!;
  lessonP1 = (await lesson('conheca', 'p1')).id;
  const doc = await lesson('anos-iniciais', 'plano-de-aula');
  pdfAsset = doc.mediaAssetId!;
  welcomeAsset = (await ctx.prisma.mediaAsset.findUniqueOrThrow({ where: { key: 'platform.welcome-video' } })).id;
});

const card = async (c: Client, slug: string, q = '') => (await c.get(`/me/collections${q}`)).body.items.find((i: { slug: string }) => i.slug === slug);
const requiredLessons = () => ctx.prisma.lesson.findMany({
  where: { requiredForCompletion: true, status: 'published', module: { collectionId: basta.id, status: 'published' } },
});

describe('Catálogo e estados dos cards', () => {
  it('o catálogo vem do banco, sem links de mídia protegida', async () => {
    const c = await loginAs(ctx, 'prof.b@b.br');
    const res = await c.get('/collections');
    expect(res.status).toBe(200);
    expect(res.body.map((x: { slug: string }) => x.slug)).toContain('basta');
    expect(res.body).toHaveLength(10);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/midiasave|\/api\/v1\/media|\.pdf/);
    expect(res.body.find((x: { slug: string }) => x.slug === 'basta').coverUrl).toBe('/img/col-basta.png');
  });

  it('1/3. instituição A com acesso + professor matriculado → BASTA liberado com progresso do servidor', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    const b = await card(c, 'basta');
    expect(b).toMatchObject({ state: 'available', enrollmentId: enrollProfA, progress: { requiredTotal: 32, requiredCompleted: 0, percent: 0, status: 'not_started' } });
    expect(b.progress.next).toMatchObject({ slug: 'anos-iniciais-1', moduleSlug: 'anos-iniciais' });
    expect((await card(c, 'reforco-escolar')).state).toBe('coming_soon');
  });

  it('2. instituição B sem acesso → bloqueado', async () => {
    const c = await loginAs(ctx, 'prof.b@b.br');
    expect(await card(c, 'basta')).toMatchObject({ state: 'locked', reason: 'institution_without_access' });
  });

  it('4. professor da instituição A sem matrícula → bloqueado com orientação', async () => {
    const c = await loginAs(ctx, 'prof.a2@a.br');
    const b = await card(c, 'basta');
    expect(b).toMatchObject({ state: 'locked', reason: 'not_enrolled' });
    expect(b.message).toMatch(/coordenação/);
    expect(b.institution).toBeUndefined();
  });

  it('coordenador vê se a instituição tem direito (e pode matricular) mesmo sem estar matriculado', async () => {
    const ca = await loginAs(ctx, 'coord.a@a.br');
    expect(await card(ca, 'basta')).toMatchObject({ state: 'locked', reason: 'not_enrolled', institution: { hasAccess: true, canEnroll: true } });
    const cb = await loginAs(ctx, 'coord.b@b.br');
    expect(await card(cb, 'basta')).toMatchObject({ state: 'locked', institution: { hasAccess: false, canEnroll: false } });
  });
});

describe('Acesso direto por URL e mídias protegidas', () => {
  it('6. professor sem matrícula não abre módulos, aula nem mídia por URL direta', async () => {
    for (const email of ['prof.a2@a.br', 'prof.b@b.br']) {
      const c = await loginAs(ctx, email);
      expect((await c.get('/collections/basta/modules')).status).toBe(403);
      expect((await c.get(`/lessons/${lessonCap1}`)).status).toBe(403);
      expect((await c.get(`/media/${videoAsset}`)).status).toBe(403);
      expect((await c.get(`/media/${pdfAsset}`)).status).toBe(403);
    }
  });

  it('professor matriculado abre aula; o vídeo sai do portão por redirecionamento e o PDF é servido pela API', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    const aula = await c.get(`/lessons/${lessonCap1}`);
    expect(aula.status).toBe(200);
    expect(aula.body).toMatchObject({ slug: 'anos-iniciais-1', mediaUrl: `/api/v1/media/${videoAsset}`, provisional: true, collection: { slug: 'basta' } });
    expect(JSON.stringify(aula.body)).not.toMatch(/midiasave/);

    const video = await c.get(`/media/${videoAsset}`).redirects(0);
    expect(video.status).toBe(302);
    expect(video.headers.location).toMatch(/^https:\/\/midiasave-5c064\.web\.app\/video\d+\.mp4$/);
    expect(video.headers['cache-control']).toMatch(/no-store/);

    const pdf = await c.get(`/media/${pdfAsset}?download=1`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toMatch(/application\/pdf/);
    expect(pdf.headers['content-disposition']).toMatch(/attachment; filename="plano-de-aula-anos-iniciais.pdf"/);
  });

  it('12. mídia protegida exige sessão; vídeo de boas-vindas vale para qualquer autenticado', async () => {
    const anon = request(ctx.app.getHttpServer());
    expect((await anon.get(`${API}/media/${pdfAsset}`)).status).toBe(401);
    expect((await anon.get(`${API}/media/${welcomeAsset}`)).status).toBe(401);
    const semVinculo = await loginAs(ctx, 'prof.b@b.br');
    expect((await semVinculo.get(`/media/${welcomeAsset}`).redirects(0)).status).toBe(302);
    const w = await semVinculo.get('/platform/welcome-video');
    expect(w.body).toMatchObject({ url: `/api/v1/media/${welcomeAsset}`, posterUrl: '/img/thumbs/video1.jpg' });
  });

  it('id de mídia inexistente → 404', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.get('/media/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });

  it('administrador geral visualiza o conteúdo sem matrícula', async () => {
    const c = await loginAs(ctx, 'admin@etica.br');
    expect((await c.get('/collections/basta/modules')).status).toBe(200);
  });

  it('coordenador com direito institucional visualiza o conteúdo para acompanhar a formação', async () => {
    expect((await (await loginAs(ctx, 'coord.a@a.br')).get('/collections/basta/modules')).status).toBe(200);
    expect((await (await loginAs(ctx, 'coord.b@b.br')).get('/collections/basta/modules')).status).toBe(403);
  });
});

describe('Progresso', () => {
  it('registra conclusão híbrida e calcula o percentual no servidor', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    const r = await c.put(`/me/lessons/${lessonCap1}/progress`, { completed: true, source: 'player', watchedSeconds: 30 });
    expect(r.status).toBe(200);
    expect(r.body.lesson).toMatchObject({ status: 'completed', completionSource: 'player', watchedSeconds: 30 });
    expect(r.body.summary).toMatchObject({ requiredTotal: 32, requiredCompleted: 1, percent: 3, status: 'in_progress' });

    // Aula de apresentação não é obrigatória: não altera o percentual.
    const p = await c.put(`/me/lessons/${lessonP1}/progress`, { completed: true, liked: true });
    expect(p.body.summary.requiredCompleted).toBe(1);

    const det = await c.get(`/me/enrollments/${enrollProfA}/progress`);
    expect(det.body.modules.find((m: { slug: string }) => m.slug === 'anos-iniciais')).toMatchObject({ requiredTotal: 8, requiredCompleted: 1 });
    expect(det.body.lessons.find((l: { slug: string }) => l.slug === 'p1')).toMatchObject({ status: 'completed', liked: true, required: false });

    const desfaz = await c.put(`/me/lessons/${lessonCap1}/progress`, { completed: false });
    expect(desfaz.body.summary.requiredCompleted).toBe(0);
  });

  it('não aceita percentual do cliente e limita o tempo assistido à duração da aula', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.put(`/me/lessons/${lessonCap1}/progress`, { percent: 100 })).status).toBe(400);
    expect((await c.put(`/me/lessons/${lessonCap1}/progress`, { completed: true, requiredCompleted: 32 })).status).toBe(400);
    const r = await c.put(`/me/lessons/${lessonCap1}/progress`, { watchedSeconds: 50000 });
    const dur = (await ctx.prisma.lesson.findUniqueOrThrow({ where: { id: lessonCap1 } })).durationSeconds;
    expect(r.body.lesson.watchedSeconds).toBe(dur);
    const regride = await c.put(`/me/lessons/${lessonCap1}/progress`, { watchedSeconds: 5 });
    expect(regride.body.lesson.watchedSeconds).toBe(dur);
  });

  it('7. não registra progresso na matrícula de outra pessoa', async () => {
    const outra = (await ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: ids.profA2, collectionId: basta.id } })).id;
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.put(`/me/lessons/${lessonCap1}/progress`, { enrollmentId: outra, completed: true })).status).toBe(404);
    expect((await c.get(`/me/enrollments/${outra}/progress`)).status).toBe(404);
    expect(await ctx.prisma.lessonProgress.count({ where: { enrollmentId: outra } })).toBe(0);
  });

  it('aula de outra coleção não entra na matrícula', async () => {
    const mod = await ctx.prisma.module.create({ data: { collectionId: paz.id, slug: 'm1', title: 'M1', status: 'published' } });
    const alheia = await ctx.prisma.lesson.create({ data: { moduleId: mod.id, slug: 'a1', title: 'A1', status: 'published' } });
    const c = await loginAs(ctx, 'prof.a@a.br');
    const r = await c.put(`/me/lessons/${alheia.id}/progress`, { enrollmentId: enrollProfA, completed: true });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('LESSON_NOT_IN_ENROLLMENT');
    expect((await c.put(`/me/lessons/${alheia.id}/progress`, { completed: true })).status).toBe(403);
  });

  it('professor sem matrícula não registra progresso', async () => {
    const c = await loginAs(ctx, 'prof.a2@a.br');
    expect((await c.put(`/me/lessons/${lessonCap1}/progress`, { completed: true })).status).toBe(403);
  });

  it('aula não publicada não aceita progresso', async () => {
    await ctx.prisma.lesson.update({ where: { id: lessonCap1 }, data: { status: 'draft' } });
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.put(`/me/lessons/${lessonCap1}/progress`, { completed: true })).status).toBe(404);
    expect((await c.get(`/me/enrollments/${enrollProfA}/progress`)).body.summary.requiredTotal).toBe(31);
  });
});

describe('Coordenação', () => {
  it('5. coordenador não libera coleção não contratada, nem matricula nela', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    expect((await c.put(`/admin/institutions/${A.id}/collections/${paz.id}/access`, { status: 'active' })).status).toBe(403);
    const e = await c.post(`/institutions/${A.id}/enrollments`, { userId: ids.profA2, collectionId: paz.id });
    expect(e.status).toBe(403);
    expect(e.body.code).toBe('INSTITUTION_WITHOUT_ACCESS');
    expect(await ctx.prisma.institutionCollectionAccess.count({ where: { collectionId: paz.id } })).toBe(0);

    const pedido = await c.post(`/institutions/${A.id}/collections/${paz.id}/access-requests`, { message: 'Queremos usar no 2º semestre.' });
    expect(pedido.status).toBe(202);
    await c.post(`/institutions/${A.id}/collections/${paz.id}/access-requests`, {});
    expect(await ctx.prisma.auditLog.count({ where: { action: 'collection_access.requested' } })).toBe(1);
    expect(await ctx.prisma.institutionCollectionAccess.count({ where: { collectionId: paz.id } })).toBe(0);
  });

  it('matricula professor da própria escola em coleção autorizada; duplicidade e não-membro são recusados', async () => {
    const c = await loginAs(ctx, 'coord.a@a.br');
    const r = await c.post(`/institutions/${A.id}/enrollments`, { userId: ids.profA2, collectionId: basta.id });
    expect(r.status).toBe(201);
    expect((await c.post(`/institutions/${A.id}/enrollments`, { userId: ids.profA2, collectionId: basta.id })).status).toBe(409);
    expect((await c.post(`/institutions/${A.id}/enrollments`, { userId: ids.profB, collectionId: basta.id })).status).toBe(400);
    expect((await c.post(`/institutions/${A.id}/enrollments`, { userId: ids.profA2, collectionId: basta.id, institutionId: B.id })).status).toBe(400);
    expect((await card(await loginAs(ctx, 'prof.a2@a.br'), 'basta')).state).toBe('available');
  });

  it('o banco impede matrícula de quem não é membro da instituição (FK composta)', async () => {
    await expect(ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: ids.profB, collectionId: basta.id } }))
      .rejects.toMatchObject({ code: 'P2003' });
  });

  it('8. coordenador não altera nem consulta matrícula de outra instituição', async () => {
    await grant(B.id, basta.id);
    const enrB = (await ctx.prisma.enrollment.create({ data: { institutionId: B.id, userId: ids.profB, collectionId: basta.id } })).id;
    const c = await loginAs(ctx, 'coord.a@a.br');
    expect((await c.patch(`/institutions/${B.id}/enrollments/${enrB}`, { status: 'revoked' })).status).toBe(403);
    expect((await c.patch(`/institutions/${A.id}/enrollments/${enrB}`, { status: 'revoked' })).status).toBe(404);
    expect((await c.get(`/institutions/${B.id}/collections/${basta.id}/enrollments`)).status).toBe(403);
    expect((await c.get(`/institutions/${A.id}/enrollments/${enrB}/progress`)).status).toBe(404);
    expect((await c.post(`/institutions/${B.id}/enrollments`, { userId: ids.profB, collectionId: basta.id })).status).toBe(403);
    expect((await ctx.prisma.enrollment.findUniqueOrThrow({ where: { id: enrB } })).status).toBe('active');
  });

  it('professor não acessa recursos de coordenação', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.get(`/institutions/${A.id}/collections`)).status).toBe(403);
    expect((await c.post(`/institutions/${A.id}/enrollments`, { userId: ids.profA2, collectionId: basta.id })).status).toBe(403);
    expect((await c.get('/admin/collections')).status).toBe(403);
  });

  it('consulta progresso consolidado e individual com aulas pendentes', async () => {
    const prof = await loginAs(ctx, 'prof.a@a.br');
    await prof.put(`/me/lessons/${lessonCap1}/progress`, { completed: true });
    const c = await loginAs(ctx, 'coord.a@a.br');

    const cols = await c.get(`/institutions/${A.id}/collections`);
    expect(cols.body.items.find((i: { slug: string }) => i.slug === 'basta')).toMatchObject({ institutionAccess: { state: 'active' }, enrollments: { active: 1, completed: 0 } });
    expect(cols.body.items.find((i: { slug: string }) => i.slug === 'paz-nas-escolas').institutionAccess.state).toBe('none');

    const list = await c.get(`/institutions/${A.id}/collections/${basta.id}/enrollments`);
    expect(list.body.items[0]).toMatchObject({ user: { email: 'prof.a@a.br' }, progress: { requiredCompleted: 1, pending: 31 } });
    expect(list.body.consolidated).toEqual({ activeEnrollments: 1, completed: 0, averagePercent: 3 });

    const ind = await c.get(`/institutions/${A.id}/enrollments/${enrollProfA}/progress`);
    expect(ind.body.pendingLessons).toHaveLength(31);
    expect(ind.body.pendingLessons.map((l: { slug: string }) => l.slug)).not.toContain('anos-iniciais-1');
  });
});

describe('Revogação e despublicação', () => {
  it('11. matrícula revogada bloqueia acesso e progresso (o histórico é mantido)', async () => {
    const prof = await loginAs(ctx, 'prof.a@a.br');
    await prof.put(`/me/lessons/${lessonCap1}/progress`, { completed: true });
    const c = await loginAs(ctx, 'coord.a@a.br');
    expect((await c.patch(`/institutions/${A.id}/enrollments/${enrollProfA}`, { status: 'revoked' })).status).toBe(200);

    expect(await card(prof, 'basta')).toMatchObject({ state: 'locked', reason: 'enrollment_revoked' });
    expect((await prof.get(`/lessons/${lessonCap1}`)).status).toBe(403);
    expect((await prof.put(`/me/lessons/${lessonCap1}/progress`, { completed: false })).status).toBe(403);
    expect(await ctx.prisma.lessonProgress.count({ where: { enrollmentId: enrollProfA } })).toBe(1);

    expect((await c.patch(`/institutions/${A.id}/enrollments/${enrollProfA}`, { status: 'active' })).status).toBe(200);
    expect((await card(prof, 'basta')).progress.requiredCompleted).toBe(1);
  });

  it('9a. direito institucional revogado/suspenso/expirado bloqueia toda a instituição', async () => {
    const prof = await loginAs(ctx, 'prof.a@a.br');
    await grant(A.id, basta.id, 'suspended');
    expect(await card(prof, 'basta')).toMatchObject({ state: 'locked', reason: 'access_suspended' });
    await grant(A.id, basta.id, 'revoked');
    expect(await card(prof, 'basta')).toMatchObject({ state: 'locked', reason: 'access_revoked' });
    expect((await prof.get(`/media/${pdfAsset}`)).status).toBe(403);

    await grant(A.id, basta.id, 'active');
    await ctx.prisma.institutionCollectionAccess.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await card(prof, 'basta')).toMatchObject({ state: 'locked', reason: 'access_expired' });
    const coord = await loginAs(ctx, 'coord.a@a.br');
    expect((await coord.post(`/institutions/${A.id}/enrollments`, { userId: ids.profA2, collectionId: basta.id })).status).toBe(403);
  });

  it('9b. coleção despublicada vira "em breve" e o conteúdo some, inclusive para quem estava matriculado', async () => {
    const admin = await loginAs(ctx, 'admin@etica.br');
    expect((await admin.patch(`/admin/collections/${basta.id}`, { status: 'draft' })).status).toBe(200);
    const prof = await loginAs(ctx, 'prof.a@a.br');
    expect((await card(prof, 'basta')).state).toBe('coming_soon');
    expect((await prof.get('/collections/basta/modules')).status).toBe(403);
    expect((await prof.get(`/media/${videoAsset}`)).status).toBe(403);
    expect((await admin.put(`/admin/institutions/${B.id}/collections/${basta.id}/access`, { status: 'active' })).status).toBe(400);

    await admin.patch(`/admin/collections/${basta.id}`, { status: 'archived' });
    expect(await card(prof, 'basta')).toBeUndefined();
    expect((await prof.get('/collections/basta')).status).toBe(404);
  });

  it('vínculo institucional desativado remove o acesso mesmo com matrícula ativa', async () => {
    const prof = await loginAs(ctx, 'prof.a@a.br');
    await ctx.prisma.membership.updateMany({ where: { userId: ids.profA }, data: { status: 'inactive' } });
    expect((await prof.get('/collections/basta/modules')).status).toBe(403);
    expect((await prof.put(`/me/lessons/${lessonCap1}/progress`, { completed: true })).status).toBe(403);
  });
});

describe('Certificado', () => {
  it('10. só é emitido quando a regra de conclusão é satisfeita no servidor', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    const antes = await c.post(`/me/enrollments/${enrollProfA}/certificate`);
    expect(antes.status).toBe(409);
    expect(antes.body.message).toMatch(/faltam 32/);

    for (const l of await requiredLessons()) {
      expect((await c.put(`/me/lessons/${l.id}/progress`, { completed: true })).status).toBe(200);
    }
    expect((await card(c, 'basta')).progress).toMatchObject({ percent: 100, status: 'completed' });
    expect((await ctx.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollProfA } })).completedAt).not.toBeNull();

    const cert = await c.post(`/me/enrollments/${enrollProfA}/certificate`);
    expect(cert.status).toBe(200);
    expect(cert.body).toMatchObject({ valid: true, collectionSlug: 'basta', institutionName: 'Escola A', requiredLessons: 32 });
    expect(cert.body.verificationCode).toMatch(/^FP-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);

    const de_novo = await c.post(`/me/enrollments/${enrollProfA}/certificate`);
    expect(de_novo.body.id).toBe(cert.body.id);
    expect((await c.get('/me/certificates')).body.items).toHaveLength(1);
    expect((await c.get(`/me/certificates/${cert.body.id}`)).status).toBe(200);

    const pub = await request(ctx.app.getHttpServer()).get(`${API}/certificates/verify/${cert.body.verificationCode.toLowerCase()}`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ valid: true, collectionTitle: 'BASTA! De violência contra a mulher' });
    expect(JSON.stringify(pub.body)).not.toMatch(/prof\.a@a\.br|enrollmentId/);
  });

  it('certificado de outra pessoa não é visível', async () => {
    const outra = (await ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: ids.profA2, collectionId: basta.id } })).id;
    const cert = await ctx.prisma.certificate.create({ data: { enrollmentId: outra, verificationCode: 'FP-TEST-0001', metadata: {} } });
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.get(`/me/certificates/${cert.id}`)).status).toBe(404);
    expect((await c.post(`/me/enrollments/${outra}/certificate`)).status).toBe(404);
  });

  it('sem acesso efetivo não emite, mesmo com todas as aulas concluídas', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    for (const l of await requiredLessons()) await c.put(`/me/lessons/${l.id}/progress`, { completed: true });
    await grant(A.id, basta.id, 'revoked');
    expect((await c.post(`/me/enrollments/${enrollProfA}/certificate`)).status).toBe(403);
  });
});

describe('Feedback e contexto institucional', () => {
  it('feedback exige matrícula própria com acesso e notas de 1 a 5', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    expect((await c.post(`/me/enrollments/${enrollProfA}/feedback`, { experience: 5, usefulness: 4, navigation: 5, comment: 'Ótimo' })).status).toBe(201);
    expect((await c.post(`/me/enrollments/${enrollProfA}/feedback`, { experience: 9, usefulness: 4, navigation: 5 })).status).toBe(400);
    const outro = await loginAs(ctx, 'prof.a2@a.br');
    expect((await outro.post(`/me/enrollments/${enrollProfA}/feedback`, { experience: 1, usefulness: 1, navigation: 1 })).status).toBe(404);
  });

  it('com vínculos em duas instituições, o contexto ativo é obrigatório e validado', async () => {
    await ctx.prisma.membership.create({ data: { userId: ids.profA, institutionId: B.id, role: 'professor' } });
    const c = await loginAs(ctx, 'prof.a@a.br');
    const sem = await c.get('/me/collections');
    expect(sem.status).toBe(400);
    expect(sem.body.code).toBe('INSTITUTION_CONTEXT_REQUIRED');
    expect((await card(c, 'basta', `?institutionId=${A.id}`)).state).toBe('available');
    expect((await card(c, 'basta', `?institutionId=${B.id}`)).state).toBe('locked');
    const C = await createInstitution(ctx, 'Escola C');
    expect((await c.get(`/me/collections?institutionId=${C.id}`)).status).toBe(403);
    expect((await c.put(`/me/lessons/${lessonCap1}/progress?institutionId=${B.id}`, { completed: true })).status).toBe(403);
    expect((await c.put(`/me/lessons/${lessonCap1}/progress?institutionId=${A.id}`, { completed: true })).status).toBe(200);
  });
});

describe('Seed de conteúdo', () => {
  it('é idempotente e não sobrescreve edições sem --update', async () => {
    await ctx.prisma.collection.update({ where: { slug: 'basta' }, data: { title: 'Título editado' } });
    const antes = await ctx.prisma.lesson.count();
    await seedCatalog(ctx.prisma, loadCatalogContent());
    expect(await ctx.prisma.lesson.count()).toBe(antes);
    expect((await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } })).title).toBe('Título editado');
    await seedCatalog(ctx.prisma, loadCatalogContent(), { update: true });
    expect((await ctx.prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } })).title).toBe('BASTA! De violência contra a mulher');
  });

  it('marca como provisórios os capítulos que reaproveitam vídeos', async () => {
    const c = await loginAs(ctx, 'prof.a@a.br');
    const mods = (await c.get('/collections/basta/modules')).body;
    const conheca = mods.find((m: { slug: string }) => m.slug === 'conheca');
    const iniciais = mods.find((m: { slug: string }) => m.slug === 'anos-iniciais');
    expect(conheca.lessons.every((l: { provisional: boolean }) => !l.provisional)).toBe(true);
    expect(iniciais.lessons.every((l: { provisional: boolean }) => l.provisional)).toBe(true);
    expect(mods.map((m: { slug: string }) => m.slug)).toEqual(['conheca', 'anos-iniciais', 'anos-finais', 'ensino-medio', 'eja']);
  });
});
