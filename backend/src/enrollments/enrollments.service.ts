import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, EnrollmentStatus, Prisma, RecordStatus } from '@prisma/client';
import { AccessPolicy } from '../access/access-policy.service';
import { AuditService } from '../audit/audit.service';
import { presentCollection } from '../catalog/catalog.service';
import { MEDIA_REF_SELECT } from '../catalog/media-url';
import type { Actor } from '../common/actor';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ProgressService } from '../entitlements/progress.service';
import { PrismaService } from '../prisma/prisma.service';

const SEM_DIREITO = 'Sua instituição não possui acesso ativo a esta coleção. Solicite a liberação ao administrador.';
const COLLECTION_SELECT = {
  id: true, slug: true, title: true, subtitle: true, description: true, status: true, displayOrder: true, themeConfig: true,
  cover: { select: MEDIA_REF_SELECT }, thumbnail: { select: MEDIA_REF_SELECT },
} satisfies Prisma.CollectionSelect;

/** Recursos de coordenação. Toda operação é limitada à instituição da URL, validada contra o vínculo do coordenador. */
@Injectable()
export class EnrollmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
    private readonly entitlements: EntitlementsService,
    private readonly progress: ProgressService,
    private readonly audit: AuditService,
  ) {}

  /** Coleções publicadas com o direito da instituição e números consolidados de matrícula/conclusão. */
  async institutionCollections(actor: Actor, institutionId: string) {
    this.access.assertCanManageMembers(actor, institutionId);
    const collections = await this.prisma.collection.findMany({
      where: { status: ContentStatus.published },
      select: { ...COLLECTION_SELECT, institutionAccess: { where: { institutionId } } },
      orderBy: { displayOrder: 'asc' },
    });
    const stats = await this.prisma.enrollment.groupBy({
      by: ['collectionId', 'status'],
      where: { institutionId },
      _count: { _all: true },
    });
    const concluidas = await this.prisma.enrollment.groupBy({
      by: ['collectionId'],
      where: { institutionId, status: EnrollmentStatus.active, completedAt: { not: null } },
      _count: { _all: true },
    });
    return {
      items: collections.map((c) => {
        const a = c.institutionAccess[0];
        const ativos = stats.find((s) => s.collectionId === c.id && s.status === EnrollmentStatus.active)?._count._all ?? 0;
        return {
          ...presentCollection(c),
          institutionAccess: { state: this.entitlements.accessState(a), grantedAt: a?.grantedAt ?? null, expiresAt: a?.expiresAt ?? null },
          enrollments: { active: ativos, completed: concluidas.find((s) => s.collectionId === c.id)?._count._all ?? 0 },
        };
      }),
    };
  }

  async listEnrollments(actor: Actor, institutionId: string, collectionId: string) {
    this.access.assertCanManageMembers(actor, institutionId);
    const rows = await this.prisma.enrollment.findMany({
      where: { institutionId, collectionId },
      include: { membership: { select: { role: true, status: true, user: { select: { id: true, name: true, email: true } } } } },
      orderBy: { enrolledAt: 'asc' },
    });
    const items = [];
    for (const e of rows) {
      const s = await this.progress.summary(e);
      items.push({
        id: e.id, status: e.status, enrolledAt: e.enrolledAt, completedAt: e.completedAt, revokedAt: e.revokedAt,
        user: e.membership.user, memberRole: e.membership.role, membershipStatus: e.membership.status,
        progress: { ...s, pending: s.requiredTotal - s.requiredCompleted },
      });
    }
    const total = items.filter((i) => i.status === EnrollmentStatus.active);
    return {
      items,
      consolidated: {
        activeEnrollments: total.length,
        completed: total.filter((i) => i.progress.status === 'completed').length,
        averagePercent: total.length ? Math.round(total.reduce((n, i) => n + i.progress.percent, 0) / total.length) : 0,
      },
    };
  }

  private async scopedEnrollment(institutionId: string, enrollmentId: string) {
    // Busca restrita à instituição da URL: matrícula de outra escola → 404, nunca alteração cruzada.
    const e = await this.prisma.enrollment.findFirst({ where: { id: enrollmentId, institutionId }, include: { collection: { select: { id: true, slug: true, title: true, status: true } } } });
    if (!e) throw new NotFoundException('Matrícula não encontrada nesta instituição.');
    return e;
  }

  /** Progresso individual com as aulas obrigatórias pendentes. */
  async enrollmentProgress(actor: Actor, institutionId: string, enrollmentId: string) {
    this.access.assertCanManageMembers(actor, institutionId);
    const e = await this.scopedEnrollment(institutionId, enrollmentId);
    const d = await this.progress.detail(e);
    return {
      enrollment: { id: e.id, status: e.status, userId: e.userId, enrolledAt: e.enrolledAt, completedAt: e.completedAt },
      collection: e.collection,
      summary: d.summary,
      modules: d.modules,
      pendingLessons: d.lessons.filter((l) => l.required && l.status !== 'completed').map(({ lessonId, slug, title, moduleSlug }) => ({ lessonId, slug, title, moduleSlug })),
    };
  }

  private async assertCollectionUsable(institutionId: string, collectionId: string) {
    const c = await this.prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true, status: true } });
    if (!c) throw new NotFoundException('Coleção não encontrada.');
    if (c.status !== ContentStatus.published) throw new BadRequestException('A coleção não está publicada.');
    // Nem o administrador matricula sem direito institucional: primeiro se concede o acesso à instituição.
    if ((await this.entitlements.institutionAccess(institutionId, collectionId)).state !== 'active') {
      throw new ForbiddenException({ statusCode: 403, code: 'INSTITUTION_WITHOUT_ACCESS', message: SEM_DIREITO });
    }
  }

  async enroll(actor: Actor, institutionId: string, dto: { userId: string; collectionId: string }) {
    this.access.assertCanManageMembers(actor, institutionId);
    await this.assertCollectionUsable(institutionId, dto.collectionId);
    const membership = await this.prisma.membership.findUnique({
      where: { userId_institutionId: { userId: dto.userId, institutionId } },
      select: { status: true, institution: { select: { status: true } } },
    });
    if (!membership || membership.status !== RecordStatus.active) {
      throw new BadRequestException('A pessoa não possui vínculo ativo com esta instituição.');
    }

    const existing = await this.prisma.enrollment.findUnique({
      where: { institutionId_userId_collectionId: { institutionId, userId: dto.userId, collectionId: dto.collectionId } },
    });
    if (existing?.status === EnrollmentStatus.active) throw new ConflictException('Já existe matrícula ativa para esta pessoa nesta coleção.');

    return this.prisma.$transaction(async (tx) => {
      const e = existing
        ? await tx.enrollment.update({ where: { id: existing.id }, data: { status: EnrollmentStatus.active, revokedAt: null, assignedById: actor.userId } })
        : await tx.enrollment.create({ data: { institutionId, userId: dto.userId, collectionId: dto.collectionId, assignedById: actor.userId } });
      await this.audit.record({
        actorUserId: actor.userId, institutionId, action: existing ? 'enrollment.reactivated' : 'enrollment.created',
        entityType: 'enrollment', entityId: e.id, metadata: { userId: dto.userId, collectionId: dto.collectionId },
      }, tx);
      return e;
    });
  }

  async update(actor: Actor, institutionId: string, enrollmentId: string, status: EnrollmentStatus) {
    this.access.assertCanManageMembers(actor, institutionId);
    const e = await this.scopedEnrollment(institutionId, enrollmentId);
    if (status === EnrollmentStatus.active) await this.assertCollectionUsable(institutionId, e.collectionId);
    if (e.status === status) return e;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.enrollment.update({
        where: { id: e.id },
        data: { status, revokedAt: status === EnrollmentStatus.revoked ? new Date() : null },
      });
      await this.audit.record({ actorUserId: actor.userId, institutionId, action: `enrollment.${status}`, entityType: 'enrollment', entityId: e.id }, tx);
      return updated;
    });
  }

  /** O coordenador não libera coleções: apenas registra o pedido para o administrador geral. */
  async requestAccess(actor: Actor, institutionId: string, collectionId: string, message?: string) {
    this.access.assertCanManageMembers(actor, institutionId);
    const c = await this.prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true, status: true, title: true } });
    if (!c || c.status !== ContentStatus.published) throw new NotFoundException('Coleção não encontrada.');
    if ((await this.entitlements.institutionAccess(institutionId, collectionId)).state === 'active') {
      throw new ConflictException('Sua instituição já possui acesso a esta coleção.');
    }
    const recente = await this.prisma.auditLog.findFirst({
      where: { action: 'collection_access.requested', institutionId, entityId: collectionId, createdAt: { gt: new Date(Date.now() - 24 * 3600_000) } },
    });
    if (!recente) {
      await this.audit.record({
        actorUserId: actor.userId, institutionId, action: 'collection_access.requested', entityType: 'collection', entityId: collectionId,
        metadata: { collectionTitle: c.title, message: message?.slice(0, 500) ?? null },
      });
    }
    return { requested: true, message: 'Pedido registrado. O administrador da plataforma avaliará a liberação.' };
  }
}
