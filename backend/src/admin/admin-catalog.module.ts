import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { AccessStatus, ContentStatus, EnrollmentStatus, RecordStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';

export class SetInstitutionAccessDto {
  @ApiProperty({ enum: AccessStatus }) @IsEnum(AccessStatus) status!: AccessStatus;

  @ApiPropertyOptional({ description: 'Fim do direito (ISO 8601). null remove a data de expiração.', nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Date) @IsDate()
  expiresAt?: Date | null;

  @ApiPropertyOptional({ description: 'Justificativa (obrigatória ao suspender/revogar com professores matriculados).' })
  @IsOptional() @IsString() @Length(10, 500) justification?: string;

  @ApiPropertyOptional({ description: 'Confirma ciência do impacto sobre professores matriculados.' })
  @IsOptional() @IsBoolean() confirmImpact?: boolean;
}

/** Direito institucional de uso das coleções: só o administrador geral concede, suspende ou revoga. */
@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly entitlements: EntitlementsService) {}

  async institutionAccessList(institutionId: string) {
    const rows = await this.prisma.institutionCollectionAccess.findMany({
      where: { institutionId },
      include: { collection: { select: { id: true, slug: true, title: true, status: true } }, grantedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { items: rows.map((r) => ({ ...r, effectiveState: this.entitlements.accessState(r) })) };
  }

  /**
   * Suspender/revogar não apaga matrículas, progresso nem certificados: só bloqueia o acesso.
   * Com professores matriculados, exige confirmação explícita e justificativa (auditadas).
   */
  async setInstitutionAccess(actor: Actor, institutionId: string, collectionId: string, dto: SetInstitutionAccessDto) {
    const [inst, col, anterior] = await Promise.all([
      this.prisma.institution.findUnique({ where: { id: institutionId }, select: { status: true } }),
      this.prisma.collection.findUnique({ where: { id: collectionId }, select: { status: true } }),
      this.prisma.institutionCollectionAccess.findUnique({ where: { institutionId_collectionId: { institutionId, collectionId } } }),
    ]);
    if (!inst) throw new NotFoundException('Instituição não encontrada.');
    if (!col) throw new NotFoundException('Coleção não encontrada.');
    if (dto.status === AccessStatus.active) {
      if (col.status !== ContentStatus.published) throw new BadRequestException('Somente coleções publicadas podem ser liberadas para instituições.');
      if (inst.status !== RecordStatus.active) throw new BadRequestException('Instituição inativa.');
      if (dto.expiresAt && dto.expiresAt <= new Date()) throw new BadRequestException('A data de expiração deve estar no futuro.');
    } else {
      const matriculados = await this.prisma.enrollment.count({ where: { institutionId, collectionId, status: EnrollmentStatus.active } });
      if (matriculados > 0 && (!dto.confirmImpact || !dto.justification?.trim())) {
        throw new ConflictException({
          statusCode: 409, code: 'IMPACT_CONFIRMATION_REQUIRED', impact: { activeEnrollments: matriculados },
          message: `${matriculados} professor(es) matriculado(s) perderão o acesso (o progresso é preservado). Confirme e informe a justificativa.`,
        });
      }
    }
    const now = new Date();
    const data = {
      status: dto.status,
      revokedAt: dto.status === AccessStatus.revoked ? now : null,
      grantedById: actor.userId,
      ...(dto.status === AccessStatus.active ? { grantedAt: now } : {}),
      ...(dto.expiresAt !== undefined ? { expiresAt: dto.expiresAt } : {}),
    };
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.institutionCollectionAccess.upsert({
        where: { institutionId_collectionId: { institutionId, collectionId } },
        create: { institutionId, collectionId, ...data },
        update: data,
      });
      await this.audit.record({
        actorUserId: actor.userId, institutionId, action: `collection_access.${dto.status}`, entityType: 'collection', entityId: collectionId,
        metadata: {
          from: anterior?.status ?? null, to: dto.status, expiresAt: row.expiresAt?.toISOString() ?? null,
          ...(dto.justification ? { justification: dto.justification.trim() } : {}),
        },
      }, tx);
      return { ...row, effectiveState: this.entitlements.accessState(row) };
    });
  }
}

@ApiTags('Administração global')
@ApiCookieAuth()
@PlatformAdminOnly()
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly admin: AdminCatalogService) {}

  @Get('institutions/:id/collection-access')
  @ApiOperation({ summary: 'Direitos de coleção da instituição' })
  access(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.institutionAccessList(id);
  }

  @Put('institutions/:id/collections/:collectionId/access')
  @ApiOperation({ summary: 'Concede, suspende ou revoga o direito institucional (com impacto: confirmImpact + justification)' })
  setAccess(
    @CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string,
    @Param('collectionId', ParseUUIDPipe) collectionId: string, @Body() dto: SetInstitutionAccessDto,
  ) {
    return this.admin.setInstitutionAccess(actor, id, collectionId, dto);
  }
}

@Module({ controllers: [AdminCatalogController], providers: [AdminCatalogService] })
export class AdminCatalogModule {}
