import {
  BadRequestException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { ehContaDeTeste, QA_DOMINIO } from '../common/qa';
import { hashToken, newToken, normalizeEmail } from '../common/tokens';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { assertSenhaSemEspacosNasPontas, PasswordService } from './password.service';
import { SessionService } from './session.service';

export const CREDENCIAIS_INVALIDAS = 'E-mail ou senha inválidos.';
export const MUITAS_TENTATIVAS = 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
const LINK_INVALIDO = 'Link inválido ou expirado. Solicite uma nova redefinição de senha.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(emailRaw: string, password: string, req: Request, res: Response) {
    const email = normalizeEmail(emailRaw);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      await this.passwords.verifyDummy(password);
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(MUITAS_TENTATIVAS, HttpStatus.TOO_MANY_REQUESTS);
    }

    if (!(await this.passwords.verify(user.passwordHash, password))) {
      const falhas = user.failedLoginCount + 1;
      const bloquear = falhas >= this.config.loginMaxAttempts;
      await this.prisma.user.update({
        where: { id: user.id },
        data: bloquear
          ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + this.config.loginLockMinutes * 60_000) }
          : { failedLoginCount: falhas },
      });
      if (bloquear) {
        await this.audit.record({
          actorUserId: user.id, action: 'auth.login_locked', entityType: 'user', entityId: user.id, metadata: { ip: req.ip ?? null },
        });
        throw new HttpException(MUITAS_TENTATIVAS, HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new UnauthorizedException(CREDENCIAIS_INVALIDAS);
    }

    if (user.status !== UserStatus.active) {
      throw new ForbiddenException('Sua conta está desativada. Procure a coordenação da sua instituição.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
      await this.sessions.create(user.id, req, res, tx);
    });
    return this.users.profile(user.id);
  }

  /**
   * Contas de teste ativas, para o seletor da tela de login. Vazio quando o modo está desligado
   * (QA_LOGIN_RAPIDO=nao) ou quando o seed:qa foi desativado: aí o seletor some sozinho.
   */
  async qaAccounts() {
    if (!this.config.qaQuickLogin) return { items: [] };
    const users = await this.prisma.user.findMany({
      where: { email: { endsWith: QA_DOMINIO }, status: UserStatus.active, platformRoles: { none: {} } },
      select: { email: true, name: true, memberships: { where: { status: 'active' }, select: { role: true, institution: { select: { name: true } } } } },
      orderBy: { email: 'asc' },
    });
    // Ordem de leitura: por escola, coordenação primeiro, depois pelo e-mail.
    const items = users.map((u) => ({ email: u.email, name: u.name, role: u.memberships[0]?.role ?? null, institution: u.memberships[0]?.institution.name ?? null }));
    items.sort((a, b) => (a.institution ?? '').localeCompare(b.institution ?? '') || Number(a.role !== 'coordinator') - Number(b.role !== 'coordinator') || a.email.localeCompare(b.email));
    return { items };
  }

  /** Entra numa conta de TESTE sem senha (só domínio de QA, só com o modo ligado, nunca administrador). */
  async qaLogin(emailRaw: string, req: Request, res: Response) {
    const email = normalizeEmail(emailRaw);
    if (!this.config.qaQuickLogin || !ehContaDeTeste(email)) throw new NotFoundException('Conta de teste não encontrada.');
    const user = await this.prisma.user.findUnique({ where: { email }, include: { platformRoles: { select: { id: true } } } });
    if (!user || user.status !== UserStatus.active || user.platformRoles.length) throw new NotFoundException('Conta de teste não encontrada.');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await this.sessions.create(user.id, req, res, tx);
    });
    await this.audit.record({ actorUserId: user.id, action: 'auth.qa_login', entityType: 'user', entityId: user.id, metadata: { ip: req.ip ?? null } });
    return this.users.profile(user.id);
  }

  async logout(actor: Actor, res: Response) {
    await this.sessions.revoke(actor.sessionId);
    this.sessions.clearCookie(res);
  }

  /** Resposta idêntica exista ou não o e-mail, para não revelar quais contas existem. */
  async forgotPassword(emailRaw: string): Promise<void> {
    const email = normalizeEmail(emailRaw);
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true, status: true } });
    if (!user || user.status !== UserStatus.active) return;

    const token = newToken();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + this.config.resetTtlMinutes * 60_000) },
      }),
    ]);
    const link = `${this.config.appUrl}/redefinir-senha?token=${encodeURIComponent(token)}`;
    // Sem await: o tempo de resposta não deve depender do envio do e-mail.
    this.mail.sendPasswordReset(email, { link, minutes: this.config.resetTtlMinutes })
      .catch((e: Error) => this.logger.error(`Falha ao enviar e-mail de redefinição: ${e.message}`));
  }

  /** Token de uso único; ao redefinir, todas as sessões abertas do usuário são encerradas. */
  async resetPassword(token: string, password: string): Promise<void> {
    assertSenhaSemEspacosNasPontas(password);
    const passwordHash = await this.passwords.hash(password);
    await this.prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!record) throw new BadRequestException(LINK_INVALIDO);
      const consumido = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (consumido.count !== 1) throw new BadRequestException(LINK_INVALIDO);

      await tx.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginCount: 0, lockedUntil: null } });
      await this.sessions.revokeAllForUser(record.userId, tx);
      await this.audit.record({ actorUserId: record.userId, action: 'auth.password_reset', entityType: 'user', entityId: record.userId }, tx);
    });
  }
}
