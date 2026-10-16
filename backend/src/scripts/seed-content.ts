/**
 * Importa o catálogo (coleções, módulos, aulas, referências de mídia) de content/catalog.json.
 *   npm run seed:content            → só cria o que falta (seguro em produção; nunca apaga nem sobrescreve)
 *   npm run seed:content -- --update → também atualiza os itens existentes com o conteúdo do arquivo
 */
import { PrismaClient } from '@prisma/client';
import { loadCatalogContent, seedCatalog } from '../catalog/content-seed';

async function main() {
  const prisma = new PrismaClient();
  try {
    const update = process.argv.includes('--update');
    const counts = await seedCatalog(prisma, loadCatalogContent(), { update });
    console.log(`Catálogo ${update ? 'sincronizado' : 'importado (somente criação)'}:`, counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
