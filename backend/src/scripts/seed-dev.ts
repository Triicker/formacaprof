/**
 * Dados de demonstração para desenvolvimento local. Bloqueado em staging/produção.
 *   npm run seed:dev   (senha dos usuários: DEMO_PASSWORD, padrão "professor123")
 */
import { MembershipRole, PrismaClient } from '@prisma/client';
import { loadCatalogContent, seedCatalog } from '../catalog/content-seed';
import { PasswordService } from '../auth/password.service';

async function main() {
  const env = process.env.NODE_ENV ?? 'development';
  if (env !== 'development' && env !== 'test') throw new Error(`Seed de demonstração bloqueado em NODE_ENV=${env}.`);

  const prisma = new PrismaClient();
  const passwordHash = await new PasswordService().hash(process.env.DEMO_PASSWORD || 'professor123');
  try {
    const org = await prisma.organization.upsert({
      where: { slug: 'rede-demo' }, update: {}, create: { name: 'Rede Municipal de Demonstração', slug: 'rede-demo' },
    });
    const escola = await prisma.institution.upsert({
      where: { slug: 'em-carolina-de-jesus' }, update: {},
      create: { name: 'EM Carolina de Jesus', slug: 'em-carolina-de-jesus', region: 'Nordeste', city: 'Salvador', state: 'BA', organizationId: org.id },
    });
    const outra = await prisma.institution.upsert({
      where: { slug: 'ee-machado-de-assis' }, update: {},
      create: { name: 'EE Machado de Assis', slug: 'ee-machado-de-assis', region: 'Nordeste', city: 'Salvador', state: 'BA', organizationId: org.id },
    });

    const pessoas: { email: string; name: string; inst?: string; role?: MembershipRole; admin?: boolean }[] = [
      { email: 'admin@etica.dev', name: 'Administração Ética', admin: true },
      { email: 'coordenacao@etica.dev', name: 'Carla Coordenadora', inst: escola.id, role: 'coordinator' },
      { email: 'ana@etica.com', name: 'Ana Maria', inst: escola.id, role: 'professor' },
      { email: 'bruno@etica.dev', name: 'Bruno Professor', inst: outra.id, role: 'professor' },
    ];
    for (const p of pessoas) {
      const user = await prisma.user.upsert({
        where: { email: p.email }, update: {}, create: { email: p.email, name: p.name, passwordHash, emailVerifiedAt: new Date() },
      });
      if (p.admin) {
        await prisma.platformRoleGrant.upsert({
          where: { userId_role: { userId: user.id, role: 'platform_admin' } }, update: {}, create: { userId: user.id, role: 'platform_admin' },
        });
      }
      if (p.inst && p.role) {
        await prisma.membership.upsert({
          where: { userId_institutionId: { userId: user.id, institutionId: p.inst } }, update: {},
          create: { userId: user.id, institutionId: p.inst, role: p.role },
        });
      }
    }
    // Catálogo + BASTA liberado para a EM Carolina de Jesus, com Ana e a coordenação matriculadas.
    await seedCatalog(prisma, loadCatalogContent());
    const basta = await prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
    await prisma.institutionCollectionAccess.upsert({
      where: { institutionId_collectionId: { institutionId: escola.id, collectionId: basta.id } }, update: {},
      create: { institutionId: escola.id, collectionId: basta.id },
    });
    for (const email of ['ana@etica.com', 'coordenacao@etica.dev']) {
      const u = await prisma.user.findUniqueOrThrow({ where: { email } });
      const e = await prisma.enrollment.upsert({
        where: { institutionId_userId_collectionId: { institutionId: escola.id, userId: u.id, collectionId: basta.id } }, update: {},
        create: { institutionId: escola.id, userId: u.id, collectionId: basta.id },
      });
      if (email !== 'ana@etica.com') continue;
      // Mesmo ponto de partida da demonstração mockada: 12 aulas concluídas (8 dos Anos iniciais + 4 dos Anos finais).
      const aulas = await prisma.lesson.findMany({
        where: { module: { collectionId: basta.id, slug: { in: ['anos-iniciais', 'anos-finais'] } }, requiredForCompletion: true },
        orderBy: [{ module: { displayOrder: 'asc' } }, { displayOrder: 'asc' }],
      });
      const concluidas = [...aulas.filter((a) => a.slug.startsWith('anos-iniciais')).slice(0, 8), ...aulas.filter((a) => a.slug.startsWith('anos-finais')).slice(0, 4)];
      for (const a of concluidas) {
        await prisma.lessonProgress.upsert({
          where: { enrollmentId_lessonId: { enrollmentId: e.id, lessonId: a.id } }, update: {},
          create: { enrollmentId: e.id, lessonId: a.id, status: 'completed', completedAt: new Date(), completionSource: 'manual' },
        });
      }
    }
    console.log('Seed de demonstração aplicado:', pessoas.map((p) => p.email).join(', '));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
