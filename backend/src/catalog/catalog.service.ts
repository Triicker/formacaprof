import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, MediaVisibility, Prisma, RecordStatus } from '@prisma/client';
import { resolve, sep } from 'node:path';
import type { Actor } from '../common/actor';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import { isProvisional, MEDIA_REF_SELECT, mediaUrl } from './media-url';

export const WELCOME_VIDEO_KEY = 'platform.welcome-video';
/** Mídias da plataforma liberadas a qualquer usuário autenticado (não pertencem a uma coleção). */
const PLATFORM_MEDIA = new Set([WELCOME_VIDEO_KEY]);

const COLLECTION_SELECT = {
  id: true, slug: true, title: true, subtitle: true, description: true, status: true, displayOrder: true, themeConfig: true,
  cover: { select: MEDIA_REF_SELECT }, thumbnail: { select: MEDIA_REF_SELECT },
} satisfies Prisma.CollectionSelect;

const LESSON_SELECT = {
  id: true, slug: true, title: true, description: true, lessonType: true, displayOrder: true, durationSeconds: true,
  requiredForCompletion: true, status: true, metadata: true,
  media: { select: { ...MEDIA_REF_SELECT, mimeType: true, fileSize: true, metadata: true } },
  thumbnail: { select: MEDIA_REF_SELECT },
} satisfies Prisma.LessonSelect;

type CollectionRow = Prisma.CollectionGetPayload<{ select: typeof COLLECTION_SELECT }>;
type LessonRow = Prisma.LessonGetPayload<{ select: typeof LESSON_SELECT }>;

/** Só os campos do tema que o frontend precisa (nunca o JSON inteiro). */
function publicTheme(theme: Prisma.JsonValue) {
  const t = (theme && typeof theme === 'object' && !Array.isArray(theme) ? theme : {}) as Record<string, unknown>;
  return { layout: typeof t.layout === 'string' ? t.layout : null, institutoUrl: typeof t.institutoUrl === 'string' ? t.institutoUrl : null };
}

export function presentCollection(c: CollectionRow) {
  return {
    id: c.id, slug: c.slug, title: c.title, subtitle: c.subtitle, description: c.description, status: c.status,
    displayOrder: c.displayOrder, coverUrl: mediaUrl(c.cover), thumbnailUrl: mediaUrl(c.thumbnail), theme: publicTheme(c.themeConfig),
  };
}

export function presentLesson(l: LessonRow) {
  const fileName = (l.media?.metadata as { fileName?: string } | null)?.fileName ?? null;
  return {
    id: l.id, slug: l.slug, title: l.title, description: l.description, lessonType: l.lessonType, displayOrder: l.displayOrder,
    durationSeconds: l.durationSeconds, requiredForCompletion: l.requiredForCompletion,
    provisional: isProvisional(l.metadata),
    thumbnailUrl: mediaUrl(l.thumbnail),
    // Sempre o portão /media/:id (autorizado a cada requisição), nunca o link externo.
    mediaUrl: mediaUrl(l.media),
    media: l.media ? { mimeType: l.media.mimeType, fileSize: l.media.fileSize, fileName } : null,
  };
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Coleções visíveis no catálogo: publicadas e em preparação (rascunho = "Em breve"). Arquivadas só para o admin. */
  async listCollections(actor: Actor) {
    const rows = await this.prisma.collection.findMany({
      where: actor.isPlatformAdmin ? {} : { status: { not: ContentStatus.archived } },
      select: COLLECTION_SELECT,
      orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }],
    });
    return rows.map(presentCollection);
  }

  async findCollection(actor: Actor, slug: string) {
    const c = await this.prisma.collection.findUnique({ where: { slug }, select: COLLECTION_SELECT });
    if (!c || (c.status === ContentStatus.archived && !actor.isPlatformAdmin)) throw new NotFoundException('Coleção não encontrada.');
    return c;
  }

  /** Visível a qualquer pessoa autenticada só a vitrine; os módulos/aulas exigem acesso. */
  async getCollection(actor: Actor, slug: string) {
    return presentCollection(await this.findCollection(actor, slug));
  }

  private lessonFilter(actor: Actor): Prisma.LessonWhereInput {
    return actor.isPlatformAdmin ? { status: { not: ContentStatus.archived } } : { status: ContentStatus.published };
  }

  async getModules(actor: Actor, slug: string) {
    const c = await this.findCollection(actor, slug);
    await this.entitlements.assertCanViewContent(actor, c);
    const modules = await this.prisma.module.findMany({
      where: { collectionId: c.id, status: actor.isPlatformAdmin ? { not: ContentStatus.archived } : ContentStatus.published },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true, slug: true, title: true, subtitle: true, description: true, kind: true, displayOrder: true,
        cover: { select: MEDIA_REF_SELECT },
        lessons: { where: this.lessonFilter(actor), orderBy: { displayOrder: 'asc' }, select: LESSON_SELECT },
      },
    });
    return modules.map((m) => ({ ...m, cover: undefined, coverUrl: mediaUrl(m.cover), lessons: m.lessons.map(presentLesson) }));
  }

  async getModuleLessons(actor: Actor, moduleId: string) {
    const m = await this.prisma.module.findUnique({ where: { id: moduleId }, include: { collection: { select: { id: true, status: true } } } });
    if (!m || (m.status !== ContentStatus.published && !actor.isPlatformAdmin)) throw new NotFoundException('Módulo não encontrado.');
    await this.entitlements.assertCanViewContent(actor, m.collection);
    const lessons = await this.prisma.lesson.findMany({ where: { moduleId, ...this.lessonFilter(actor) }, orderBy: { displayOrder: 'asc' }, select: LESSON_SELECT });
    return lessons.map(presentLesson);
  }

  async getLesson(actor: Actor, lessonId: string) {
    const l = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        ...LESSON_SELECT,
        module: { select: { id: true, slug: true, title: true, status: true, collection: { select: { id: true, slug: true, status: true } } } },
      },
    });
    const visivel = l && (actor.isPlatformAdmin || (l.status === ContentStatus.published && l.module.status === ContentStatus.published));
    if (!l || !visivel) throw new NotFoundException('Aula não encontrada.');
    await this.entitlements.assertCanViewContent(actor, l.module.collection);
    return {
      ...presentLesson(l),
      module: { id: l.module.id, slug: l.module.slug, title: l.module.title },
      collection: { id: l.module.collection.id, slug: l.module.collection.slug },
    };
  }

  /** Portão das mídias: confere a permissão a cada requisição e devolve como entregar o arquivo. */
  async authorizeMedia(actor: Actor, assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset || asset.status !== RecordStatus.active) throw new NotFoundException('Arquivo não encontrado.');

    const permitido = asset.visibility === MediaVisibility.public
      || (asset.key !== null && PLATFORM_MEDIA.has(asset.key))
      || actor.isPlatformAdmin
      || (await this.canViewAnyLessonUsing(actor, asset.id));
    if (!permitido) throw new ForbiddenException({ statusCode: 403, code: 'MEDIA_FORBIDDEN', message: 'Você não tem acesso a este arquivo.' });

    if (asset.storageProvider === 'local') {
      const root = this.config.storageDir;
      const file = resolve(root, asset.storageKey!);
      if (!file.startsWith(root + sep)) throw new NotFoundException('Arquivo não encontrado.');
      const fileName = (asset.metadata as { fileName?: string } | null)?.fileName ?? 'arquivo';
      return { kind: 'file' as const, path: file, mimeType: asset.mimeType, fileName };
    }
    return { kind: 'redirect' as const, url: asset.storageProvider === 'external' ? asset.externalUrl! : asset.storageKey! };
  }

  private async canViewAnyLessonUsing(actor: Actor, assetId: string) {
    const collections = await this.prisma.collection.findMany({
      where: {
        status: ContentStatus.published,
        modules: { some: { status: ContentStatus.published, lessons: { some: { status: ContentStatus.published, OR: [{ mediaAssetId: assetId }, { thumbnailAssetId: assetId }] } } } },
      },
      select: { id: true, status: true },
    });
    for (const c of collections) if (await this.entitlements.canViewContent(actor, c)) return true;
    return false;
  }

  async welcomeVideo() {
    const a = await this.prisma.mediaAsset.findUnique({ where: { key: WELCOME_VIDEO_KEY } });
    if (!a || a.status !== RecordStatus.active) throw new NotFoundException('Vídeo de boas-vindas não configurado.');
    const meta = (a.metadata ?? {}) as { title?: string; durationSeconds?: number; posterKey?: string };
    const poster = meta.posterKey ? await this.prisma.mediaAsset.findUnique({ where: { key: meta.posterKey }, select: MEDIA_REF_SELECT }) : null;
    return { title: meta.title ?? 'Boas-vindas', url: mediaUrl(a), posterUrl: mediaUrl(poster), durationSeconds: meta.durationSeconds ?? null };
  }
}
