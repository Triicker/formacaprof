import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompletionSource, ContentStatus, LessonProgressStatus, MembershipRole, Prisma } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { presentCollection } from '../catalog/catalog.service';
import { MEDIA_REF_SELECT } from '../catalog/media-url';
import type { Actor } from '../common/actor';
import { DENIAL_MESSAGES, EntitlementsService } from '../entitlements/entitlements.service';
import { ProgressService } from '../entitlements/progress.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeedbackDto, UpdateLessonProgressDto } from './learning.dto';

const COLLECTION_SELECT = {
  id: true, slug: true, title: true, subtitle: true, description: true, status: true, displayOrder: true, themeConfig: true,
  cover: { select: MEDIA_REF_SELECT }, thumbnail: { select: MEDIA_REF_SELECT },
} satisfies Prisma.CollectionSelect;

// Código de verificação legível (sem 0/O/1/I): FP-XXXX-XXXX.
const ALFABETO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const novoCodigo = () => {
  const bloco = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return `FP-${bloco()}-${bloco()}`;
};

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly progress: ProgressService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Estado efetivo de cada card, calculado aqui (o frontend só exibe):
   * coming_soon (não publicada) · locked (publicada sem acesso efetivo) · available (todas as condições atendidas).
   */
  async myCollections(actor: Actor, institutionId?: string) {
    const ctx = this.entitlements.resolveContext(actor, institutionId);
    const isCoordinator = !!ctx && actor.memberships.some((m) => m.institutionId === ctx && m.role === MembershipRole.coordinator);
    const collections = await this.prisma.collection.findMany({
      where: { status: { not: ContentStatus.archived } },
      select: COLLECTION_SELECT,
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });

    const items = [];
    for (const c of collections) {
      const base = presentCollection(c);
      if (c.status !== ContentStatus.published) {
        items.push({ ...base, state: 'coming_soon' as const, reason: 'collection_unavailable' });
        continue;
      }
      const r = await this.entitlements.learnerAccess(actor.userId, ctx, c);
      const institution = isCoordinator
        ? { hasAccess: r.institutionAccess === 'active', canEnroll: r.institutionAccess === 'active' }
        : undefined;
      if (!r.ok) {
        items.push({ ...base, state: 'locked' as const, reason: r.reason, message: DENIAL_MESSAGES[r.reason], institution });
        continue;
      }
      const summary = await this.progress.summary(r.enrollment);
      items.push({ ...base, state: 'available' as const, enrollmentId: r.enrollment.id, progress: summary, institution });
    }
    return { institutionId: ctx, items };
  }

  async myEnrollments(actor: Actor, institutionId?: string) {
    const ctx = institutionId ? (this.entitlements.resolveContext(actor, institutionId) ?? undefined) : undefined;
    const rows = await this.prisma.enrollment.findMany({
      where: { userId: actor.userId, institutionId: ctx },
      include: { collection: { select: COLLECTION_SELECT }, membership: { select: { institution: { select: { id: true, name: true } } } } },
      orderBy: { enrolledAt: 'asc' },
    });
    const items = [];
    for (const e of rows) {
      const access = await this.entitlements.learnerAccess(actor.userId, e.institutionId, e.collection);
      items.push({
        id: e.id, status: e.status, enrolledAt: e.enrolledAt, completedAt: e.completedAt,
        institution: e.membership.institution, collection: presentCollection(e.collection),
        accessible: access.ok, reason: access.ok ? null : access.reason,
        progress: await this.progress.summary(e),
      });
    }
    return { items };
  }

  /** Matrícula do próprio usuário; de outra pessoa → 404 (não revela que existe). */
  private async ownEnrollment(actor: Actor, enrollmentId: string) {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: { collection: { select: { id: true, slug: true, title: true, status: true } } } });
    if (!e || e.userId !== actor.userId) throw new NotFoundException('Matrícula não encontrada.');
    return e;
  }

  async enrollmentProgress(actor: Actor, enrollmentId: string) {
    const e = await this.ownEnrollment(actor, enrollmentId);
    const access = await this.entitlements.learnerAccess(actor.userId, e.institutionId, e.collection);
    const detail = await this.progress.detail(e);
    return {
      enrollment: { id: e.id, status: e.status, institutionId: e.institutionId, enrolledAt: e.enrolledAt, completedAt: e.completedAt },
      collection: { id: e.collection.id, slug: e.collection.slug, title: e.collection.title },
      accessible: access.ok, reason: access.ok ? null : access.reason,
      ...detail,
    };
  }

  async updateLessonProgress(actor: Actor, lessonId: string, dto: UpdateLessonProgressDto, institutionId?: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { status: true, collectionId: true, collection: { select: { id: true, status: true } } } } },
    });
    if (!lesson || lesson.status !== ContentStatus.published || lesson.module.status !== ContentStatus.published) {
      throw new NotFoundException('Aula não encontrada.');
    }

    // Matrícula: a informada (precisa ser do próprio usuário E da coleção da aula) ou a do contexto ativo.
    let enrollment;
    if (dto.enrollmentId) {
      const e = await this.ownEnrollment(actor, dto.enrollmentId);
      if (e.collectionId !== lesson.module.collectionId) {
        throw new ForbiddenException({ statusCode: 403, code: 'LESSON_NOT_IN_ENROLLMENT', message: 'Esta aula não pertence à coleção da matrícula.' });
      }
      enrollment = await this.entitlements.assertLearnerAccess(actor.userId, e.institutionId, lesson.module.collection);
    } else {
      const ctx = this.entitlements.resolveContext(actor, institutionId);
      enrollment = await this.entitlements.assertLearnerAccess(actor.userId, ctx, lesson.module.collection);
    }

    const existing = await this.prisma.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } } });
    const data: Prisma.LessonProgressUncheckedUpdateInput = {};
    if (dto.watchedSeconds !== undefined) {
      // Nunca acima da duração conhecida e nunca regride.
      const limite = lesson.durationSeconds ?? dto.watchedSeconds;
      data.watchedSeconds = Math.max(existing?.watchedSeconds ?? 0, Math.min(dto.watchedSeconds, limite));
    }
    if (dto.liked !== undefined) data.liked = dto.liked;
    if (dto.completed === true && existing?.status !== LessonProgressStatus.completed) {
      data.status = LessonProgressStatus.completed;
      data.completedAt = new Date();
      data.completionSource = dto.source ?? CompletionSource.manual;
    } else if (dto.completed === false) {
      data.status = LessonProgressStatus.in_progress;
      data.completedAt = null;
      data.completionSource = null;
    }

    const row = await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      create: {
        enrollmentId: enrollment.id, lessonId,
        status: (data.status as LessonProgressStatus) ?? LessonProgressStatus.in_progress,
        completedAt: (data.completedAt as Date | null | undefined) ?? null,
        completionSource: (data.completionSource as CompletionSource | null | undefined) ?? null,
        watchedSeconds: (data.watchedSeconds as number | undefined) ?? 0,
        liked: (data.liked as boolean | undefined) ?? false,
      },
      update: data,
    });
    const summary = await this.progress.syncCompletion(enrollment);
    return {
      lesson: { lessonId, status: row.status, completedAt: row.completedAt, watchedSeconds: row.watchedSeconds, liked: row.liked, completionSource: row.completionSource },
      enrollmentId: enrollment.id,
      summary,
    };
  }

  async submitFeedback(actor: Actor, enrollmentId: string, dto: FeedbackDto) {
    const e = await this.ownEnrollment(actor, enrollmentId);
    await this.entitlements.assertLearnerAccess(actor.userId, e.institutionId, e.collection);
    // Uma avaliação por matrícula: um novo envio substitui a anterior (sem duplicar nos relatórios).
    const dados = { experience: dto.experience, usefulness: dto.usefulness, navigation: dto.navigation, comment: dto.comment?.trim() || null };
    const atual = await this.prisma.feedback.findFirst({ where: { enrollmentId: e.id }, orderBy: { createdAt: 'desc' }, select: { id: true } });
    const f = atual
      ? await this.prisma.feedback.update({ where: { id: atual.id }, data: dados })
      : await this.prisma.feedback.create({ data: { enrollmentId: e.id, ...dados } });
    return { id: f.id, createdAt: f.createdAt, updated: !!atual };
  }

  /** Avaliação já enviada nesta matrícula (para a tela abrir preenchida), ou null. */
  async myFeedback(actor: Actor, enrollmentId: string) {
    const e = await this.ownEnrollment(actor, enrollmentId);
    return this.prisma.feedback.findFirst({
      where: { enrollmentId: e.id }, orderBy: { createdAt: 'desc' },
      select: { experience: true, usefulness: true, navigation: true, comment: true, createdAt: true },
    });
  }

  /** Emite (ou devolve o já emitido) somente se a regra de conclusão for satisfeita agora, no servidor. */
  async issueCertificate(actor: Actor, enrollmentId: string) {
    const e = await this.ownEnrollment(actor, enrollmentId);
    const existente = await this.prisma.certificate.findUnique({ where: { enrollmentId: e.id } });
    if (existente) return this.presentCertificate(existente);

    await this.entitlements.assertLearnerAccess(actor.userId, e.institutionId, e.collection);
    const summary = await this.progress.syncCompletion(e);
    if (summary.status !== 'completed') {
      const faltam = summary.requiredTotal - summary.requiredCompleted;
      throw new ConflictException({ statusCode: 409, code: 'COMPLETION_RULE_NOT_MET', message: `Conclua as aulas obrigatórias para liberar o certificado (faltam ${faltam}).` });
    }

    const [user, institution] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { name: true } }),
      this.prisma.institution.findUniqueOrThrow({ where: { id: e.institutionId }, select: { name: true } }),
    ]);
    const metadata = {
      holderName: user.name, collectionSlug: e.collection.slug, collectionTitle: e.collection.title,
      institutionName: institution.name, requiredLessons: summary.requiredTotal,
    };
    for (let tentativa = 0; tentativa < 5; tentativa++) {
      try {
        const cert = await this.prisma.$transaction(async (tx) => {
          const c = await tx.certificate.create({ data: { enrollmentId: e.id, verificationCode: novoCodigo(), metadata } });
          await this.audit.record({ actorUserId: actor.userId, institutionId: e.institutionId, action: 'certificate.issued', entityType: 'certificate', entityId: c.id }, tx);
          return c;
        });
        return this.presentCertificate(cert);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
        const corrida = await this.prisma.certificate.findUnique({ where: { enrollmentId: e.id } });
        if (corrida) return this.presentCertificate(corrida);
      }
    }
    throw new ConflictException('Não foi possível gerar o código do certificado. Tente novamente.');
  }

  async myCertificates(actor: Actor) {
    const rows = await this.prisma.certificate.findMany({ where: { enrollment: { userId: actor.userId } }, orderBy: { issuedAt: 'desc' } });
    return { items: rows.map((c) => this.presentCertificate(c)) };
  }

  async myCertificate(actor: Actor, id: string) {
    const c = await this.prisma.certificate.findUnique({ where: { id }, include: { enrollment: { select: { userId: true } } } });
    if (!c || c.enrollment.userId !== actor.userId) throw new NotFoundException('Certificado não encontrado.');
    return this.presentCertificate(c);
  }

  async verifyCertificate(code: string) {
    const c = await this.prisma.certificate.findUnique({ where: { verificationCode: code.trim().toUpperCase() } });
    if (!c) throw new NotFoundException('Certificado não encontrado.');
    const m = c.metadata as Record<string, unknown>;
    return { valid: !c.revokedAt, verificationCode: c.verificationCode, issuedAt: c.issuedAt, revokedAt: c.revokedAt, holderName: m.holderName, collectionTitle: m.collectionTitle, institutionName: m.institutionName };
  }

  private presentCertificate(c: { id: string; enrollmentId: string; verificationCode: string; issuedAt: Date; revokedAt: Date | null; metadata: Prisma.JsonValue }) {
    return { id: c.id, enrollmentId: c.enrollmentId, verificationCode: c.verificationCode, issuedAt: c.issuedAt, revokedAt: c.revokedAt, valid: !c.revokedAt, ...(c.metadata as object) };
  }
}
