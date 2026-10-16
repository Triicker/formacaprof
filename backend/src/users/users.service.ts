import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordStatus, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { PrismaService } from '../prisma/prisma.service';

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  status: true,
  emailVerifiedAt: true,
  lastLoginAt: true,
  welcomeSeenAt: true,
  createdAt: true,
  platformRoles: { select: { role: true } },
  memberships: {
    where: { status: RecordStatus.active, institution: { status: RecordStatus.active } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      status: true,
      institution: { select: { id: true, name: true, slug: true, region: true, city: true, state: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type Profile = Omit<Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>, 'platformRoles'> & {
  platformRoles: string[];
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Perfil público do usuário: nunca inclui hash de senha, sessões ou tokens. */
  async profile(userId: string): Promise<Profile> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    return { ...u, platformRoles: u.platformRoles.map((r) => r.role) };
  }

  async updateMe(actor: Actor, data: { name?: string; welcomeSeen?: boolean }) {
    const update: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.welcomeSeen) update.welcomeSeenAt = new Date();
    await this.prisma.user.update({ where: { id: actor.userId }, data: update });
    return this.profile(actor.userId);
  }

  list(params: { q?: string; take: number; skip: number }) {
    const where: Prisma.UserWhereInput = params.q
      ? { OR: [{ name: { contains: params.q, mode: 'insensitive' } }, { email: { contains: params.q.toLowerCase() } }] }
      : {};
    return this.prisma.$transaction([
      this.prisma.user.findMany({
        where, take: params.take, skip: params.skip, orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true,
          platformRoles: { select: { role: true } },
          memberships: { select: { id: true, role: true, status: true, institution: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
  }

  /** Administrador geral ativa/desativa contas. Desativar encerra todas as sessões do usuário. */
  async setStatus(actor: Actor, userId: string, status: UserStatus) {
    if (userId === actor.userId) throw new BadRequestException('Você não pode alterar o status da sua própria conta.');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({ where: { id: userId }, data: { status }, select: { id: true, status: true } })
        .catch(() => { throw new NotFoundException('Usuário não encontrado.'); });
      if (status === UserStatus.disabled) {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.record({ actorUserId: actor.userId, action: `user.${status}`, entityType: 'user', entityId: userId }, tx);
      return user;
    });
  }
}
