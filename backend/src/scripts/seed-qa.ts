/**
 * Contas e escolas de TESTE para validar os fluxos (pode rodar em produção, com confirmação explícita).
 *
 *   QA_SEED=sim npm run seed:qa                 → cria/atualiza o cenário de QA
 *   QA_SEED=sim npm run seed:qa -- --desativar  → desativa contas e escolas de QA (nada é apagado)
 *
 * - E-mails no domínio reservado .test (nunca recebem e-mail real).
 * - Senha: QA_PASSWORD (12+ caracteres) ou gerada agora e mostrada UMA vez no terminal.
 * - Não mexe em nenhuma conta, escola ou matrícula fora do cenário de QA.
 */
import { randomBytes } from 'node:crypto';
import { MembershipRole, PrismaClient, RecordStatus, UserStatus } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { loadCatalogContent, seedCatalog } from '../catalog/content-seed';
import { QA_DOMINIO } from '../common/qa';

const DOMINIO = QA_DOMINIO;
const ESCOLAS = [
  { slug: 'qa-escola-alfa', name: 'Escola QA Alfa (testes)', region: 'Nordeste', state: 'BA', city: 'Salvador', liberarBasta: true },
  { slug: 'qa-escola-beta', name: 'Escola QA Beta (testes)', region: 'Sudeste', state: 'SP', city: 'Campinas', liberarBasta: false },
];
// cenario: o que a conta permite testar.
const PESSOAS: { email: string; name: string; escola: string; role: MembershipRole; matricular?: boolean; faltam?: number; cenario: string }[] = [
  { email: `coord.alfa${DOMINIO}`, name: 'QA Coordenação Alfa', escola: 'qa-escola-alfa', role: 'coordinator', cenario: 'coordena a Alfa (BASTA liberado): convidar, matricular, revogar, relatórios' },
  { email: `prof1.alfa${DOMINIO}`, name: 'QA Professora Um', escola: 'qa-escola-alfa', role: 'professor', matricular: true, cenario: 'matriculada, sem progresso: assistir do zero até o certificado' },
  { email: `prof2.alfa${DOMINIO}`, name: 'QA Professor Dois', escola: 'qa-escola-alfa', role: 'professor', matricular: true, faltam: 1, cenario: 'matriculado, falta 1 aula obrigatória: concluir e emitir certificado rápido' },
  { email: `prof3.alfa${DOMINIO}`, name: 'QA Professora Três', escola: 'qa-escola-alfa', role: 'professor', cenario: 'vinculada sem matrícula: vê o BASTA bloqueado até a coordenação matricular' },
  { email: `coord.beta${DOMINIO}`, name: 'QA Coordenação Beta', escola: 'qa-escola-beta', role: 'coordinator', cenario: 'coordena a Beta (sem liberação): pedir liberação ao administrador' },
  { email: `prof.beta${DOMINIO}`, name: 'QA Professor Beta', escola: 'qa-escola-beta', role: 'professor', cenario: 'escola sem liberação: tudo bloqueado' },
];

async function main() {
  if (process.env.QA_SEED !== 'sim') throw new Error('Confirme com QA_SEED=sim (cria contas de teste com senha conhecida).');
  const prisma = new PrismaClient();
  try {
    if (process.argv.includes('--desativar')) {
      const u = await prisma.user.updateMany({ where: { email: { endsWith: DOMINIO } }, data: { status: UserStatus.disabled } });
      await prisma.session.updateMany({ where: { user: { email: { endsWith: DOMINIO } }, revokedAt: null }, data: { revokedAt: new Date() } });
      const i = await prisma.institution.updateMany({ where: { slug: { in: ESCOLAS.map((e) => e.slug) } }, data: { status: RecordStatus.inactive } });
      console.log(`QA desativado: ${u.count} contas e ${i.count} escolas (nada foi apagado).`);
      return;
    }

    const senha = process.env.QA_PASSWORD || `Qa-${randomBytes(9).toString('base64url')}`;
    if (senha.length < 12) throw new Error('QA_PASSWORD precisa de pelo menos 12 caracteres.');
    const passwordHash = await new PasswordService().hash(senha);

    await seedCatalog(prisma, loadCatalogContent());
    const basta = await prisma.collection.findUniqueOrThrow({ where: { slug: 'basta' } });
    const org = await prisma.organization.upsert({ where: { slug: 'rede-qa' }, update: {}, create: { name: 'Rede QA (testes)', slug: 'rede-qa' } });

    const escolas: Record<string, string> = {};
    for (const e of ESCOLAS) {
      const { liberarBasta, ...dados } = e;
      const inst = await prisma.institution.upsert({
        where: { slug: e.slug }, update: { status: RecordStatus.active }, create: { ...dados, organizationId: org.id },
      });
      escolas[e.slug] = inst.id;
      if (!liberarBasta) {
        // Volta ao ponto de partida: escola sem liberação (registro mantido como revogado).
        await prisma.institutionCollectionAccess.updateMany({ where: { institutionId: inst.id, collectionId: basta.id }, data: { status: 'revoked', revokedAt: new Date() } });
      } else {
        await prisma.institutionCollectionAccess.upsert({
          where: { institutionId_collectionId: { institutionId: inst.id, collectionId: basta.id } },
          update: { status: 'active', revokedAt: null, expiresAt: null }, create: { institutionId: inst.id, collectionId: basta.id },
        });
      }
    }

    const obrigatorias = await prisma.lesson.findMany({
      where: { module: { collectionId: basta.id, status: 'published' }, status: 'published', requiredForCompletion: true },
      orderBy: [{ module: { displayOrder: 'asc' } }, { displayOrder: 'asc' }], select: { id: true },
    });

    for (const p of PESSOAS) {
      // Reaplicar o seed volta a conta ao ponto de partida do cenário (senha, status, boas-vindas e progresso).
      const user = await prisma.user.upsert({
        where: { email: p.email },
        update: { name: p.name, passwordHash, status: UserStatus.active, welcomeSeenAt: null, failedLoginCount: 0, lockedUntil: null },
        create: { email: p.email, name: p.name, passwordHash, emailVerifiedAt: new Date() },
      });
      const institutionId = escolas[p.escola];
      await prisma.membership.upsert({
        where: { userId_institutionId: { userId: user.id, institutionId } },
        update: { role: p.role, status: RecordStatus.active }, create: { userId: user.id, institutionId, role: p.role },
      });
      if (!p.matricular) {
        // Volta a 'nunca matriculado(a)': só contas de QA; certificados primeiro (progresso e feedback saem em cascata).
        await prisma.certificate.deleteMany({ where: { enrollment: { institutionId, userId: user.id } } });
        await prisma.enrollment.deleteMany({ where: { institutionId, userId: user.id } });
        continue;
      }
      const e = await prisma.enrollment.upsert({
        where: { institutionId_userId_collectionId: { institutionId, userId: user.id, collectionId: basta.id } },
        update: { status: 'active', revokedAt: null, completedAt: null },
        create: { institutionId, userId: user.id, collectionId: basta.id },
      });
      await prisma.certificate.deleteMany({ where: { enrollmentId: e.id } });
      await prisma.lessonProgress.deleteMany({ where: { enrollmentId: e.id } });
      for (const a of p.faltam === undefined ? [] : obrigatorias.slice(0, Math.max(0, obrigatorias.length - p.faltam))) {
        await prisma.lessonProgress.create({
          data: { enrollmentId: e.id, lessonId: a.id, status: 'completed', completedAt: new Date(), completionSource: 'manual' },
        });
      }
    }
    await prisma.auditLog.create({ data: { action: 'qa.seed_applied', entityType: 'system', metadata: { contas: PESSOAS.length, escolas: ESCOLAS.length } } });

    console.log('\nCenário de QA pronto. Senha de todas as contas (mostrada só agora):', senha);
    console.table(PESSOAS.map((p) => ({ email: p.email, papel: p.role === 'coordinator' ? 'coordenação' : 'professor(a)', escola: p.escola, cenario: p.cenario })));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
