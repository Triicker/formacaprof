import { Body, ConflictException, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { slugify } from '../common/tokens';
import { PrismaService } from '../prisma/prisma.service';

export class CreateOrganizationDto {
  @ApiProperty({ example: 'Secretaria Municipal de Educação de Salvador' })
  @IsString() @Length(3, 160)
  name!: string;

  @ApiPropertyOptional({ example: 'smed-salvador' })
  @IsOptional() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/) @Length(2, 80)
  slug?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list() {
    return this.prisma.organization.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { institutions: true } } } });
  }

  async create(actor: Actor, dto: CreateOrganizationDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({ data: { name: dto.name.trim(), slug: dto.slug ?? slugify(dto.name) } });
        await this.audit.record({ actorUserId: actor.userId, action: 'organization.created', entityType: 'organization', entityId: org.id, metadata: { name: org.name } }, tx);
        return org;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Já existe uma organização com este identificador (slug).');
      throw e;
    }
  }
}

@ApiTags('Organizações')
@ApiCookieAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get()
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Lista redes/secretarias/mantenedoras (administrador geral)' })
  list() {
    return this.orgs.list();
  }

  @Post()
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Cadastra uma organização (administrador geral)' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateOrganizationDto) {
    return this.orgs.create(actor, dto);
  }
}

@Module({ controllers: [OrganizationsController], providers: [OrganizationsService] })
export class OrganizationsModule {}
