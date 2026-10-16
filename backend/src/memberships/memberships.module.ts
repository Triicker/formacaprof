import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MembershipRole, Prisma, RecordStatus } from '@prisma/client';
import { AccessPolicy } from '../access/access-policy.service';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

export class ListMembersQuery {
  @IsOptional() @IsEnum(MembershipRole) role?: MembershipRole;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 100;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}

export class UpdateMembershipDto {
  @ApiPropertyOptional({ enum: RecordStatus, description: 'Ativa ou desativa o vínculo.' })
  @IsOptional() @IsEnum(RecordStatus)
  status?: RecordStatus;

  @ApiPropertyOptional({ enum: MembershipRole, description: 'Somente o administrador geral altera papéis.' })
  @IsOptional() @IsEnum(MembershipRole)
  role?: MembershipRole;
}

const MEMBER_SELECT = {
  id: true, role: true, status: true, createdAt: true, updatedAt: true,
  user: { select: { id: true, name: true, email: true, status: true, lastLoginAt: true } },
} satisfies Prisma.MembershipSelect;

@Injectable()
export class MembershipsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessPolicy, private readonly audit: AuditService) {}

  async list(actor: Actor, institutionId: string, q: ListMembersQuery) {
    this.access.assertCanManageMembers(actor, institutionId);
    const where: Prisma.MembershipWhereInput = { institutionId, role: q.role, status: q.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({ where, select: MEMBER_SELECT, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }], take: q.limit, skip: q.offset }),
      this.prisma.membership.count({ where }),
    ]);
    return { items, total };
  }

  async update(actor: Actor, institutionId: string, membershipId: string, dto: UpdateMembershipDto) {
    this.access.assertCanManageMembers(actor, institutionId);
    // Busca restrita à instituição da URL: um id de outra escola resulta em 404, nunca em alteração cruzada.
    const target = await this.prisma.membership.findFirst({ where: { id: membershipId, institutionId } });
    if (!target) throw new NotFoundException('Vínculo não encontrado nesta instituição.');
    this.access.assertCanChangeMembership(actor, target, dto);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.membership.update({ where: { id: target.id }, data: dto, select: MEMBER_SELECT });
      await this.audit.record({
        actorUserId: actor.userId, institutionId, action: 'membership.updated', entityType: 'membership', entityId: target.id,
        metadata: { userId: target.userId, from: { status: target.status, role: target.role }, to: { status: dto.status ?? null, role: dto.role ?? null } },
      }, tx);
      return updated;
    });
  }
}

@ApiTags('Vínculos')
@ApiCookieAuth()
@Controller('institutions/:id/members')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get()
  @ApiOperation({ summary: 'Membros da instituição (administrador ou coordenador da própria instituição)' })
  list(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Query() q: ListMembersQuery) {
    return this.memberships.list(actor, id, q);
  }

  @Patch(':membershipId')
  @ApiOperation({ summary: 'Ativa/desativa vínculo; coordenador só altera professores da própria instituição' })
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.memberships.update(actor, id, membershipId, dto);
  }
}

@Module({ controllers: [MembershipsController], providers: [MembershipsService] })
export class MembershipsModule {}
