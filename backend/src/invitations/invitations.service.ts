import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Invitation, Prisma, RecordStatus, UserStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { AccessPolicy } from '../access/access-policy.service';
import { AuditService } from '../audit/audit.service';
import { assertSenhaSemEspacosNasPontas, PasswordService } from '../auth/password.service';
import { SessionService } from '../auth/session.service';
import type { Actor } from '../common/actor';
import { hashToken, newToken, normalizeEmail } from '../common/tokens';
import { pageArgs, pageResult } from '../common/pagination';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ehContaDeTeste } from '../common/qa';
import { AcceptInvitationDto, CreateInvitationDto, ListInvitationsQuery } from './invitations.dto';

export const CONVITE_INVALIDO = 'Convite inválido, expirado ou já utilizado.';

const INVITATION_SELECT = {
  id: true, institutionId: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.InvitationSelect;

type InvitationRow = Prisma.InvitationGetPayload<{ select: typeof INVITATION_SELECT }>;

function statusOf(i: Pick<Invitation, 'acceptedAt' | 'revokedAt' | 'expiresAt'>) {
  if (i.acceptedAt) return 'accepted';
  if (i.revokedAt) return 'revoked';
  return i.expiresAt <= new Date() ? 'expired' : 'pending';
}
const present = (i: InvitationRow) => ({ ...i, status: statusOf(i) });

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessPolicy,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async create(actor: Actor, institutionId: string, dto: CreateInvitationDto) {
    this.access.assertCanInvite(actor, institutionId, dto.role);
    const institution = await this.prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true, status: true } });
    if (!institution) throw new NotFoundException('Instituição não encontrada.');
    if (institution.status !== RecordStatus.active) throw new BadRequestException('Instituição inativa não pode receber convites.');

    const email = normalizeEmail(dto.email);
    // Contas de teste (seletor público de login) não podem disparar convites para pessoas reais.
    if (ehContaDeTeste(actor.email) && !email.endsWith('.test')) {
      throw new BadRequestException('Contas de teste só podem convidar e-mails de teste (terminados em .test).');
    }
    const jaVinculado = await this.prisma.membership.findFirst({
      where: { institutionId, status: RecordStatus.active, user: { email } }, select: { id: true },
    });
    if (jaVinculado) throw new ConflictException('Este e-mail já possui vínculo ativo com a instituição.');

    const token = newToken();
    const invitation = await this.prisma.$transaction(async (tx) => {
      // Um convite pendente por e-mail e instituição: o novo substitui os anteriores.
      await tx.invitation.updateMany({
        where: { institutionId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const inv = await tx.invitation.create({
        data: {
          institutionId, email, role: dto.role, tokenHash: hashToken(token), createdById: actor.userId,
          expiresAt: new Date(Date.now() + this.config.inviteTtlHours * 3600_000),
        },
        select: INVITATION_SELECT,
      });
      await this.audit.record({
        actorUserId: actor.userId, institutionId, action: 'invitation.created', entityType: 'invitation', entityId: inv.id,
        metadata: { email, role: dto.role },
      }, tx);
      return inv;
    });

    let emailSent = true;
    try {
      await this.mail.sendInvitation(email, {
        institution: institution.name, role: dto.role, expiresAt: invitation.expiresAt,
        link: `${this.config.appUrl}/convite?token=${encodeURIComponent(token)}`,
      });
    } catch (e) {
      emailSent = false;
      this.logger.error(`Falha ao enviar convite ${invitation.id}: ${(e as Error).message}`);
    }
    // O token nunca é devolvido pela API: só chega ao convidado por e-mail.
    return { ...present(invitation), emailSent };
  }

  async list(actor: Actor, institutionId: string) {
    this.access.assertCanManageMembers(actor, institutionId);
    const rows = await this.prisma.invitation.findMany({ where: { institutionId }, select: INVITATION_SELECT, orderBy: { createdAt: 'desc' }, take: 200 });
    return { items: rows.map(present) };
  }

  async revoke(actor: Actor, institutionId: string, invitationId: string) {
    this.access.assertCanManageMembers(actor, institutionId);
    const inv = await this.prisma.invitation.findFirst({ where: { id: invitationId, institutionId } });
    if (!inv) throw new NotFoundException('Convite não encontrado nesta instituição.');
    this.access.assertCanInvite(actor, institutionId, inv.role);
    if (statusOf(inv) !== 'pending') throw new BadRequestException('Somente convites pendentes podem ser revogados.');
    await this.prisma.$transaction(async (tx) => {
      await tx.invitation.update({ where: { id: inv.id }, data: { revokedAt: new Date() } });
      await this.audit.record({ actorUserId: actor.userId, institutionId, action: 'invitation.revoked', entityType: 'invitation', entityId: inv.id }, tx);
    });
  }

  /** Reenvia: gera um novo token (o anterior deixa de valer) e manda outro e-mail. */
  async resend(actor: Actor, institutionId: string, invitationId: string) {
    this.access.assertCanManageMembers(actor, institutionId);
    const inv = await this.prisma.invitation.findFirst({ where: { id: invitationId, institutionId } });
    if (!inv) throw new NotFoundException('Convite não encontrado nesta instituição.');
    this.access.assertCanInvite(actor, institutionId, inv.role);
    if (inv.acceptedAt) throw new BadRequestException('Este convite já foi aceito.');
    return this.create(actor, institutionId, { email: inv.email, role: inv.role });
  }

  /** Visão global (administrador): convites de todas as instituições, com filtros e paginação. */
  async listAll(q: ListInvitationsQuery) {
    const now = new Date();
    const byStatus: Record<string, Prisma.InvitationWhereInput> = {
      pending: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      accepted: { acceptedAt: { not: null } },
      revoked: { revokedAt: { not: null } },
      expired: { acceptedAt: null, revokedAt: null, expiresAt: { lte: now } },
    };
    const where: Prisma.InvitationWhereInput = {
      institutionId: q.institutionId, role: q.role,
      ...(q.status ? byStatus[q.status] : {}),
      ...(q.q ? { email: { contains: q.q.toLowerCase() } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.invitation.findMany({
        where, ...pageArgs(q), orderBy: { createdAt: q.order ?? 'desc' },
        select: { ...INVITATION_SELECT, institution: { select: { id: true, name: true } } },
      }),
      this.prisma.invitation.count({ where }),
    ]);
    return pageResult(rows.map((r) => ({ ...r, status: statusOf(r) })), total, q);
  }

  /** Dados mínimos para a tela de aceite. Mesma resposta para qualquer convite inutilizável. */
  async preview(token: string) {
    const inv = await this.findUsable(token);
    const conta = await this.prisma.user.findUnique({ where: { email: inv.email }, select: { id: true } });
    return { email: inv.email, role: inv.role, institution: { name: inv.institution.name }, accountExists: !!conta, expiresAt: inv.expiresAt };
  }

  async accept(dto: AcceptInvitationDto, req: Request, res: Response) {
    const inv = await this.findUsable(dto.token);
    const existing = await this.prisma.user.findUnique({ where: { email: inv.email } });

    let newPasswordHash: string | undefined;
    if (existing) {
      if (existing.status !== UserStatus.active) throw new ForbiddenException('A conta vinculada a este e-mail está desativada.');
      if (existing.passwordHash && !(await this.passwords.verify(existing.passwordHash, dto.password))) {
        throw new UnauthorizedException('Já existe uma conta com este e-mail. Informe a senha atual dessa conta para aceitar o convite.');
      }
      if (!existing.passwordHash) {
        assertSenhaSemEspacosNasPontas(dto.password);
        newPasswordHash = await this.passwords.hash(dto.password);
      }
    } else {
      if (!dto.name?.trim()) throw new BadRequestException('Informe seu nome completo.');
      assertSenhaSemEspacosNasPontas(dto.password);
      newPasswordHash = await this.passwords.hash(dto.password);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Consumo atômico: em aceites simultâneos, apenas um encontra o convite ainda disponível.
        const consumido = await tx.invitation.updateMany({
          where: { id: inv.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
          data: { acceptedAt: new Date() },
        });
        if (consumido.count !== 1) throw new BadRequestException(CONVITE_INVALIDO);

        const user = existing
          ? await tx.user.update({
            where: { id: existing.id },
            data: { emailVerifiedAt: existing.emailVerifiedAt ?? new Date(), ...(newPasswordHash ? { passwordHash: newPasswordHash } : {}) },
          })
          : await tx.user.create({
            data: { name: dto.name!.trim(), email: inv.email, passwordHash: newPasswordHash, emailVerifiedAt: new Date() },
          });

        await tx.membership.upsert({
          where: { userId_institutionId: { userId: user.id, institutionId: inv.institutionId } },
          create: { userId: user.id, institutionId: inv.institutionId, role: inv.role },
          update: { role: inv.role, status: RecordStatus.active },
        });
        await tx.invitation.update({ where: { id: inv.id }, data: { acceptedUserId: user.id } });
        await this.audit.record({
          actorUserId: user.id, institutionId: inv.institutionId, action: 'invitation.accepted', entityType: 'invitation', entityId: inv.id,
          metadata: { role: inv.role, newAccount: !existing },
        }, tx);
        await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
        await this.sessions.create(user.id, req, res, tx);
        inv.acceptedUserId = user.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Já existe uma conta com este e-mail. Tente aceitar o convite novamente.');
      }
      throw e;
    }
    return this.users.profile(inv.acceptedUserId!);
  }

  private async findUsable(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { institution: { select: { name: true, status: true } } },
    });
    if (!inv || statusOf(inv) !== 'pending' || inv.institution.status !== RecordStatus.active) {
      throw new BadRequestException(CONVITE_INVALIDO);
    }
    return inv;
  }
}
