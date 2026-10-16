import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Aceita um cliente de transação para que o registro seja atômico com a ação auditada. */
  record(entry: AuditEntry, db: Db = this.prisma) {
    return db.auditLog.create({ data: entry });
  }

  list(params: { institutionId?: string; action?: string; take: number; skip: number }) {
    const where: Prisma.AuditLogWhereInput = {
      institutionId: params.institutionId,
      action: params.action,
    };
    return this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: params.take,
        skip: params.skip,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
  }
}
