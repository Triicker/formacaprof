/**
 * Passa os vídeos do BASTA para o Cloudflare R2, a partir de content/catalog.json.
 *
 *   npm run midia:r2               → simulação: mostra o que mudaria, sem gravar nada
 *   npm run midia:r2 -- --aplicar  → grava as mudanças (numa transação) e registra na auditoria
 *
 * Mexe só nas mídias dos vídeos (e miniaturas) e nas aulas em vídeo do BASTA.
 * Não toca em coleções, módulos, PDFs, outras coleções nem em matrículas, progresso ou certificados.
 * Nunca apaga: aulas que estejam no banco e não no arquivo são só listadas.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { CatalogContent, loadCatalogContent } from '../catalog/content-seed';

const COLECAO = 'basta';
const MODULOS = ['conheca', 'anos-iniciais', 'anos-finais', 'ensino-medio', 'eja'];

type Asset = CatalogContent['assets'][number];
// O Postgres (jsonb) não preserva a ordem das chaves: compara com as chaves ordenadas.
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v ?? null);
const igual = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const host = (u?: string | null) => (u ? new URL(u).host.replace(/^pub-[0-9a-f]+\./, 'pub-….') : '—');

async function main() {
  const aplicar = process.argv.includes('--aplicar');
  const content = loadCatalogContent();
  const prisma = new PrismaClient();
  try {
    const colecao = content.collections.find((c) => c.slug === COLECAO);
    if (!colecao) throw new Error(`Coleção "${COLECAO}" não está no catálogo.`);
    const basta = await prisma.collection.findUnique({ where: { slug: COLECAO } });
    if (!basta) throw new Error(`Coleção "${COLECAO}" não existe no banco. Rode antes: npm run seed:content`);

    // Mídias envolvidas: vídeo e miniatura de cada aula em vídeo, boas-vindas (e pôster) e vídeos guardados no R2.
    const porChave = new Map(content.assets.map((a) => [a.key, a]));
    const chaves = new Set<string>(['platform.welcome-video']);
    const posterKey = (porChave.get('platform.welcome-video')?.metadata as { posterKey?: string } | undefined)?.posterKey;
    if (posterKey) chaves.add(posterKey);
    for (const a of content.assets) if ((a.metadata as { r2Key?: string } | undefined)?.r2Key) chaves.add(a.key);
    const modulos = colecao.modules.filter((m) => MODULOS.includes(m.slug));
    for (const m of modulos) for (const l of m.lessons) if (l.lessonType === 'video') [l.media, l.thumbnail].forEach((k) => k && chaves.add(k));

    const assetData = (a: Asset) => ({
      storageProvider: a.storageProvider, storageKey: a.storageKey ?? null, externalUrl: a.externalUrl ?? null,
      mimeType: a.mimeType, fileSize: a.fileSize ?? null, visibility: a.visibility, metadata: a.metadata ?? Prisma.JsonNull,
    });
    const assetsPlano: { key: string; acao: 'criar' | 'atualizar' | 'igual'; antes: string; depois: string }[] = [];
    for (const key of chaves) {
      const a = porChave.get(key);
      if (!a) throw new Error(`Mídia "${key}" referenciada no catálogo não foi declarada em assets.`);
      const atual = await prisma.mediaAsset.findUnique({ where: { key } });
      const d = assetData(a);
      const mudou = !atual || (['storageProvider', 'storageKey', 'externalUrl', 'mimeType', 'fileSize', 'visibility'] as const)
        .some((f) => !igual(atual[f], d[f])) || !igual(atual.metadata, a.metadata);
      assetsPlano.push({
        key, acao: !atual ? 'criar' : mudou ? 'atualizar' : 'igual',
        antes: atual ? (atual.externalUrl ? host(atual.externalUrl) : atual.storageKey ?? '') : '—',
        depois: a.externalUrl ? host(a.externalUrl) : a.storageKey ?? '',
      });
    }

    // Aulas em vídeo.
    const aulasPlano: { modulo: string; slug: string; acao: 'criar' | 'atualizar' | 'igual'; titulo: string; tituloAntes: string; duracao: number | null }[] = [];
    const sobras: string[] = [];
    for (const m of modulos) {
      const mod = await prisma.module.findUnique({ where: { collectionId_slug: { collectionId: basta.id, slug: m.slug } } });
      if (!mod) throw new Error(`Módulo "${m.slug}" não existe no banco. Rode antes: npm run seed:content`);
      const noBanco = await prisma.lesson.findMany({ where: { moduleId: mod.id }, include: { media: { select: { key: true } }, thumbnail: { select: { key: true } } } });
      const doArquivo = m.lessons.filter((l) => l.lessonType === 'video');
      for (const l of doArquivo) {
        const atual = noBanco.find((x) => x.slug === l.slug);
        const mudou = !atual || atual.title !== l.title || atual.description !== (l.description ?? null) || atual.media?.key !== l.media
          || atual.thumbnail?.key !== l.thumbnail || atual.durationSeconds !== (l.durationSeconds ?? null)
          || atual.requiredForCompletion !== l.requiredForCompletion || atual.status !== l.status
          || atual.displayOrder !== l.displayOrder || !igual(atual.metadata, l.metadata);
        aulasPlano.push({ modulo: m.slug, slug: l.slug, acao: !atual ? 'criar' : mudou ? 'atualizar' : 'igual', titulo: l.title, tituloAntes: atual?.title ?? '—', duracao: l.durationSeconds ?? null });
      }
      for (const x of noBanco) if (x.lessonType === 'video' && !doArquivo.some((l) => l.slug === x.slug)) sobras.push(`${m.slug}/${x.slug} (${x.title}, ${x.status})`);
    }

    // Impacto em quem já concluiu: a conclusão certificada é preservada; as demais passam a exigir as aulas novas.
    const obrigatoriasAntes = await prisma.lesson.count({ where: { requiredForCompletion: true, status: 'published', module: { collectionId: basta.id, status: 'published' } } });
    const novasObrigatorias = aulasPlano.filter((a) => a.acao === 'criar').length;
    const concluidas = await prisma.enrollment.count({ where: { collectionId: basta.id, completedAt: { not: null } } });
    const certificados = await prisma.certificate.count({ where: { enrollment: { collectionId: basta.id } } });

    console.log(`\nAulas em vídeo do BASTA (${aulasPlano.length}):`);
    console.table(aulasPlano.map((a) => ({ etapa: a.modulo, aula: a.slug, acao: a.acao, titulo: a.titulo.slice(0, 60), antes: a.acao === 'atualizar' && a.tituloAntes !== a.titulo ? a.tituloAntes.slice(0, 45) : '', duracao: a.duracao })));
    const resumoAssets = assetsPlano.reduce<Record<string, number>>((r, a) => ({ ...r, [a.acao]: (r[a.acao] ?? 0) + 1 }), {});
    console.log('Mídias:', resumoAssets);
    console.table(assetsPlano.filter((a) => a.acao !== 'igual').slice(0, 12).map((a) => ({ midia: a.key, acao: a.acao, antes: a.antes, depois: a.depois })));
    if (sobras.length) console.log('Aulas em vídeo no banco que não estão no arquivo (mantidas como estão):', sobras);
    console.log(`Aulas obrigatórias publicadas: ${obrigatoriasAntes} hoje; +${novasObrigatorias} novas.`);
    console.log(`Matrículas concluídas: ${concluidas} (certificados emitidos: ${certificados}; continuam válidos).`);

    if (!aplicar) {
      console.log('\nSIMULAÇÃO: nada foi gravado. Para aplicar: npm run midia:r2 -- --aplicar');
      return;
    }

    await prisma.$transaction(async (tx) => {
      const ids = new Map<string, string>();
      for (const key of chaves) {
        const d = assetData(porChave.get(key)!);
        const row = await tx.mediaAsset.upsert({ where: { key }, create: { key, ...d }, update: d });
        ids.set(key, row.id);
      }
      for (const m of modulos) {
        const mod = await tx.module.findUniqueOrThrow({ where: { collectionId_slug: { collectionId: basta.id, slug: m.slug } } });
        for (const l of m.lessons.filter((x) => x.lessonType === 'video')) {
          const d = {
            title: l.title, description: l.description ?? null, lessonType: l.lessonType,
            mediaAssetId: l.media ? ids.get(l.media)! : null, thumbnailAssetId: l.thumbnail ? ids.get(l.thumbnail)! : null,
            durationSeconds: l.durationSeconds ?? null, requiredForCompletion: l.requiredForCompletion, status: l.status,
            displayOrder: l.displayOrder, metadata: l.metadata ?? Prisma.JsonNull,
          };
          await tx.lesson.upsert({ where: { moduleId_slug: { moduleId: mod.id, slug: l.slug } }, create: { moduleId: mod.id, slug: l.slug, ...d }, update: d });
        }
      }
      await tx.auditLog.create({
        data: {
          action: 'content.media_r2_applied', entityType: 'collection', entityId: basta.id,
          metadata: { midias: resumoAssets, aulasCriadas: novasObrigatorias, aulasAtualizadas: aulasPlano.filter((a) => a.acao === 'atualizar').length },
        },
      });
    }, { timeout: 60_000 });
    console.log('\nAPLICADO. Vídeos do BASTA servidos pelo R2.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
