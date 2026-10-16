import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessStatus, ContentStatus, EnrollmentStatus, LessonType, Prisma, RecordStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { presentCollection } from '../catalog/catalog.service';
import { isProvisional, MEDIA_REF_SELECT, mediaUrl } from '../catalog/media-url';
import type { Actor } from '../common/actor';
import { slugify } from '../common/tokens';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCollectionDto, CreateLessonDto, CreateModuleDto, ImpactConfirmation, UpdateCollectionDto, UpdateLessonDto, UpdateModuleDto,
} from './content-admin.dto';

type Tx = Prisma.TransactionClient;

/**
 * Política de versão curricular:
 * - Certificados são retratos imutáveis do momento da emissão: editar o conteúdo nunca os invalida.
 * - Matrícula que já tem certificado mantém a conclusão, mesmo que novas aulas obrigatórias sejam publicadas.
 * - Demais matrículas seguem o currículo vigente (o progresso já registrado é sempre preservado).
 * - Mudanças que alteram o que conta para a conclusão, ou que retiram conteúdo de quem está matriculado,
 *   exigem confirmação explícita + justificativa quando há pessoas afetadas (nada muda "em silêncio").
 */
@Injectable()
export class ContentAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  // ------------------------------------------------------------------ impacto

  async impact(collectionId: string) {
    const [institutions, active, completed, certificates] = await Promise.all([
      this.prisma.institutionCollectionAccess.count({ where: { collectionId, status: AccessStatus.active } }),
      this.prisma.enrollment.count({ where: { collectionId, status: EnrollmentStatus.active } }),
      this.prisma.enrollment.count({ where: { collectionId, completedAt: { not: null } } }),
      this.prisma.certificate.count({ where: { enrollment: { collectionId }, revokedAt: null } }),
    ]);
    return { institutionsWithAccess: institutions, activeEnrollments: active, completedEnrollments: completed, certificates };
  }

  private requireConfirmation(dto: ImpactConfirmation, impact: object, affected: boolean, motivo: string) {
    if (!affected) return;
    if (!dto.confirmImpact || !dto.justification?.trim()) {
      throw new ConflictException({ statusCode: 409, code: 'IMPACT_CONFIRMATION_REQUIRED', message: motivo, impact });
    }
  }

  // ------------------------------------------------------------------ coleções

  async listCollections() {
    const rows = await this.prisma.collection.findMany({
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
      select: {
        id: true, slug: true, title: true, subtitle: true, description: true, status: true, displayOrder: true, themeConfig: true,
        updatedAt: true, cover: { select: MEDIA_REF_SELECT }, thumbnail: { select: MEDIA_REF_SELECT },
        _count: { select: { modules: true, enrollments: { where: { status: EnrollmentStatus.active } } } },
        institutionAccess: { where: { status: AccessStatus.active }, select: { id: true } },
      },
    });
    return rows.map((c) => ({
      ...presentCollection(c), updatedAt: c.updatedAt,
      modules: c._count.modules, activeEnrollments: c._count.enrollments, institutionsWithAccess: c.institutionAccess.length,
    }));
  }

  async getCollection(id: string) {
    const c = await this.prisma.collection.findUnique({
      where: { id },
      select: {
        id: true, slug: true, title: true, subtitle: true, description: true, status: true, displayOrder: true, themeConfig: true,
        coverAssetId: true, thumbnailAssetId: true, updatedAt: true,
        cover: { select: MEDIA_REF_SELECT }, thumbnail: { select: MEDIA_REF_SELECT },
        modules: {
          orderBy: { displayOrder: 'asc' },
          select: {
            id: true, slug: true, title: true, subtitle: true, description: true, kind: true, status: true, displayOrder: true, coverAssetId: true,
            cover: { select: MEDIA_REF_SELECT },
            lessons: {
              orderBy: { displayOrder: 'asc' },
              select: {
                id: true, slug: true, title: true, description: true, lessonType: true, status: true, displayOrder: true, durationSeconds: true,
                requiredForCompletion: true, metadata: true, mediaAssetId: true, thumbnailAssetId: true,
                media: { select: { ...MEDIA_REF_SELECT, mimeType: true, metadata: true } }, thumbnail: { select: MEDIA_REF_SELECT },
                _count: { select: { progress: true } },
              },
            },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Coleção não encontrada.');
    return {
      ...presentCollection(c), coverAssetId: c.coverAssetId, thumbnailAssetId: c.thumbnailAssetId, updatedAt: c.updatedAt,
      impact: await this.impact(id),
      modules: c.modules.map((m) => ({
        ...m, cover: undefined, coverUrl: mediaUrl(m.cover),
        lessons: m.lessons.map((l) => ({
          ...l, media: undefined, thumbnail: undefined, metadata: undefined, provisional: isProvisional(l.metadata),
          mediaUrl: mediaUrl(l.media), thumbnailUrl: mediaUrl(l.thumbnail),
          mediaTitle: (l.media?.metadata as { title?: string; fileName?: string } | null)?.title
            ?? (l.media?.metadata as { fileName?: string } | null)?.fileName ?? null,
          progressRecords: l._count.progress, _count: undefined,
        })),
      })),
    };
  }

  private async uniqueCollectionSlug(base: string) {
    const usados = new Set((await this.prisma.collection.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((c) => c.slug));
    if (!usados.has(base)) return base;
    for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  private async assertMedia(id: string | null | undefined, kind: 'image' | 'video' | 'pdf' | 'video-or-pdf') {
    if (!id) return;
    const a = await this.prisma.mediaAsset.findUnique({ where: { id }, select: { mimeType: true, status: true } });
    if (!a || a.status !== RecordStatus.active) throw new BadRequestException('Arquivo de mídia não encontrado.');
    const ok = kind === 'image' ? a.mimeType.startsWith('image/')
      : kind === 'video' ? a.mimeType.startsWith('video/')
        : kind === 'pdf' ? a.mimeType === 'application/pdf'
          : a.mimeType.startsWith('video/') || a.mimeType === 'application/pdf';
    if (!ok) throw new BadRequestException(`O arquivo escolhido não é do tipo esperado (${kind === 'image' ? 'imagem' : kind === 'pdf' ? 'PDF' : 'vídeo'}).`);
  }

  private theme(current: Prisma.JsonValue | null, dto: { layout?: string; institutoUrl?: string | null }) {
    const base = (current && typeof current === 'object' && !Array.isArray(current) ? current : {}) as Record<string, unknown>;
    return {
      ...base,
      ...(dto.layout !== undefined ? { layout: dto.layout } : {}),
      ...(dto.institutoUrl !== undefined ? { institutoUrl: dto.institutoUrl } : {}),
    } as Prisma.InputJsonValue;
  }

  async createCollection(actor: Actor, dto: CreateCollectionDto) {
    await Promise.all([this.assertMedia(dto.coverAssetId, 'image'), this.assertMedia(dto.thumbnailAssetId, 'image')]);
    const slug = dto.slug ?? (await this.uniqueCollectionSlug(slugify(dto.title)));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const c = await tx.collection.create({
          data: {
            slug, title: dto.title.trim(), subtitle: dto.subtitle?.trim() || null, description: dto.description?.trim() || null,
            coverAssetId: dto.coverAssetId ?? null, thumbnailAssetId: dto.thumbnailAssetId ?? null,
            displayOrder: dto.displayOrder ?? 1000, status: ContentStatus.draft,
            themeConfig: this.theme(null, { layout: dto.layout ?? 'padrao', institutoUrl: dto.institutoUrl ?? null }),
          },
        });
        await this.audit.record({ actorUserId: actor.userId, action: 'collection.created', entityType: 'collection', entityId: c.id, metadata: { slug, title: c.title } }, tx);
        return c;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Já existe uma coleção com este slug.');
      throw e;
    }
  }

  async updateCollection(actor: Actor, id: string, dto: UpdateCollectionDto) {
    const atual = await this.prisma.collection.findUnique({ where: { id } });
    if (!atual) throw new NotFoundException('Coleção não encontrada.');
    await Promise.all([this.assertMedia(dto.coverAssetId, 'image'), this.assertMedia(dto.thumbnailAssetId, 'image')]);
    const impacto = await this.impact(id);

    if (dto.slug && dto.slug !== atual.slug && (atual.status !== ContentStatus.draft || impacto.activeEnrollments || impacto.institutionsWithAccess)) {
      throw new BadRequestException('O slug só pode mudar enquanto a coleção é rascunho sem liberações: ele compõe os endereços já compartilhados.');
    }
    const saiDoAr = atual.status === ContentStatus.published && dto.status !== undefined && dto.status !== ContentStatus.published;
    this.requireConfirmation(dto, impacto, saiDoAr && (impacto.activeEnrollments > 0 || impacto.institutionsWithAccess > 0),
      'Despublicar/arquivar retira o acesso de instituições e professores matriculados. Confirme o impacto e informe a justificativa.');

    const data: Prisma.CollectionUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle.trim() || null } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.coverAssetId !== undefined ? { cover: dto.coverAssetId ? { connect: { id: dto.coverAssetId } } : { disconnect: true } } : {}),
      ...(dto.thumbnailAssetId !== undefined ? { thumbnail: dto.thumbnailAssetId ? { connect: { id: dto.thumbnailAssetId } } : { disconnect: true } } : {}),
      ...(dto.displayOrder !== undefined ? { displayOrder: dto.displayOrder } : {}),
      ...(dto.layout !== undefined || dto.institutoUrl !== undefined ? { themeConfig: this.theme(atual.themeConfig, dto) } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        const c = await tx.collection.update({ where: { id }, data });
        const mudouStatus = dto.status !== undefined && dto.status !== atual.status;
        await this.audit.record({
          actorUserId: actor.userId, action: mudouStatus ? 'collection.status_changed' : 'collection.updated', entityType: 'collection', entityId: id,
          metadata: {
            fields: Object.keys(data), ...(mudouStatus ? { from: atual.status, to: dto.status } : {}),
            ...(dto.justification ? { justification: dto.justification.trim(), impact: impacto } : {}),
          },
        }, tx);
        return c;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Já existe uma coleção com este slug.');
      throw e;
    }
  }

  // ------------------------------------------------------------------ módulos

  private async uniqueModuleSlug(collectionId: string, base: string, tx: Tx | PrismaService = this.prisma) {
    const usados = new Set((await tx.module.findMany({ where: { collectionId }, select: { slug: true } })).map((m) => m.slug));
    if (!usados.has(base)) return base;
    for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  /** Quantas aulas obrigatórias publicadas o módulo tem (mudar o módulo de status altera a regra de conclusão). */
  private countedLessons(moduleId: string) {
    return this.prisma.lesson.count({ where: { moduleId, status: ContentStatus.published, requiredForCompletion: true } });
  }

  async createModule(actor: Actor, collectionId: string, dto: CreateModuleDto) {
    const col = await this.prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
    if (!col) throw new NotFoundException('Coleção não encontrada.');
    await this.assertMedia(dto.coverAssetId, 'image');
    return this.prisma.$transaction(async (tx) => {
      const slug = dto.slug ?? (await this.uniqueModuleSlug(collectionId, slugify(dto.title), tx));
      const ultimo = await tx.module.aggregate({ where: { collectionId }, _max: { displayOrder: true } });
      const m = await tx.module.create({
        data: {
          collectionId, slug, title: dto.title.trim(), subtitle: dto.subtitle?.trim() || null, description: dto.description?.trim() || null,
          kind: dto.kind ?? 'curriculum', coverAssetId: dto.coverAssetId ?? null, status: dto.status ?? ContentStatus.draft,
          displayOrder: (ultimo._max.displayOrder ?? 0) + 1,
        },
      }).catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Já existe um módulo com este slug na coleção.');
        throw e;
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'module.created', entityType: 'module', entityId: m.id, metadata: { collectionId, title: m.title } }, tx);
      return m;
    });
  }

  async updateModule(actor: Actor, id: string, dto: UpdateModuleDto) {
    const m = await this.prisma.module.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Módulo não encontrado.');
    await this.assertMedia(dto.coverAssetId, 'image');
    if (dto.status !== undefined && (dto.status === ContentStatus.published) !== (m.status === ContentStatus.published)) {
      const impacto = await this.impact(m.collectionId);
      const contam = await this.countedLessons(id);
      this.requireConfirmation(dto, impacto, contam > 0 && (impacto.completedEnrollments > 0 || impacto.activeEnrollments > 0),
        'Mudar a publicação deste módulo altera as aulas obrigatórias de quem está matriculado. Confirme o impacto e informe a justificativa.');
    }
    const data: Prisma.ModuleUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      ...(dto.subtitle !== undefined ? { subtitle: dto.subtitle.trim() || null } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
      ...(dto.coverAssetId !== undefined ? { coverAssetId: dto.coverAssetId } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.module.update({ where: { id }, data }).catch((e) => {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Já existe um módulo com este slug na coleção.');
        throw e;
      });
      await this.audit.record({
        actorUserId: actor.userId, action: 'module.updated', entityType: 'module', entityId: id,
        metadata: { collectionId: m.collectionId, fields: Object.keys(data), ...(dto.justification ? { justification: dto.justification.trim() } : {}) },
      }, tx);
      return r;
    });
  }

  async deleteModule(actor: Actor, id: string) {
    const m = await this.prisma.module.findUnique({ where: { id }, include: { _count: { select: { lessons: true } } } });
    if (!m) throw new NotFoundException('Módulo não encontrado.');
    if (m._count.lessons) throw new ConflictException('Remova ou mova as aulas antes de excluir o módulo (ou arquive-o para preservar o histórico).');
    await this.prisma.$transaction(async (tx) => {
      await tx.module.delete({ where: { id } });
      await this.audit.record({ actorUserId: actor.userId, action: 'module.deleted', entityType: 'module', entityId: id, metadata: { collectionId: m.collectionId, title: m.title } }, tx);
    });
  }

  async reorderModules(actor: Actor, collectionId: string, ids: string[]) {
    const atuais = await this.prisma.module.findMany({ where: { collectionId }, select: { id: true } });
    if (atuais.length !== ids.length || new Set(ids).size !== ids.length || !atuais.every((m) => ids.includes(m.id))) {
      throw new BadRequestException('Envie todos os módulos da coleção, sem repetição.');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [i, mid] of ids.entries()) await tx.module.update({ where: { id: mid }, data: { displayOrder: i + 1 } });
      await this.audit.record({ actorUserId: actor.userId, action: 'modules.reordered', entityType: 'collection', entityId: collectionId }, tx);
    });
  }

  // ------------------------------------------------------------------ aulas

  private async assertLessonMedia(type: LessonType, mediaAssetId?: string | null, thumbnailAssetId?: string | null) {
    if (mediaAssetId) await this.assertMedia(mediaAssetId, type === 'video' ? 'video' : type === 'document' ? 'pdf' : 'video-or-pdf');
    await this.assertMedia(thumbnailAssetId, 'image');
  }

  /** O frontend identifica a aula pelo slug dentro da coleção: ele precisa ser único na coleção inteira. */
  private async assertLessonSlugFree(collectionId: string, slug: string, exceptId?: string) {
    const dup = await this.prisma.lesson.findFirst({ where: { slug, module: { collectionId }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (dup) throw new ConflictException('Já existe uma aula com este slug nesta coleção.');
  }

  private conta = (l: { status: ContentStatus; requiredForCompletion: boolean }, moduloPublicado: boolean) =>
    moduloPublicado && l.status === ContentStatus.published && l.requiredForCompletion;

  async createLesson(actor: Actor, moduleId: string, dto: CreateLessonDto) {
    const mod = await this.prisma.module.findUnique({ where: { id: moduleId }, select: { id: true, collectionId: true, status: true } });
    if (!mod) throw new NotFoundException('Módulo não encontrado.');
    await this.assertLessonMedia(dto.lessonType, dto.mediaAssetId, dto.thumbnailAssetId);
    const slug = dto.slug ?? slugify(dto.title);
    await this.assertLessonSlugFree(mod.collectionId, slug);
    const status = dto.status ?? ContentStatus.draft;
    const required = dto.requiredForCompletion ?? dto.lessonType === 'video';
    const impacto = await this.impact(mod.collectionId);
    this.requireConfirmation(dto, impacto, this.conta({ status, requiredForCompletion: required }, mod.status === 'published') && impacto.completedEnrollments > 0,
      'Publicar uma nova aula obrigatória muda a regra de conclusão de quem já concluiu (certificados emitidos continuam válidos). Confirme o impacto e informe a justificativa.');
    return this.prisma.$transaction(async (tx) => {
      const ultimo = await tx.lesson.aggregate({ where: { moduleId }, _max: { displayOrder: true } });
      const l = await tx.lesson.create({
        data: {
          moduleId, slug, title: dto.title.trim(), description: dto.description?.trim() || null, lessonType: dto.lessonType,
          mediaAssetId: dto.mediaAssetId ?? null, thumbnailAssetId: dto.thumbnailAssetId ?? null, durationSeconds: dto.durationSeconds ?? null,
          requiredForCompletion: required, status, displayOrder: (ultimo._max.displayOrder ?? 0) + 1,
          metadata: dto.provisional ? { editorial: 'placeholder' } : Prisma.JsonNull,
        },
      });
      await this.audit.record({
        actorUserId: actor.userId, action: 'lesson.created', entityType: 'lesson', entityId: l.id,
        metadata: { moduleId, collectionId: mod.collectionId, title: l.title, required, status, ...(dto.justification ? { justification: dto.justification.trim() } : {}) },
      }, tx);
      return l;
    });
  }

  async updateLesson(actor: Actor, id: string, dto: UpdateLessonDto) {
    const l = await this.prisma.lesson.findUnique({ where: { id }, include: { module: { select: { collectionId: true, status: true } } } });
    if (!l) throw new NotFoundException('Aula não encontrada.');
    let destino = l.module;
    if (dto.moduleId && dto.moduleId !== l.moduleId) {
      const m = await this.prisma.module.findUnique({ where: { id: dto.moduleId }, select: { collectionId: true, status: true } });
      if (!m || m.collectionId !== l.module.collectionId) throw new BadRequestException('A aula só pode ser movida para um módulo da mesma coleção.');
      destino = m;
    }
    const tipo = dto.lessonType ?? l.lessonType;
    await this.assertLessonMedia(tipo, dto.mediaAssetId === undefined ? l.mediaAssetId : dto.mediaAssetId, dto.thumbnailAssetId);
    if (dto.slug && dto.slug !== l.slug) {
      if (l.status === ContentStatus.published) throw new BadRequestException('O slug de uma aula publicada compõe endereços já compartilhados e não pode mudar.');
      await this.assertLessonSlugFree(l.module.collectionId, dto.slug, id);
    }
    const antes = this.conta(l, l.module.status === 'published');
    const depois = this.conta({ status: dto.status ?? l.status, requiredForCompletion: dto.requiredForCompletion ?? l.requiredForCompletion }, destino.status === 'published');
    const impacto = await this.impact(l.module.collectionId);
    this.requireConfirmation(dto, impacto, antes !== depois && (impacto.completedEnrollments > 0 || (!depois && impacto.activeEnrollments > 0)),
      'Esta alteração muda as aulas que contam para a conclusão de quem está matriculado. Confirme o impacto e informe a justificativa.');

    const meta = (l.metadata && typeof l.metadata === 'object' ? l.metadata : {}) as Record<string, unknown>;
    const data: Prisma.LessonUncheckedUpdateInput = {
      ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
      ...(dto.lessonType !== undefined ? { lessonType: dto.lessonType } : {}),
      ...(dto.mediaAssetId !== undefined ? { mediaAssetId: dto.mediaAssetId } : {}),
      ...(dto.thumbnailAssetId !== undefined ? { thumbnailAssetId: dto.thumbnailAssetId } : {}),
      ...(dto.durationSeconds !== undefined ? { durationSeconds: dto.durationSeconds } : {}),
      ...(dto.requiredForCompletion !== undefined ? { requiredForCompletion: dto.requiredForCompletion } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.moduleId !== undefined ? { moduleId: dto.moduleId } : {}),
      ...(dto.provisional !== undefined ? {
        metadata: (() => {
          const { editorial: _e, ...resto } = meta;
          return (dto.provisional ? { ...resto, editorial: 'placeholder' } : resto) as Prisma.InputJsonValue;
        })(),
      } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.lesson.update({ where: { id }, data });
      await this.audit.record({
        actorUserId: actor.userId, action: 'lesson.updated', entityType: 'lesson', entityId: id,
        metadata: {
          collectionId: l.module.collectionId, fields: Object.keys(data),
          ...(antes !== depois ? { countsForCompletion: { from: antes, to: depois } } : {}),
          ...(dto.justification ? { justification: dto.justification.trim() } : {}),
        },
      }, tx);
      return r;
    });
  }

  /** Só exclui aula sem nenhum registro de progresso; com histórico, o caminho é arquivar. */
  async deleteLesson(actor: Actor, id: string) {
    const l = await this.prisma.lesson.findUnique({ where: { id }, include: { module: { select: { collectionId: true } }, _count: { select: { progress: true } } } });
    if (!l) throw new NotFoundException('Aula não encontrada.');
    if (l._count.progress) throw new ConflictException('Esta aula tem histórico de progresso: arquive-a em vez de excluir.');
    await this.prisma.$transaction(async (tx) => {
      await tx.lesson.delete({ where: { id } });
      await this.audit.record({ actorUserId: actor.userId, action: 'lesson.deleted', entityType: 'lesson', entityId: id, metadata: { collectionId: l.module.collectionId, title: l.title } }, tx);
    });
  }

  async reorderLessons(actor: Actor, moduleId: string, ids: string[]) {
    const atuais = await this.prisma.lesson.findMany({ where: { moduleId }, select: { id: true } });
    if (atuais.length !== ids.length || new Set(ids).size !== ids.length || !atuais.every((m) => ids.includes(m.id))) {
      throw new BadRequestException('Envie todas as aulas do módulo, sem repetição.');
    }
    await this.prisma.$transaction(async (tx) => {
      for (const [i, lid] of ids.entries()) await tx.lesson.update({ where: { id: lid }, data: { displayOrder: i + 1 } });
      await this.audit.record({ actorUserId: actor.userId, action: 'lessons.reordered', entityType: 'module', entityId: moduleId }, tx);
    });
  }
}
