import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Paginação feita no banco (nunca carregar todos os registros). */
export class PageQuery {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional() @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export const pageArgs = (q: PageQuery) => ({ skip: (q.page - 1) * q.pageSize, take: q.pageSize });

export const pageResult = <T>(items: T[], total: number, q: PageQuery) => ({
  items, total, page: q.page, pageSize: q.pageSize, pages: Math.max(1, Math.ceil(total / q.pageSize)),
});

/** Intervalo de datas opcional (ISO 8601) para filtros por período. */
export function periodFilter(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}
