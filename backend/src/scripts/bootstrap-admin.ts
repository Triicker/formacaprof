/**
 * Cria o primeiro administrador geral da plataforma.
 *
 *   ADMIN_EMAIL=... ADMIN_NAME="..." ADMIN_PASSWORD=... npm run admin:bootstrap
 *
 * - A senha vem do ambiente (nunca do código) e é gravada apenas como hash Argon2id.
 * - Recusa executar se já existir um administrador geral (papéis globais não são concedidos pela API).
 * - Se o e-mail já tiver conta, apenas concede o papel, sem alterar a senha.
 */
import { PrismaClient } from '@prisma/client';
import { PasswordService } from '../auth/password.service';
import { normalizeEmail } from '../common/tokens';

async function main() {
  const email = normalizeEmail(process.env.ADMIN_EMAIL ?? '');
  const name = (process.env.ADMIN_NAME ?? '').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Defina ADMIN_EMAIL com um e-mail válido.');
  if (name.length < 3) throw new Error('Defina ADMIN_NAME (mínimo 3 caracteres).');

  const prisma = new PrismaClient();
  try {
    const existente = await prisma.platformRoleGrant.count({ where: { role: 'platform_admin' } });
    if (existente > 0) throw new Error('Já existe um administrador geral. Bootstrap não executado.');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user && password.length < 12) throw new Error('Defina ADMIN_PASSWORD com pelo menos 12 caracteres.');
    const passwordHash = user ? undefined : await new PasswordService().hash(password);

    await prisma.$transaction(async (tx) => {
      const admin = user ?? await tx.user.create({ data: { email, name, passwordHash, emailVerifiedAt: new Date() } });
      await tx.platformRoleGrant.create({ data: { userId: admin.id, role: 'platform_admin' } });
      await tx.auditLog.create({
        data: { actorUserId: null, action: 'platform_role.granted', entityType: 'user', entityId: admin.id, metadata: { role: 'platform_admin', via: 'bootstrap' } },
      });
    });
    console.log(`Administrador geral configurado para ${email}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
