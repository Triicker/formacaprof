import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ContentStatus, LessonType, MediaVisibility, ModuleKind, Prisma, PrismaClient, StorageProvider,
} from '@prisma/client';

export interface CatalogContent {
  version: number;
  assets: {
    key: string; storageProvider: StorageProvider; storageKey?: string; externalUrl?: string;
    mimeType: string; fileSize?: number; visibility: MediaVisibility; metadata?: Prisma.InputJsonValue;
  }[];
  collections: {
    slug: string; title: string; subtitle?: string; description?: string; status: ContentStatus; displayOrder: number;
    cover?: string; thumbnail?: string; themeConfig?: Prisma.InputJsonValue;
    modules: {
      slug: string; title: string; subtitle?: string; description?: string; kind: ModuleKind; cover?: string;
      status: ContentStatus; displayOrder: number;
      lessons: {
        slug: string; title: string; description?: string; lessonType: LessonType; media?: string; thumbnail?: string;
        durationSeconds?: number; requiredForCompletion: boolean; status: ContentStatus; displayOrder: number;
        metadata?: Prisma.InputJsonValue;
      }[];
    }[];
  }[];
}

export function loadCatalogContent(file = process.env.CONTENT_FILE || resolve(process.cwd(), 'content/catalog.json')): CatalogContent {
  return JSON.parse(readFileSync(file, 'utf8')) as CatalogContent;
}

/**
 * Importa o catálogo de forma idempotente. Nunca apaga registros.
 * Por padrão só CRIA o que falta (não sobrescreve edições feitas em produção);
 * com `update: true` também atualiza os campos dos itens já existentes.
 */
export async function seedCatalog(prisma: PrismaClient, content: CatalogContent, { update = false } = {}) {
  const assetId = new Map<string, string>();
  const ref = (key?: string) => {
    if (!key) return null;
    const id = assetId.get(key);
    if (!id) throw new Error(`Mídia "${key}" referenciada no catálogo não foi declarada em assets.`);
    return id;
  };
  const counts = { assets: 0, collections: 0, modules: 0, lessons: 0 };

  for (const a of content.assets) {
    const data = {
      storageProvider: a.storageProvider, storageKey: a.storageKey ?? null, externalUrl: a.externalUrl ?? null,
      mimeType: a.mimeType, fileSize: a.fileSize ?? null, visibility: a.visibility, metadata: a.metadata ?? Prisma.JsonNull,
    };
    const row = await prisma.mediaAsset.upsert({ where: { key: a.key }, create: { key: a.key, ...data }, update: update ? data : {} });
    assetId.set(a.key, row.id);
    counts.assets++;
  }

  for (const c of content.collections) {
    const data = {
      title: c.title, subtitle: c.subtitle ?? null, description: c.description ?? null, status: c.status,
      displayOrder: c.displayOrder, coverAssetId: ref(c.cover), thumbnailAssetId: ref(c.thumbnail),
      themeConfig: c.themeConfig ?? Prisma.JsonNull,
    };
    const col = await prisma.collection.upsert({ where: { slug: c.slug }, create: { slug: c.slug, ...data }, update: update ? data : {} });
    counts.collections++;

    for (const m of c.modules) {
      const mData = {
        title: m.title, subtitle: m.subtitle ?? null, description: m.description ?? null, kind: m.kind,
        coverAssetId: ref(m.cover), status: m.status, displayOrder: m.displayOrder,
      };
      const mod = await prisma.module.upsert({
        where: { collectionId_slug: { collectionId: col.id, slug: m.slug } },
        create: { collectionId: col.id, slug: m.slug, ...mData },
        update: update ? mData : {},
      });
      counts.modules++;

      for (const l of m.lessons) {
        const lData = {
          title: l.title, description: l.description ?? null, lessonType: l.lessonType,
          mediaAssetId: ref(l.media), thumbnailAssetId: ref(l.thumbnail), durationSeconds: l.durationSeconds ?? null,
          requiredForCompletion: l.requiredForCompletion, status: l.status, displayOrder: l.displayOrder,
          metadata: l.metadata ?? Prisma.JsonNull,
        };
        await prisma.lesson.upsert({
          where: { moduleId_slug: { moduleId: mod.id, slug: l.slug } },
          create: { moduleId: mod.id, slug: l.slug, ...lData },
          update: update ? lData : {},
        });
        counts.lessons++;
      }
    }
  }
  return counts;
}
