import { Injectable } from '@nestjs/common';
import { ContentStatus, EnrollmentStatus, MembershipRole, Prisma, RecordStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { pageArgs, pageResult, PageQuery, periodFilter } from '../common/pagination';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { ProgressService } from '../entitlements/progress.service';
import { PrismaService } from '../prisma/prisma.service';

export interface EnrollmentReportFilters {
  institutionId?: string;
  organizationId?: string;
  collectionId?: string;
  status?: EnrollmentStatus;
  completion?: 'completed' | 'in_progress' | 'not_started';
  from?: Date;
  to?: Date;
  periodField?: 'enrolledAt' | 'completedAt';
  q?: string;
  sort?: 'enrolledAt' | 'completedAt' | 'name';
}

const ROW_SELECT = {
  id: true, status: true, enrolledAt: true, completedAt: true, revokedAt: true, collectionId: true,
  membership: { select: { user: { select: { id: true, name: true, email: true } }, institution: { select: { id: true, name: true } } } },
  collection: { select: { id: true, title: true, slug: true } },
  certificate: { select: { verificationCode: true, issuedAt: true, revokedAt: true } },
} satisfies Prisma.EnrollmentSelect;

const CSV_LIMITE = 50_000;
const CSV_LOTE = 500;

/** Evita injeção de fórmula ao abrir o CSV em planilhas (=, +, -, @). */
const celula = (v: unknown) => {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
};

/**
 * Relatórios. O escopo institucional é aplicado pelo controller: para coordenadores, `institutionId`
 * vem SEMPRE da URL já autorizada (nunca de filtro livre). Somente dados necessários: nome e e-mail.
 */
@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  enrollmentWhere(f: EnrollmentReportFilters): Prisma.EnrollmentWhereInput {
    const period = periodFilter(f.from, f.to);
    const and: Prisma.EnrollmentWhereInput[] = [];
    if (f.institutionId) and.push({ institutionId: f.institutionId });
    if (f.organizationId) and.push({ membership: { institution: { organizationId: f.organizationId } } });
    if (f.collectionId) and.push({ collectionId: f.collectionId });
    if (f.status) and.push({ status: f.status });
    if (f.completion === 'completed') and.push({ completedAt: { not: null } });
    if (f.completion === 'in_progress') and.push({ completedAt: null, progress: { some: {} } });
    if (f.completion === 'not_started') and.push({ completedAt: null, progress: { none: {} } });
    if (period) and.push({ [f.periodField ?? 'enrolledAt']: period });
    if (f.q) and.push({ membership: { user: { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { email: { contains: f.q.toLowerCase() } }] } } });
    return and.length ? { AND: and } : {};
  }

  private orderBy(f: EnrollmentReportFilters, order?: 'asc' | 'desc'): Prisma.EnrollmentOrderByWithRelationInput[] {
    const dir = order ?? (f.sort === 'name' ? 'asc' : 'desc');
    if (f.sort === 'name') return [{ membership: { user: { name: dir } } }, { id: 'asc' }];
    if (f.sort === 'completedAt') return [{ completedAt: { sort: dir, nulls: 'last' } }, { id: 'asc' }];
    return [{ enrolledAt: dir }, { id: 'asc' }];
  }

  private async rows(enrollments: Prisma.EnrollmentGetPayload<{ select: typeof ROW_SELECT }>[]) {
    const p = await this.progress.bulk(enrollments);
    return enrollments.map((e) => ({
      enrollmentId: e.id, status: e.status, enrolledAt: e.enrolledAt, completedAt: e.completedAt, revokedAt: e.revokedAt,
      user: e.membership.user, institution: e.membership.institution, collection: e.collection,
      progress: p.get(e.id), certificate: e.certificate,
    }));
  }

  async enrollments(f: EnrollmentReportFilters, q: PageQuery) {
    const where = this.enrollmentWhere(f);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.enrollment.findMany({ where, select: ROW_SELECT, orderBy: this.orderBy(f, q.order), ...pageArgs(q) }),
      this.prisma.enrollment.count({ where }),
    ]);
    return pageResult(await this.rows(items), total, q);
  }

  /** CSV gerado em lotes (sem carregar tudo na memória de uma vez), com auditoria da exportação. */
  async enrollmentsCsv(actor: Actor, f: EnrollmentReportFilters, escopo: string) {
    const where = this.enrollmentWhere(f);
    const linhas = ['Nome,E-mail,Instituição,Coleção,Situação da matrícula,Matriculado em,Concluído em,Aulas concluídas,Aulas obrigatórias,Percentual,Certificado'];
    let skip = 0;
    while (skip < CSV_LIMITE) {
      const lote = await this.prisma.enrollment.findMany({ where, select: ROW_SELECT, orderBy: this.orderBy(f), skip, take: CSV_LOTE });
      for (const r of await this.rows(lote)) {
        linhas.push([
          r.user.name, r.user.email, r.institution.name, r.collection.title, r.status === 'active' ? 'Ativa' : 'Revogada',
          r.enrolledAt, r.completedAt ?? '', r.progress?.requiredCompleted ?? 0, r.progress?.requiredTotal ?? 0, `${r.progress?.percent ?? 0}%`,
          r.certificate && !r.certificate.revokedAt ? r.certificate.verificationCode : '',
        ].map(celula).join(','));
      }
      if (lote.length < CSV_LOTE) break;
      skip += CSV_LOTE;
    }
    await this.audit.record({
      actorUserId: actor.userId, institutionId: f.institutionId ?? null, action: 'report.exported', entityType: 'report', entityId: 'enrollments',
      metadata: { scope: escopo, rows: linhas.length - 1, filters: JSON.parse(JSON.stringify(f)) },
    });
    return `﻿${linhas.join('\r\n')}\r\n`;
  }

  async certificates(f: { institutionId?: string; organizationId?: string; collectionId?: string; from?: Date; to?: Date; q?: string }, q: PageQuery) {
    const period = periodFilter(f.from, f.to);
    const where: Prisma.CertificateWhereInput = {
      ...(period ? { issuedAt: period } : {}),
      enrollment: {
        institutionId: f.institutionId, collectionId: f.collectionId,
        ...(f.organizationId ? { membership: { institution: { organizationId: f.organizationId } } } : {}),
        ...(f.q ? { membership: { user: { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { email: { contains: f.q.toLowerCase() } }] } } } : {}),
      },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.certificate.findMany({
        where, orderBy: { issuedAt: q.order ?? 'desc' }, ...pageArgs(q),
        select: {
          id: true, verificationCode: true, issuedAt: true, revokedAt: true,
          enrollment: { select: { id: true, collection: { select: { title: true } }, membership: { select: { user: { select: { name: true, email: true } }, institution: { select: { name: true } } } } } },
        },
      }),
      this.prisma.certificate.count({ where }),
    ]);
    return pageResult(items.map((c) => ({
      id: c.id, verificationCode: c.verificationCode, issuedAt: c.issuedAt, revokedAt: c.revokedAt, enrollmentId: c.enrollment.id,
      collection: c.enrollment.collection.title, user: c.enrollment.membership.user, institution: c.enrollment.membership.institution.name,
    })), total, q);
  }

  /** Participação por mês: matrículas criadas, aulas concluídas e certificados emitidos. */
  async participation(f: { institutionId?: string; organizationId?: string; collectionId?: string; from?: Date; to?: Date }) {
    const to = f.to ?? new Date();
    const from = f.from ?? new Date(to.getFullYear(), to.getMonth() - 11, 1);
    const cond = Prisma.sql`
      ${f.institutionId ? Prisma.sql`AND e.institution_id = ${f.institutionId}::uuid` : Prisma.empty}
      ${f.collectionId ? Prisma.sql`AND e.collection_id = ${f.collectionId}::uuid` : Prisma.empty}
      ${f.organizationId ? Prisma.sql`AND e.institution_id IN (SELECT id FROM institutions WHERE organization_id = ${f.organizationId}::uuid)` : Prisma.empty}`;
    const [matriculas, aulas, certs] = await Promise.all([
      this.prisma.$queryRaw<{ mes: Date; n: bigint }[]>`
        SELECT date_trunc('month', e.enrolled_at) AS mes, count(*) AS n FROM enrollments e
        WHERE e.enrolled_at BETWEEN ${from} AND ${to} ${cond} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ mes: Date; n: bigint }[]>`
        SELECT date_trunc('month', lp.completed_at) AS mes, count(*) AS n FROM lesson_progress lp JOIN enrollments e ON e.id = lp.enrollment_id
        WHERE lp.completed_at BETWEEN ${from} AND ${to} ${cond} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<{ mes: Date; n: bigint }[]>`
        SELECT date_trunc('month', c.issued_at) AS mes, count(*) AS n FROM certificates c JOIN enrollments e ON e.id = c.enrollment_id
        WHERE c.issued_at BETWEEN ${from} AND ${to} AND c.revoked_at IS NULL ${cond} GROUP BY 1 ORDER BY 1`,
    ]);
    const meses = new Map<string, { month: string; enrollments: number; lessonsCompleted: number; certificates: number }>();
    for (let d = new Date(from.getFullYear(), from.getMonth(), 1); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      meses.set(k, { month: k, enrollments: 0, lessonsCompleted: 0, certificates: 0 });
    }
    const somar = (rows: { mes: Date; n: bigint }[], campo: 'enrollments' | 'lessonsCompleted' | 'certificates') => {
      for (const r of rows) {
        const d = new Date(r.mes);
        const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const m = meses.get(k);
        if (m) m[campo] += Number(r.n);
      }
    };
    somar(matriculas, 'enrollments');
    somar(aulas, 'lessonsCompleted');
    somar(certs, 'certificates');
    return { from, to, months: [...meses.values()] };
  }

  // ------------------------------------------------------------------ coordenação

  /** Indicadores da instituição para o painel da coordenação. */
  async institutionDashboard(institutionId: string) {
    const [professores, convites, acessos, matriculas, certificados, atividade] = await Promise.all([
      this.prisma.membership.count({ where: { institutionId, role: MembershipRole.professor, status: RecordStatus.active } }),
      this.prisma.invitation.count({ where: { institutionId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.institutionCollectionAccess.findMany({ where: { institutionId }, include: { collection: { select: { id: true, title: true, status: true } } } }),
      this.prisma.enrollment.findMany({ where: { institutionId, status: EnrollmentStatus.active }, select: { id: true, userId: true, collectionId: true, completedAt: true } }),
      this.prisma.certificate.count({ where: { revokedAt: null, enrollment: { institutionId } } }),
      this.prisma.auditLog.findMany({
        where: { institutionId }, orderBy: { createdAt: 'desc' }, take: 10,
        select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
      }),
    ]);
    const liberadas = acessos.filter((a) => this.entitlements.accessState(a) === 'active' && a.collection.status === ContentStatus.published);
    const porColecao = liberadas.map((a) => {
      const m = matriculas.filter((e) => e.collectionId === a.collectionId);
      const concl = m.filter((e) => e.completedAt).length;
      return { collection: a.collection, activeEnrollments: m.length, completed: concl, completionRate: m.length ? Math.round((concl / m.length) * 100) : 0 };
    });
    return {
      activeProfessors: professores,
      pendingInvitations: convites,
      collectionsWithAccess: liberadas.length,
      enrolledTeachers: new Set(matriculas.map((e) => e.userId)).size,
      inProgress: matriculas.filter((e) => !e.completedAt).length,
      completed: matriculas.filter((e) => e.completedAt).length,
      certificates: certificados,
      completionByCollection: porColecao,
      recentActivity: atividade,
    };
  }

  /** Professores (e coordenadores) da instituição com suas matrículas e progresso. */
  async teachers(institutionId: string, f: { q?: string; collectionId?: string; status?: RecordStatus }, q: PageQuery) {
    const where: Prisma.MembershipWhereInput = {
      institutionId, status: f.status,
      ...(f.collectionId ? { enrollments: { some: { collectionId: f.collectionId } } } : {}),
      ...(f.q ? { user: { OR: [{ name: { contains: f.q, mode: 'insensitive' } }, { email: { contains: f.q.toLowerCase() } }] } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where, ...pageArgs(q), orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
        select: {
          id: true, role: true, status: true, createdAt: true,
          user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } },
          enrollments: {
            orderBy: { enrolledAt: 'asc' },
            select: { id: true, status: true, collectionId: true, enrolledAt: true, completedAt: true, collection: { select: { title: true } }, certificate: { select: { verificationCode: true, revokedAt: true } } },
          },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);
    const p = await this.progress.bulk(rows.flatMap((r) => r.enrollments));
    return pageResult(rows.map((r) => ({
      membershipId: r.id, role: r.role, membershipStatus: r.status, since: r.createdAt, user: r.user,
      enrollments: r.enrollments.map((e) => ({
        id: e.id, status: e.status, collectionId: e.collectionId, collection: e.collection.title, enrolledAt: e.enrolledAt, completedAt: e.completedAt,
        progress: p.get(e.id), certificate: e.certificate && !e.certificate.revokedAt ? e.certificate.verificationCode : null,
      })),
    })), total, q);
  }
}
