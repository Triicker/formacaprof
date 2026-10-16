import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { RecordStatus } from '@prisma/client';
import { NOMES_REGIOES } from './regioes';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class CreateInstitutionDto {
  @ApiProperty({ example: 'EM Carolina de Jesus' })
  @IsString() @Length(3, 160)
  name!: string;

  @ApiPropertyOptional({ description: 'Gerado a partir do nome quando omitido.', example: 'em-carolina-de-jesus' })
  @IsOptional() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'slug deve conter apenas letras minúsculas, números e hífens.' }) @Length(2, 80)
  slug?: string;

  @ApiPropertyOptional({ description: 'Código da instituição em sistema externo (ex.: INEP).' })
  @IsOptional() @IsString() @Length(1, 60)
  externalId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  organizationId?: string;

  @ApiPropertyOptional({ enum: NOMES_REGIOES, description: 'Região do IBGE.' })
  @IsOptional() @IsIn(NOMES_REGIOES, { message: 'Região inválida. Use: ' + NOMES_REGIOES.join(', ') + '.' })
  region?: string;

  @ApiPropertyOptional({ example: 'Salvador' }) @IsOptional() @IsString() @Length(1, 80)
  city?: string;

  @ApiPropertyOptional({ example: 'BA' })
  @IsOptional() @Transform(upper) @Matches(/^[A-Z]{2}$/, { message: 'state deve ser a sigla da UF (2 letras).' })
  state?: string;
}

export class UpdateInstitutionDto extends PartialType(CreateInstitutionDto) {
  @ApiPropertyOptional({ enum: RecordStatus })
  @IsOptional() @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class ListInstitutionsQuery {
  @IsOptional() @IsString() @Length(1, 100) q?: string;
  @IsOptional() @IsEnum(RecordStatus) status?: RecordStatus;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}
