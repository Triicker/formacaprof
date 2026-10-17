import request from 'supertest';
import { API, client, Client, createApp, createInstitution, createUser, Ctx, loginAs, resetDb, tokenFromMail } from './helpers';

let ctx: Ctx;
beforeAll(async () => { ctx = await createApp(); });
afterAll(async () => { await ctx.app.close(); });
beforeEach(async () => { await resetDb(ctx); });

const CONFIRMA = { confirmImpact: true, justification: 'Decisão administrativa registrada' };

describe('Fluxo completo da plataforma (itens 1–17)', () => {
  it('administração → coordenação → professor, do convite ao certificado, com revogação e edição de curso', async () => {
    await createUser(ctx, { email: 'admin@etica.br', admin: true });
    const admin = await loginAs(ctx, 'admin@etica.br');

    // 1. instituição  2. convite de coordenação  3. aceite
    const escola = (await admin.post('/institutions', { name: 'EM Fluxo Completo', city: 'Salvador', state: 'BA' })).body;
    await admin.post(`/institutions/${escola.id}/invitations`, { email: 'coord@fluxo.br', role: 'coordinator' });
    const coord = client(ctx);
    expect((await coord.post('/invitations/accept', { token: tokenFromMail(ctx, 'coord@fluxo.br'), name: 'Coordenação Fluxo', password: 'senha-coord-1' })).status).toBe(200);

    // 4. coordenação convida professor  5. professor cria a conta
    await coord.post(`/institutions/${escola.id}/invitations`, { email: 'prof@fluxo.br', role: 'professor' });
    const prof = client(ctx);
    const aceite = await prof.post('/invitations/accept', { token: tokenFromMail(ctx, 'prof@fluxo.br'), name: 'Professora Fluxo', password: 'senha-prof-1' });
    expect(aceite.status).toBe(200);
    const profId = aceite.body.id;

    // 6. administração cria e publica a coleção (2 aulas obrigatórias)
    const video = (await admin.post('/admin/media/external', { externalUrl: 'https://midiasave-5c064.web.app/video2.mp4', mimeType: 'video/mp4', title: 'V2' })).body;
    const col = (await admin.post('/admin/collections', { title: 'Coleção Fluxo', layout: 'basta' })).body;
    const mod = (await admin.post(`/admin/collections/${col.id}/modules`, { title: 'Único', status: 'published' })).body;
    const l1 = (await admin.post(`/admin/modules/${mod.id}/lessons`, { title: 'Aula A', lessonType: 'video', mediaAssetId: video.id, durationSeconds: 60, status: 'published' })).body;
    const l2 = (await admin.post(`/admin/modules/${mod.id}/lessons`, { title: 'Aula B', lessonType: 'video', mediaAssetId: video.id, durationSeconds: 60, status: 'published' })).body;
    expect((await admin.patch(`/admin/collections/${col.id}`, { status: 'published' })).status).toBe(200);

    // 7. libera para a instituição  8. coordenação matricula
    expect((await admin.put(`/admin/institutions/${escola.id}/collections/${col.id}/access`, { status: 'active' })).status).toBe(200);
    const matricula = await coord.post(`/institutions/${escola.id}/enrollments`, { userId: profId, collectionId: col.id });
    expect(matricula.status).toBe(201);

    // 9. professor acessa  10. conclui e recebe certificado
    expect((await prof.get(`/lessons/${l1.id}`)).status).toBe(200);
    for (const l of [l1, l2]) expect((await prof.put(`/me/lessons/${l.id}/progress`, { completed: true, source: 'player' })).status).toBe(200);
    const cert = await prof.post(`/me/enrollments/${matricula.body.id}/certificate`);
    expect(cert.status).toBe(200);

    // 11. coordenação consulta progresso
    const dash = (await coord.get(`/institutions/${escola.id}/dashboard`)).body;
    expect(dash).toMatchObject({ activeProfessors: 1, collectionsWithAccess: 1, enrolledTeachers: 1, completed: 1, certificates: 1 });
    expect(dash.completionByCollection[0]).toMatchObject({ completionRate: 100 });
    const profs = (await coord.get(`/institutions/${escola.id}/teachers`)).body;
    const p = profs.items.find((t: { user: { email: string } }) => t.user.email === 'prof@fluxo.br');
    expect(p.enrollments[0]).toMatchObject({ collection: 'Coleção Fluxo', progress: { percent: 100 }, certificate: cert.body.verificationCode });

    // 12. administração consulta relatório global
    const rel = (await admin.get(`/admin/reports/enrollments?collectionId=${col.id}&completion=completed`)).body;
    expect(rel.items).toEqual([expect.objectContaining({ user: expect.objectContaining({ email: 'prof@fluxo.br' }), progress: { requiredTotal: 2, requiredCompleted: 2, percent: 100 } })]);

    // 13. revoga o acesso  14. professor perde o conteúdo, sem perder histórico
    expect((await admin.put(`/admin/institutions/${escola.id}/collections/${col.id}/access`, { status: 'revoked' })).status).toBe(409);
    expect((await admin.put(`/admin/institutions/${escola.id}/collections/${col.id}/access`, { status: 'revoked', ...CONFIRMA })).status).toBe(200);
    expect((await prof.get(`/lessons/${l1.id}`)).status).toBe(403);
    expect((await prof.get(`/me/enrollments/${matricula.body.id}/progress`)).body).toMatchObject({ accessible: false, summary: { requiredCompleted: 2 } });
    expect((await request(ctx.app.getHttpServer()).get(`${API}/certificates/verify/${cert.body.verificationCode}`)).body.valid).toBe(true);

    // 15. coordenação de outra instituição  16. usuário comum em rota administrativa
    const outra = await createInstitution(ctx, 'Outra Escola');
    await createUser(ctx, { email: 'coord.outra@x.br', memberships: [{ institutionId: outra.id, role: 'coordinator' }] });
    const coordOutra = await loginAs(ctx, 'coord.outra@x.br');
    for (const url of [`/institutions/${escola.id}/dashboard`, `/institutions/${escola.id}/teachers`, `/institutions/${escola.id}/reports/enrollments`]) {
      expect((await coordOutra.get(url)).status).toBe(403);
    }
    for (const url of ['/admin/reports/enrollments', '/admin/dashboard', `/admin/enrollments/${matricula.body.id}`]) {
      expect((await prof.get(url)).status).toBe(403);
      expect((await coord.get(url)).status).toBe(403);
    }

    // 17. edição do curso: reativa o acesso e acrescenta aula obrigatória (confirmação), certificado segue válido
    await admin.put(`/admin/institutions/${escola.id}/collections/${col.id}/access`, { status: 'active' });
    expect((await admin.post(`/admin/modules/${mod.id}/lessons`, { title: 'Aula C', lessonType: 'video', mediaAssetId: video.id, status: 'published' })).status).toBe(409);
    expect((await admin.post(`/admin/modules/${mod.id}/lessons`, { title: 'Aula C', lessonType: 'video', mediaAssetId: video.id, status: 'published', ...CONFIRMA })).status).toBe(201);
    expect((await prof.get(`/me/certificates/${cert.body.id}`)).body).toMatchObject({ valid: true, requiredLessons: 2 });
  });
});

describe('Relatórios: escopo, filtros e exportação', () => {
  let A: { id: string }, B: { id: string }, colId: string;
  let admin: Client;
  beforeEach(async () => {
    A = await createInstitution(ctx, 'Escola A');
    B = await createInstitution(ctx, 'Escola B');
    await createUser(ctx, { email: 'admin@etica.br', admin: true });
    await createUser(ctx, { email: 'coord@a.br', memberships: [{ institutionId: A.id, role: 'coordinator' }] });
    const pa = await createUser(ctx, { email: 'pa@a.br', name: '=HYPERLINK("http://x")', memberships: [{ institutionId: A.id, role: 'professor' }] });
    const pb = await createUser(ctx, { email: 'pb@b.br', memberships: [{ institutionId: B.id, role: 'professor' }] });
    const col = await ctx.prisma.collection.create({ data: { slug: 'rel', title: 'Relatórios', status: 'published' } });
    colId = col.id;
    const mod = await ctx.prisma.module.create({ data: { collectionId: col.id, slug: 'm', title: 'M', status: 'published' } });
    await ctx.prisma.lesson.create({ data: { moduleId: mod.id, slug: 'a', title: 'A', status: 'published' } });
    for (const [inst, user] of [[A.id, pa.id], [B.id, pb.id]]) {
      await ctx.prisma.institutionCollectionAccess.create({ data: { institutionId: inst, collectionId: col.id } });
      await ctx.prisma.enrollment.create({ data: { institutionId: inst, userId: user, collectionId: col.id } });
    }
    admin = await loginAs(ctx, 'admin@etica.br');
  });

  it('coordenação só enxerga a própria instituição, nem tentando filtrar outra', async () => {
    const coord = await loginAs(ctx, 'coord@a.br');
    const r = await coord.get(`/institutions/${A.id}/reports/enrollments`);
    expect(r.body.items.map((i: { user: { email: string } }) => i.user.email)).toEqual(['pa@a.br']);
    expect((await coord.get(`/institutions/${A.id}/reports/enrollments?institutionId=${B.id}`)).status).toBe(400);
    expect((await coord.get(`/institutions/${B.id}/reports/enrollments`)).status).toBe(403);
    expect((await coord.get(`/institutions/${A.id}/reports/certificates`)).body.total).toBe(0);
    const glob = await admin.get(`/admin/reports/enrollments?institutionId=${B.id}`);
    expect(glob.body.items.map((i: { user: { email: string } }) => i.user.email)).toEqual(['pb@b.br']);
    expect((await admin.get('/admin/reports/enrollments?pageSize=1')).body).toMatchObject({ total: 2, pages: 2 });
    expect((await admin.get('/admin/reports/enrollments?completion=not_started')).body.total).toBe(2);
  });

  it('CSV com BOM, neutralização de fórmulas e auditoria da exportação', async () => {
    const coord = await loginAs(ctx, 'coord@a.br');
    const r = await coord.agent.get(`${API}/institutions/${A.id}/reports/enrollments?format=csv`).buffer(true).parse((res, cb) => {
      let d = ''; res.on('data', (c: Buffer) => { d += c.toString('utf8'); }); res.on('end', () => cb(null, d));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="matriculas-/);
    const csv = r.body as string;
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv).not.toContain('pb@b.br');
    // Padrão do Excel em português: ponto e vírgula e datas dd/mm/aaaa hh:mm (horário de Brasília).
    expect(csv.split('\r\n')[0]).toBe('﻿Nome;E-mail;Instituição;Coleção;Situação da matrícula;Matriculado em;Concluído em;Aulas concluídas;Aulas obrigatórias;Percentual;Certificado');
    expect(csv).toMatch(/"\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}"/);
    expect(csv).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'report.exported', institutionId: A.id } })).toBe(1);
  });

  it('participação por mês conta matrículas do período', async () => {
    const r = await admin.get(`/admin/reports/participation?collectionId=${colId}`);
    expect(r.status).toBe(200);
    expect(r.body.months.at(-1)).toMatchObject({ enrollments: 2 });
  });
});

describe('Correções administrativas e auditoria imutável', () => {
  it('correção de progresso exige justificativa, registra antes/depois; certificado revogado fica inválido', async () => {
    const A = await createInstitution(ctx, 'Escola A');
    const adminU = await createUser(ctx, { email: 'admin@etica.br', admin: true });
    const pu = await createUser(ctx, { email: 'p@a.br', memberships: [{ institutionId: A.id, role: 'professor' }] });
    const col = await ctx.prisma.collection.create({ data: { slug: 'c', title: 'C', status: 'published' } });
    const mod = await ctx.prisma.module.create({ data: { collectionId: col.id, slug: 'm', title: 'M', status: 'published' } });
    const aula = await ctx.prisma.lesson.create({ data: { moduleId: mod.id, slug: 'a', title: 'Aula única', status: 'published' } });
    await ctx.prisma.institutionCollectionAccess.create({ data: { institutionId: A.id, collectionId: col.id } });
    const e = await ctx.prisma.enrollment.create({ data: { institutionId: A.id, userId: pu.id, collectionId: col.id } });
    const admin = await loginAs(ctx, 'admin@etica.br');
    const prof = await loginAs(ctx, 'p@a.br');

    expect((await admin.post(`/admin/enrollments/${e.id}/progress-corrections`, { lessonId: aula.id, completed: true })).status).toBe(400);
    expect((await admin.post(`/admin/enrollments/${e.id}/progress-corrections`, { lessonId: aula.id, completed: true, justification: 'curta' })).status).toBe(400);
    expect((await admin.post(`/admin/enrollments/${e.id}/progress-corrections`, { lessonId: aula.id, percent: 100, justification: 'Tentativa de editar percentual' })).status).toBe(400);
    expect((await prof.post(`/admin/enrollments/${e.id}/progress-corrections`, { lessonId: aula.id, completed: true, justification: 'Professor tentando se aprovar' })).status).toBe(403);

    const c = await admin.post(`/admin/enrollments/${e.id}/progress-corrections`, { lessonId: aula.id, completed: true, justification: 'Aula presencial comprovada em ata' });
    expect(c.status).toBe(201);
    expect(c.body.summary).toMatchObject({ status: 'completed', percent: 100 });
    const pr = await ctx.prisma.lessonProgress.findFirstOrThrow({ where: { enrollmentId: e.id } });
    expect(pr.completionSource).toBe('admin_correction');
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'progress.corrected' } });
    expect(log).toMatchObject({ actorUserId: adminU.id, metadata: { from: null, to: { status: 'completed', source: 'admin_correction' }, justification: 'Aula presencial comprovada em ata' } });

    const cert = (await prof.post(`/me/enrollments/${e.id}/certificate`)).body;
    expect((await admin.post(`/admin/certificates/${cert.id}/revoke`, { justification: 'Emitido por engano' })).status).toBe(200);
    expect((await request(ctx.app.getHttpServer()).get(`${API}/certificates/verify/${cert.verificationCode}`)).body.valid).toBe(false);
    const hist = (await admin.get(`/admin/enrollments/${e.id}`)).body;
    expect(hist.history.map((h: { action: string }) => h.action)).toEqual(expect.arrayContaining(['progress.corrected', 'certificate.issued', 'certificate.revoked']));
    expect(hist.lessons[0]).toMatchObject({ status: 'completed', completionSource: 'admin_correction' });
  });

  it('registros de auditoria não podem ser alterados nem apagados (gatilho no banco)', async () => {
    const log = await ctx.prisma.auditLog.create({ data: { action: 'teste', entityType: 'x' } });
    await expect(ctx.prisma.auditLog.update({ where: { id: log.id }, data: { action: 'adulterado' } })).rejects.toThrow(/somente inclusão/);
    await expect(ctx.prisma.auditLog.delete({ where: { id: log.id } })).rejects.toThrow(/somente inclusão/);
    expect((await ctx.prisma.auditLog.findUniqueOrThrow({ where: { id: log.id } })).action).toBe('teste');
  });
});
