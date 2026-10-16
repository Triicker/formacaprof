import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PlatformAdminOnly } from '../common/decorators';
import { AuditService } from './audit.service';

class AuditQuery {
  @IsOptional() @IsUUID() institutionId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}

@ApiTags('Auditoria')
@ApiCookieAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Registros de auditoria (somente administrador geral)' })
  async list(@Query() q: AuditQuery) {
    const [items, total] = await this.audit.list({ institutionId: q.institutionId, action: q.action, take: q.limit, skip: q.offset });
    return { items, total };
  }
}
