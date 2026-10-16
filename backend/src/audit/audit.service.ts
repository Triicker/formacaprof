import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { pageArgs, pageResult, PageQuery, periodFilter } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorUserId?: string | null;
  institutionId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /** Nunca incluir senhas, tokens ou hashes. */
  metadata?: Prisma.InputJsonValue;
}

export interface AuditFilters {
  institutionId?: string;
  action?: string;
  actionPrefix?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  /** Tudo que envolve a pessoa: ações dela, sobre ela ou sobre seus vínculos/matrículas. */
  subjectUserId?: string;
  from?: Date;
  to?: Date;
}

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Aceita um cliente de transação para que o registro seja atômico com a ação auditada. */
  record(entry: AuditEntry, db: Db = this.prisma) {
    return db.auditLog.create({ data: entry });
  }

  where(f: AuditFilters): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (f.institutionId) and.push({ institutionId: f.institutionId });
    if (f.action) and.push({ action: f.action });
    if (f.actionPrefix) and.push({ action: { startsWith: f.actionPrefix } });
    if (f.actorUserId) and.push({ actorUserId: f.actorUserId });
    if (f.entityType) and.push({ entityType: f.entityType });
    if (f.entityId) and.push({ entityId: f.entityId });
    if (f.subjectUserId) {
      and.push({
        OR: [
          { actorUserId: f.subjectUserId },
          { entityType: 'user', entityId: f.subjectUserId },
          { metadata: { path: ['userId'], equals: f.subjectUserId } },
        ],
      });
    }
    const period = periodFilter(f.from, f.to);
    if (period) and.push({ createdAt: period });
    return and.length ? { AND: and } : {};
  }

  async list(f: AuditFilters, q: PageQuery) {
    const where = this.where(f);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where, orderBy: { createdAt: q.order ?? 'desc' }, ...pageArgs(q),
        include: {
          actor: { select: { id: true, name: true, email: true } },
          institution: { select: { id: true, name: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return pageResult(items, total, q);
  }
}
