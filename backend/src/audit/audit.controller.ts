import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { PlatformAdminOnly } from '../common/decorators';
import { PageQuery } from '../common/pagination';
import { AuditService } from './audit.service';

export class AuditQuery extends PageQuery {
  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) action?: string;
  @ApiPropertyOptional({ description: 'Prefixo da ação, ex.: "collection_access."' }) @IsOptional() @IsString() @Length(1, 80) actionPrefix?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() actorUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 60) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 64) entityId?: string;
  @ApiPropertyOptional({ description: 'Histórico de uma pessoa (ações dela e sobre ela).' }) @IsOptional() @IsUUID() subjectUserId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() from?: Date;
  @ApiPropertyOptional() @IsOptional() @Type(() => Date) @IsDate() to?: Date;
}

@ApiTags('Auditoria')
@ApiCookieAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Trilha de auditoria com filtros e paginação (somente administrador geral)' })
  list(@Query() q: AuditQuery) {
    const { page, pageSize, order, ...filters } = q;
    return this.audit.list(filters, { page, pageSize, order });
  }
}
