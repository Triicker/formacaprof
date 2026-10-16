import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, ValidateIf } from 'class-validator';
import { AccessStatus, ContentStatus, RecordStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { presentCollection } from '../catalog/catalog.service';
import { MEDIA_REF_SELECT } from '../catalog/media-url';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';

export class UpdateCollectionStatusDto {
  @ApiProperty({ enum: ContentStatus }) @IsEnum(ContentStatus) status!: ContentStatus;
}

export class SetInstitutionAccessDto {
  @ApiProperty({ enum: AccessStatus }) @IsEnum(AccessStatus) status!: AccessStatus;

  @ApiPropertyOptional({ description: 'Fim do direito (ISO 8601). null remove a data de expiração.', nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Date) @IsDate()
  expiresAt?: Date | null;
}

@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly entitlements: EntitlementsService) {}

  async collections() {
    const rows = await this.prisma.collection.findMany({
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true, slug: true, title: true, subtitle: true, description: true, status: true, displayOrder: true, themeConfig: true,
        cover: { select: MEDIA_REF_SELECT }, thumbnail: { select: MEDIA_REF_SELECT },
        _count: { select: { modules: true, enrollments: true } },
        institutionAccess: { where: { status: AccessStatus.active }, select: { id: true } },
      },
    });
    return rows.map((c) => ({ ...presentCollection(c), modules: c._count.modules, enrollments: c._count.enrollments, institutionsWithAccess: c.institutionAccess.length }));
  }

  async setCollectionStatus(actor: Actor, id: string, status: ContentStatus) {
    const c = await this.prisma.collection.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Coleção não encontrada.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.collection.update({ where: { id }, data: { status } });
      await this.audit.record({ actorUserId: actor.userId, action: 'collection.status_changed', entityType: 'collection', entityId: id, metadata: { from: c.status, to: status } }, tx);
      return { id: updated.id, slug: updated.slug, status: updated.status };
    });
  }

  async institutionAccessList(institutionId: string) {
    const rows = await this.prisma.institutionCollectionAccess.findMany({
      where: { institutionId },
      include: { collection: { select: { id: true, slug: true, title: true, status: true } }, grantedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { items: rows.map((r) => ({ ...r, effectiveState: this.entitlements.accessState(r) })) };
  }

  /** Única forma de conceder/suspender/revogar o direito institucional a uma coleção. */
  async setInstitutionAccess(actor: Actor, institutionId: string, collectionId: string, dto: SetInstitutionAccessDto) {
    const [inst, col] = await Promise.all([
      this.prisma.institution.findUnique({ where: { id: institutionId }, select: { status: true } }),
      this.prisma.collection.findUnique({ where: { id: collectionId }, select: { status: true } }),
    ]);
    if (!inst) throw new NotFoundException('Instituição não encontrada.');
    if (!col) throw new NotFoundException('Coleção não encontrada.');
    if (dto.status === AccessStatus.active) {
      if (col.status !== ContentStatus.published) throw new BadRequestException('Somente coleções publicadas podem ser liberadas para instituições.');
      if (inst.status !== RecordStatus.active) throw new BadRequestException('Instituição inativa.');
      if (dto.expiresAt && dto.expiresAt <= new Date()) throw new BadRequestException('A data de expiração deve estar no futuro.');
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
        metadata: { expiresAt: row.expiresAt?.toISOString() ?? null },
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

  @Get('collections')
  @ApiOperation({ summary: 'Todas as coleções (inclusive rascunho/arquivadas) com números' })
  collections() {
    return this.admin.collections();
  }

  @Patch('collections/:id')
  @ApiOperation({ summary: 'Publica, despublica (draft) ou arquiva uma coleção' })
  setStatus(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionStatusDto) {
    return this.admin.setCollectionStatus(actor, id, dto.status);
  }

  @Get('institutions/:id/collection-access')
  @ApiOperation({ summary: 'Direitos de coleção da instituição' })
  access(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.institutionAccessList(id);
  }

  @Put('institutions/:id/collections/:collectionId/access')
  @ApiOperation({ summary: 'Concede, suspende ou revoga o direito institucional a uma coleção' })
  setAccess(
    @CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string,
    @Param('collectionId', ParseUUIDPipe) collectionId: string, @Body() dto: SetInstitutionAccessDto,
  ) {
    return this.admin.setInstitutionAccess(actor, id, collectionId, dto);
  }
}

@Module({ controllers: [AdminCatalogController], providers: [AdminCatalogService] })
export class AdminCatalogModule {}
