import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { AccessStatus, ContentStatus, EnrollmentStatus, MembershipRole, Prisma, RecordStatus, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { pageArgs, pageResult, PageQuery, periodFilter } from '../common/pagination';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';

export class AdminInstitutionsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) q?: string;
  @ApiPropertyOptional({ enum: RecordStatus }) @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ enum: ['name', 'createdAt'] }) @IsOptional() @IsIn(['name', 'createdAt']) sort?: 'name' | 'createdAt';
}

export class CoordinatorsQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) q?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;
  @ApiPropertyOptional({ enum: RecordStatus }) @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
}

export class AssignCoordinatorDto {
  @ApiProperty({ description: 'Usuário já cadastrado que passará a coordenar a instituição.' }) @IsUUID() userId!: string;
}

export class DashboardQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

@Injectable()
export class AdminInstitutionsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly entitlements: EntitlementsService) {}

  /** Indicadores reais da plataforma (filtráveis por instituição e período). */
  async dashboard(q: DashboardQuery) {
    const inst = q.institutionId;
    const period = periodFilter(q.from, q.to);
    const mWhere = (role: MembershipRole): Prisma.MembershipWhereInput => ({ role, status: RecordStatus.active, institution: { status: RecordStatus.active }, institutionId: inst });
    const [ativas, inativas, professores, coordenadores, publicadas, preparacao, matriculas, concluidas, certificados, atividade] = await Promise.all([
      this.prisma.institution.count({ where: { status: RecordStatus.active, id: inst } }),
      this.prisma.institution.count({ where: { status: RecordStatus.inactive, id: inst } }),
      this.prisma.membership.count({ where: mWhere(MembershipRole.professor) }),
      this.prisma.membership.count({ where: mWhere(MembershipRole.coordinator) }),
      this.prisma.collection.count({ where: { status: ContentStatus.published } }),
      this.prisma.collection.count({ where: { status: ContentStatus.draft } }),
      this.prisma.enrollment.count({ where: { status: EnrollmentStatus.active, institutionId: inst, ...(period ? { enrolledAt: period } : {}) } }),
      this.prisma.enrollment.count({ where: { completedAt: period ?? { not: null }, institutionId: inst } }),
      this.prisma.certificate.count({ where: { revokedAt: null, enrollment: { institutionId: inst }, ...(period ? { issuedAt: period } : {}) } }),
      this.prisma.auditLog.findMany({
        where: { institutionId: inst, ...(period ? { createdAt: period } : {}) }, orderBy: { createdAt: 'desc' }, take: 12,
        select: { id: true, action: true, entityType: true, createdAt: true, actor: { select: { name: true } }, institution: { select: { name: true } } },
      }),
    ]);
    return {
      institutions: { total: ativas + inativas, active: ativas, inactive: inativas },
      professors: professores,
      coordinators: coordenadores,
      collections: { published: publicadas, inPreparation: preparacao },
      enrollments: { active: matriculas, completed: concluidas },
      certificates: certificados,
      recentActivity: atividade,
      filters: { institutionId: inst ?? null, from: q.from ?? null, to: q.to ?? null },
    };
  }

  async list(q: AdminInstitutionsQuery) {
    const where: Prisma.InstitutionWhereInput = {
      status: q.status, organizationId: q.organizationId,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { city: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const sort = q.sort ?? 'name';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.institution.findMany({
        where, ...pageArgs(q), orderBy: { [sort]: q.order ?? (sort === 'name' ? 'asc' : 'desc') },
        include: { organization: { select: { id: true, name: true } } },
      }),
      this.prisma.institution.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [membros, acessos] = await Promise.all([
      this.prisma.membership.groupBy({ by: ['institutionId', 'role'], where: { institutionId: { in: ids }, status: RecordStatus.active }, _count: { _all: true } }),
      this.prisma.institutionCollectionAccess.groupBy({ by: ['institutionId'], where: { institutionId: { in: ids }, status: AccessStatus.active }, _count: { _all: true } }),
    ]);
    const n = (id: string, role: MembershipRole) => membros.find((m) => m.institutionId === id && m.role === role)?._count._all ?? 0;
    return pageResult(rows.map((r) => ({
      ...r,
      counts: { coordinators: n(r.id, 'coordinator'), professors: n(r.id, 'professor'), authorizedCollections: acessos.find((a) => a.institutionId === r.id)?._count._all ?? 0 },
    })), total, q);
  }

  async detail(id: string) {
    const inst = await this.prisma.institution.findUnique({ where: { id }, include: { organization: { select: { id: true, name: true } } } });
    if (!inst) throw new NotFoundException('Instituição não encontrada.');
    const [coordenadores, professores, convites, matriculas, certificados, colecoes] = await Promise.all([
      this.prisma.membership.findMany({
        where: { institutionId: id, role: MembershipRole.coordinator }, orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, createdAt: true, user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } } },
      }),
      this.prisma.membership.count({ where: { institutionId: id, role: MembershipRole.professor, status: RecordStatus.active } }),
      this.prisma.invitation.count({ where: { institutionId: id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.enrollment.count({ where: { institutionId: id, status: EnrollmentStatus.active } }),
      this.prisma.certificate.count({ where: { revokedAt: null, enrollment: { institutionId: id } } }),
      this.prisma.collection.findMany({
        where: { status: { not: ContentStatus.archived } }, orderBy: { displayOrder: 'asc' },
        select: {
          id: true, slug: true, title: true, status: true,
          institutionAccess: { where: { institutionId: id }, select: { id: true, status: true, expiresAt: true, grantedAt: true, revokedAt: true, updatedAt: true } },
          _count: { select: { enrollments: { where: { institutionId: id, status: EnrollmentStatus.active } } } },
        },
      }),
    ]);
    return {
      ...inst,
      coordinators: coordenadores,
      counts: { professors: professores, pendingInvitations: convites, activeEnrollments: matriculas, certificates: certificados },
      collectionAccess: colecoes.map((c) => ({
        collection: { id: c.id, slug: c.slug, title: c.title, status: c.status },
        access: c.institutionAccess[0] ?? null,
        state: this.entitlements.accessState(c.institutionAccess[0]),
        activeEnrollments: c._count.enrollments,
      })),
    };
  }

  /** Designa um usuário existente como coordenador (cria o vínculo ou promove o existente). */
  async assignCoordinator(actor: Actor, institutionId: string, userId: string) {
    const [inst, user] = await Promise.all([
      this.prisma.institution.findUnique({ where: { id: institutionId }, select: { status: true } }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } }),
    ]);
    if (!inst) throw new NotFoundException('Instituição não encontrada.');
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    if (inst.status !== RecordStatus.active) throw new BadRequestException('Instituição inativa.');
    if (user.status !== UserStatus.active) throw new BadRequestException('A conta do usuário está desativada.');
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.membership.findUnique({ where: { userId_institutionId: { userId, institutionId } } });
      const m = await tx.membership.upsert({
        where: { userId_institutionId: { userId, institutionId } },
        create: { userId, institutionId, role: MembershipRole.coordinator },
        update: { role: MembershipRole.coordinator, status: RecordStatus.active },
      });
      await this.audit.record({
        actorUserId: actor.userId, institutionId, action: 'membership.coordinator_assigned', entityType: 'membership', entityId: m.id,
        metadata: { userId, from: before ? { role: before.role, status: before.status } : null },
      }, tx);
      return m;
    });
  }

  async coordinators(q: CoordinatorsQuery) {
    const where: Prisma.MembershipWhereInput = {
      role: MembershipRole.coordinator, institutionId: q.institutionId, status: q.status,
      ...(q.q ? { user: { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q.toLowerCase() } }] } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where, ...pageArgs(q), orderBy: [{ institution: { name: 'asc' } }, { createdAt: 'asc' }],
        select: {
          id: true, status: true, createdAt: true, updatedAt: true,
          user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } },
          institution: { select: { id: true, name: true, status: true } },
        },
      }),
      this.prisma.membership.count({ where }),
    ]);
    return pageResult(rows, total, q);
  }
}

@ApiTags('Administração global')
@ApiCookieAuth()
@PlatformAdminOnly()
@Controller('admin')
export class AdminInstitutionsController {
  constructor(private readonly admin: AdminInstitutionsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Indicadores da plataforma (filtros: instituição, período)' })
  dashboard(@Query() q: DashboardQuery) {
    return this.admin.dashboard(q);
  }

  @Get('institutions')
  @ApiOperation({ summary: 'Instituições com contagem de coordenadores, professores e coleções autorizadas' })
  list(@Query() q: AdminInstitutionsQuery) {
    return this.admin.list(q);
  }

  @Get('institutions/:id')
  @ApiOperation({ summary: 'Detalhe da instituição: coordenadores, números e direitos por coleção' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.detail(id);
  }

  @Post('institutions/:id/coordinators')
  @ApiOperation({ summary: 'Designa um usuário existente como coordenador da instituição' })
  assign(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignCoordinatorDto) {
    return this.admin.assignCoordinator(actor, id, dto.userId);
  }

  @Get('coordinators')
  @ApiOperation({ summary: 'Coordenadores de todas as instituições' })
  coordinators(@Query() q: CoordinatorsQuery) {
    return this.admin.coordinators(q);
  }
}

@Module({ controllers: [AdminInstitutionsController], providers: [AdminInstitutionsService] })
export class AdminInstitutionsModule {}
