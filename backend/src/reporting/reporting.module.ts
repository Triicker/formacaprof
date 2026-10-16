import {
  BadRequestException, Body, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query, Res,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { CompletionSource, EnrollmentStatus, LessonProgressStatus, Prisma, RecordStatus } from '@prisma/client';
import type { Response } from 'express';
import { AccessPolicy } from '../access/access-policy.service';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { ProgressService } from '../entitlements/progress.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportingService } from './reporting.service';

class PeriodQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() collectionId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() to?: Date;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) q?: string;
}

export class EnrollmentReportQuery extends PeriodQuery {
  @ApiPropertyOptional({ enum: EnrollmentStatus }) @IsOptional() @IsEnum(EnrollmentStatus) status?: EnrollmentStatus;
  @ApiPropertyOptional({ enum: ['completed', 'in_progress', 'not_started'] }) @IsOptional() @IsIn(['completed', 'in_progress', 'not_started']) completion?: 'completed' | 'in_progress' | 'not_started';
  @ApiPropertyOptional({ enum: ['enrolledAt', 'completedAt'] }) @IsOptional() @IsIn(['enrolledAt', 'completedAt']) periodField?: 'enrolledAt' | 'completedAt';
  @ApiPropertyOptional({ enum: ['enrolledAt', 'completedAt', 'name'] }) @IsOptional() @IsIn(['enrolledAt', 'completedAt', 'name']) sort?: 'enrolledAt' | 'completedAt' | 'name';
  @ApiPropertyOptional({ enum: ['json', 'csv'] }) @IsOptional() @IsIn(['json', 'csv']) format?: 'json' | 'csv';
}

export class AdminEnrollmentReportQuery extends EnrollmentReportQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
}

export class AdminPeriodQuery extends PeriodQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
}

export class TeachersQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() collectionId?: string;
  @ApiPropertyOptional({ enum: RecordStatus }) @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class ProgressCorrectionDto {
  @ApiProperty() @IsUUID() lessonId!: string;
  @ApiProperty({ description: 'true marca como concluída; false desfaz a conclusão.' }) @IsBoolean() completed!: boolean;
  @ApiProperty({ minLength: 10 }) @IsString() @Length(10, 500) justification!: string;
}

export class JustificationDto {
  @ApiProperty({ minLength: 10 }) @IsString() @Length(10, 500) justification!: string;
}

const split = <T extends PageQuery>(q: T) => {
  const { page, pageSize, order, ...f } = q;
  return { page: { page, pageSize, order }, f };
};

function enviarCsv(res: Response, nome: string, conteudo: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(conteudo);
}

/** Histórico de matrícula e correções manuais (somente administrador; tudo auditado com antes/depois). */
@Injectable()
export class AdminLearningService {
  constructor(private readonly prisma: PrismaService, private readonly progress: ProgressService, private readonly audit: AuditService) {}

  async enrollment(id: string) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        membership: { select: { role: true, status: true, user: { select: { id: true, name: true, email: true } }, institution: { select: { id: true, name: true } } } },
        collection: { select: { id: true, slug: true, title: true, status: true } },
        certificate: true,
        assignedBy: { select: { name: true } },
      },
    });
    if (!e) throw new NotFoundException('Matrícula não encontrada.');
    const [detalhe, registros, historico] = await Promise.all([
      this.progress.detail(e),
      this.prisma.lessonProgress.findMany({ where: { enrollmentId: id }, select: { lessonId: true, completionSource: true, updatedAt: true } }),
      this.prisma.auditLog.findMany({
        where: { OR: [{ entityId: id }, { metadata: { path: ['enrollmentId'], equals: id } }, ...(e.certificate ? [{ entityId: e.certificate.id }] : [])] },
        orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { name: true } } },
      }),
    ]);
    const origem = new Map(registros.map((r) => [r.lessonId, r]));
    return {
      id: e.id, status: e.status, enrolledAt: e.enrolledAt, completedAt: e.completedAt, revokedAt: e.revokedAt, assignedBy: e.assignedBy?.name ?? null,
      user: e.membership.user, institution: e.membership.institution, memberRole: e.membership.role, membershipStatus: e.membership.status,
      collection: e.collection, certificate: e.certificate,
      summary: detalhe.summary, modules: detalhe.modules,
      lessons: detalhe.lessons.map((l) => ({ ...l, completionSource: origem.get(l.lessonId)?.completionSource ?? null, updatedAt: origem.get(l.lessonId)?.updatedAt ?? null })),
      history: historico,
    };
  }

  /** Correção manual: exige justificativa e registra valores anteriores e novos. Nunca edita percentuais. */
  async correctProgress(actor: Actor, enrollmentId: string, dto: ProgressCorrectionDto) {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!e) throw new NotFoundException('Matrícula não encontrada.');
    const aula = await this.prisma.lesson.findUnique({ where: { id: dto.lessonId }, select: { id: true, title: true, module: { select: { collectionId: true } } } });
    if (!aula || aula.module.collectionId !== e.collectionId) throw new BadRequestException('A aula não pertence à coleção desta matrícula.');
    const antes = await this.prisma.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId, lessonId: aula.id } } });
    const agora = new Date();
    const dados = dto.completed
      ? { status: LessonProgressStatus.completed, completedAt: antes?.completedAt ?? agora, completionSource: CompletionSource.admin_correction }
      : { status: LessonProgressStatus.in_progress, completedAt: null, completionSource: null };
    return this.prisma.$transaction(async (tx) => {
      const depois = await tx.lessonProgress.upsert({
        where: { enrollmentId_lessonId: { enrollmentId, lessonId: aula.id } },
        create: { enrollmentId, lessonId: aula.id, ...dados },
        update: dados,
      });
      const resumo = await this.progress.syncCompletion(e, tx);
      await this.audit.record({
        actorUserId: actor.userId, institutionId: e.institutionId, action: 'progress.corrected', entityType: 'enrollment', entityId: enrollmentId,
        metadata: {
          enrollmentId, lessonId: aula.id, lessonTitle: aula.title, justification: dto.justification.trim(),
          from: antes ? { status: antes.status, completedAt: antes.completedAt?.toISOString() ?? null, source: antes.completionSource } : null,
          to: { status: depois.status, completedAt: depois.completedAt?.toISOString() ?? null, source: depois.completionSource },
          summaryAfter: { requiredCompleted: resumo.requiredCompleted, requiredTotal: resumo.requiredTotal },
        } as Prisma.InputJsonValue,
      }, tx);
      return { lesson: { lessonId: aula.id, status: depois.status, completedAt: depois.completedAt }, summary: resumo };
    });
  }

  async revokeCertificate(actor: Actor, id: string, justification: string) {
    const c = await this.prisma.certificate.findUnique({ where: { id }, include: { enrollment: true } });
    if (!c) throw new NotFoundException('Certificado não encontrado.');
    if (c.revokedAt) throw new BadRequestException('Certificado já revogado.');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.certificate.update({ where: { id }, data: { revokedAt: new Date() } });
      await this.audit.record({
        actorUserId: actor.userId, institutionId: c.enrollment.institutionId, action: 'certificate.revoked', entityType: 'certificate', entityId: id,
        metadata: { enrollmentId: c.enrollmentId, verificationCode: c.verificationCode, justification: justification.trim() },
      }, tx);
      return { id: r.id, revokedAt: r.revokedAt, verificationCode: r.verificationCode };
    });
  }
}

@ApiTags('Administração global · Relatórios')
@ApiCookieAuth()
@PlatformAdminOnly()
@Controller('admin')
export class AdminReportsController {
  constructor(private readonly reports: ReportingService, private readonly learning: AdminLearningService) {}

  @Get('reports/enrollments')
  @ApiOperation({ summary: 'Matrículas e progresso (filtros: instituição, rede, coleção, período, status, conclusão). format=csv exporta' })
  async enrollments(@CurrentActor() actor: Actor, @Query() q: AdminEnrollmentReportQuery, @Res({ passthrough: true }) res: Response) {
    const { page, f } = split(q);
    const { format, ...filtros } = f;
    if (format === 'csv') return enviarCsv(res, 'matriculas', await this.reports.enrollmentsCsv(actor, filtros, 'admin'));
    return this.reports.enrollments(filtros, page);
  }

  @Get('reports/certificates')
  @ApiOperation({ summary: 'Certificados emitidos' })
  certificates(@Query() q: AdminPeriodQuery) {
    const { page, f } = split(q);
    return this.reports.certificates(f, page);
  }

  @Get('reports/participation')
  @ApiOperation({ summary: 'Participação por mês (matrículas, aulas concluídas, certificados)' })
  participation(@Query() q: AdminPeriodQuery) {
    return this.reports.participation(q);
  }

  @Get('enrollments/:id')
  @ApiOperation({ summary: 'Histórico completo da matrícula: progresso por aula, certificado e auditoria' })
  enrollment(@Param('id', ParseUUIDPipe) id: string) {
    return this.learning.enrollment(id);
  }

  @Post('enrollments/:id/progress-corrections')
  @ApiOperation({ summary: 'Correção manual de progresso (justificativa obrigatória; antes/depois auditados)' })
  correct(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProgressCorrectionDto) {
    return this.learning.correctProgress(actor, id, dto);
  }

  @Post('certificates/:id/revoke')
  @HttpCode(200)
  @ApiOperation({ summary: 'Revoga certificado (justificativa obrigatória; a verificação pública passa a indicar inválido)' })
  revoke(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: JustificationDto) {
    return this.learning.revokeCertificate(actor, id, dto.justification);
  }
}

/** Rotas da coordenação: o escopo é sempre a instituição da URL, validada contra o vínculo de coordenação. */
@ApiTags('Coordenação')
@ApiCookieAuth()
@Controller('institutions/:id')
export class CoordinationReportsController {
  constructor(private readonly reports: ReportingService, private readonly access: AccessPolicy) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Indicadores da instituição (coordenação/admin)' })
  dashboard(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    this.access.assertCanManageMembers(actor, id);
    return this.reports.institutionDashboard(id);
  }

  @Get('teachers')
  @ApiOperation({ summary: 'Professores da instituição com matrículas, progresso e certificados' })
  teachers(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query() q: TeachersQuery) {
    this.access.assertCanManageMembers(actor, id);
    const { page, f } = split(q);
    return this.reports.teachers(id, f, page);
  }

  @Get('reports/enrollments')
  @ApiOperation({ summary: 'Relatório de matrículas da instituição (format=csv exporta)' })
  async enrollments(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query() q: EnrollmentReportQuery, @Res({ passthrough: true }) res: Response) {
    this.access.assertCanManageMembers(actor, id);
    const { page, f } = split(q);
    const { format, ...filtros } = f;
    const escopo = { ...filtros, institutionId: id };
    if (format === 'csv') return enviarCsv(res, 'matriculas', await this.reports.enrollmentsCsv(actor, escopo, 'institution'));
    return this.reports.enrollments(escopo, page);
  }

  @Get('reports/certificates')
  @ApiOperation({ summary: 'Certificados da instituição' })
  certificates(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query() q: PeriodQuery) {
    this.access.assertCanManageMembers(actor, id);
    const { page, f } = split(q);
    return this.reports.certificates({ ...f, institutionId: id }, page);
  }

  @Get('reports/participation')
  @ApiOperation({ summary: 'Participação por mês na instituição' })
  participation(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query() q: PeriodQuery) {
    this.access.assertCanManageMembers(actor, id);
    return this.reports.participation({ ...q, institutionId: id });
  }
}

@Module({ controllers: [AdminReportsController, CoordinationReportsController], providers: [ReportingService, AdminLearningService] })
export class ReportingModule {}
