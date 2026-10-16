import { Inject, Injectable } from '@nestjs/common';
import { Prisma, RecordStatus, UserStatus } from '@prisma/client';
import type { CookieOptions, Request, Response } from 'express';
import type { Actor } from '../common/actor';
import { hashToken, newToken } from '../common/tokens';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax', path: '/' };
  }

  async create(userId: string, req: Request, res: Response, db: Db = this.prisma): Promise<void> {
    const token = newToken();
    const ttlMs = this.config.sessionTtlHours * 3600 * 1000;
    await db.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
        ip: req.ip?.slice(0, 64),
        userAgent: req.get('user-agent')?.slice(0, 400),
      },
    });
    res.cookie(this.config.sessionCookieName, token, { ...this.cookieOptions(), maxAge: ttlMs });
  }

  clearCookie(res: Response): void {
    res.clearCookie(this.config.sessionCookieName, this.cookieOptions());
  }

  readToken(req: Request): string | undefined {
    const value = req.cookies?.[this.config.sessionCookieName];
    return typeof value === 'string' && value.length >= 32 && value.length <= 128 ? value : undefined;
  }

  /** Resolve o cookie em um Actor; null se a sessão não existe, expirou, foi revogada ou a conta está desativada. */
  async resolve(token: string): Promise<Actor | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        user: {
          select: {
            id: true, email: true, status: true,
            platformRoles: { select: { role: true } },
            memberships: {
              where: { status: RecordStatus.active, institution: { status: RecordStatus.active } },
              select: { id: true, institutionId: true, role: true },
            },
          },
        },
      },
    });
    const now = Date.now();
    if (!session || session.revokedAt || session.expiresAt.getTime() <= now) return null;
    if (session.user.status !== UserStatus.active) return null;

    if (now - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date(now) } });
    }
    return {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      isPlatformAdmin: session.user.platformRoles.some((r) => r.role === 'platform_admin'),
      memberships: session.user.memberships,
    };
  }

  revoke(sessionId: string) {
    return this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  revokeAllForUser(userId: string, db: Db = this.prisma) {
    return db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
