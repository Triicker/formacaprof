import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, RecordStatus, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import type { Actor } from '../common/actor';
import { pageArgs, pageResult } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AdminUpdateUserDto, ListUsersQuery, SetPlatformRoleDto } from './users.dto';

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

/** Campos expostos ao administrador: nunca hash de senha, tokens ou sessões em si. */
const ADMIN_LIST_SELECT = {
  id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true,
  platformRoles: { select: { role: true } },
  memberships: {
    orderBy: { createdAt: 'asc' },
    select: { id: true, role: true, status: true, institution: { select: { id: true, name: true, status: true } } },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly passwords: PasswordService) {}

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

  // ------------------------------------------------------------------ administração

  async list(q: ListUsersQuery) {
    const and: Prisma.UserWhereInput[] = [];
    if (q.q) and.push({ OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q.toLowerCase() } }] });
    if (q.status) and.push({ status: q.status });
    if (q.role === 'platform_admin') and.push({ platformRoles: { some: { role: 'platform_admin' } } });
    else if (q.role) and.push({ memberships: { some: { role: q.role, status: RecordStatus.active, ...(q.institutionId ? { institutionId: q.institutionId } : {}) } } });
    if (q.institutionId && q.role !== 'professor' && q.role !== 'coordinator') and.push({ memberships: { some: { institutionId: q.institutionId } } });
    const where: Prisma.UserWhereInput = and.length ? { AND: and } : {};
    const sort = q.sort ?? 'createdAt';
    const dir = q.order ?? (sort === 'name' ? 'asc' : 'desc');
    // `nulls` só é aceito em campo opcional (último acesso pode nunca ter ocorrido).
    const orderBy: Prisma.UserOrderByWithRelationInput = sort === 'lastLoginAt' ? { lastLoginAt: { sort: dir, nulls: 'last' } } : { [sort]: dir };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: ADMIN_LIST_SELECT, ...pageArgs(q), orderBy: [orderBy, { id: 'asc' }] }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(rows.map((u) => ({ ...u, platformRoles: u.platformRoles.map((r) => r.role) })), total, q);
  }

  async detail(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { ...ADMIN_LIST_SELECT, emailVerifiedAt: true, updatedAt: true } });
    if (!u) throw new NotFoundException('Usuário não encontrado.');
    const [sessoesAtivas, matriculas, convitesPendentes] = await Promise.all([
      this.prisma.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.enrollment.count({ where: { userId } }),
      this.prisma.invitation.findMany({
        where: { email: u.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, role: true, expiresAt: true, institution: { select: { id: true, name: true } } },
      }),
    ]);
    return { ...u, platformRoles: u.platformRoles.map((r) => r.role), activeSessions: sessoesAtivas, enrollments: matriculas, pendingInvitations: convitesPendentes };
  }

  /** Administrador altera nome e/ou status. Desativar a conta encerra todas as sessões. */
  async adminUpdate(actor: Actor, userId: string, dto: AdminUpdateUserDto) {
    if (dto.status && userId === actor.userId) throw new BadRequestException('Você não pode alterar o status da sua própria conta.');
    const before = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, status: true } });
    if (!before) throw new NotFoundException('Usuário não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { ...(dto.name !== undefined ? { name: dto.name.trim() } : {}), ...(dto.status ? { status: dto.status } : {}) },
        select: { id: true, name: true, status: true },
      });
      if (dto.status === UserStatus.disabled) {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const action = dto.status && dto.status !== before.status ? `user.${dto.status}` : 'user.updated';
      await this.audit.record({
        actorUserId: actor.userId, action, entityType: 'user', entityId: userId,
        metadata: { from: before, to: { name: user.name, status: user.status } },
      }, tx);
      return user;
    });
  }

  async revokeSessions(actor: Actor, userId: string) {
    if (!(await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } }))) throw new NotFoundException('Usuário não encontrado.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorUserId: actor.userId, action: 'user.sessions_revoked', entityType: 'user', entityId: userId, metadata: { count: r.count } }, tx);
      return { revoked: r.count };
    });
  }

  /**
   * Concede/remove o papel global de administrador. Restrito: exige a senha de quem executa,
   * justificativa e auditoria; não permite remover o próprio papel nem o último administrador.
   */
  async setPlatformRole(actor: Actor, userId: string, dto: SetPlatformRoleDto) {
    const self = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { passwordHash: true } });
    if (!self.passwordHash || !(await this.passwords.verify(self.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Senha atual incorreta.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true, platformRoles: { select: { role: true } } } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    const isAdmin = target.platformRoles.some((r) => r.role === 'platform_admin');

    if (dto.grant) {
      if (target.status !== UserStatus.active) throw new BadRequestException('A conta precisa estar ativa.');
      if (isAdmin) return { userId, platformRoles: ['platform_admin'] };
    } else {
      if (!isAdmin) return { userId, platformRoles: [] };
      if (userId === actor.userId) throw new BadRequestException('Você não pode remover o seu próprio papel de administrador.');
      if ((await this.prisma.platformRoleGrant.count({ where: { role: 'platform_admin' } })) <= 1) {
        throw new BadRequestException('Não é possível remover o último administrador geral.');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      if (dto.grant) await tx.platformRoleGrant.create({ data: { userId, role: 'platform_admin', grantedById: actor.userId } });
      else await tx.platformRoleGrant.deleteMany({ where: { userId, role: 'platform_admin' } });
      await this.audit.record({
        actorUserId: actor.userId, action: dto.grant ? 'platform_role.granted' : 'platform_role.revoked', entityType: 'user', entityId: userId,
        metadata: { role: 'platform_admin', justification: dto.justification.trim() },
      }, tx);
    });
    return { userId, platformRoles: dto.grant ? ['platform_admin'] : [] };
  }
}
