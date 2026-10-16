import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, IsUUID, Length, Matches, Max, Min, ValidateIf,
} from 'class-validator';
import { ContentStatus, LessonType, ModuleKind } from '@prisma/client';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MSG = { message: 'slug deve conter apenas letras minúsculas, números e hífens.' };

/** Confirmação explícita para mudanças que afetam quem já está matriculado ou já concluiu. */
export class ImpactConfirmation {
  @ApiPropertyOptional({ description: 'Obrigatório (true) quando a API responder 409 IMPACT_CONFIRMATION_REQUIRED.' })
  @IsOptional() @IsBoolean() confirmImpact?: boolean;

  @ApiPropertyOptional({ description: 'Justificativa registrada na auditoria (obrigatória junto com confirmImpact).' })
  @IsOptional() @IsString() @Length(10, 500) justification?: string;
}

export class CreateCollectionDto {
  @ApiProperty() @IsString() @Length(3, 200) title!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG, SLUG_MSG) @Length(2, 80) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() coverAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() thumbnailAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) displayOrder?: number;
  @ApiPropertyOptional({ enum: ['basta', 'padrao'], description: 'Tema visual da coleção.' }) @IsOptional() @IsIn(['basta', 'padrao']) layout?: 'basta' | 'padrao';
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUrl({ protocols: ['https'], require_protocol: true }) institutoUrl?: string | null;
}

export class UpdateCollectionDto extends ImpactConfirmation {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 200) title?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG, SLUG_MSG) @Length(2, 80) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() coverAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() thumbnailAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) displayOrder?: number;
  @ApiPropertyOptional({ enum: ['basta', 'padrao'] }) @IsOptional() @IsIn(['basta', 'padrao']) layout?: 'basta' | 'padrao';
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsUrl({ protocols: ['https'], require_protocol: true }) institutoUrl?: string | null;
  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
}

export class CreateModuleDto extends ImpactConfirmation {
  @ApiProperty() @IsString() @Length(2, 200) title!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG, SLUG_MSG) @Length(2, 80) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiPropertyOptional({ enum: ModuleKind }) @IsOptional() @IsEnum(ModuleKind) kind?: ModuleKind;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() coverAssetId?: string | null;
  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
}

export class UpdateModuleDto extends ImpactConfirmation {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 200) title?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG, SLUG_MSG) @Length(2, 80) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 200) subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiPropertyOptional({ enum: ModuleKind }) @IsOptional() @IsEnum(ModuleKind) kind?: ModuleKind;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() coverAssetId?: string | null;
  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
}

export class CreateLessonDto extends ImpactConfirmation {
  @ApiProperty() @IsString() @Length(2, 200) title!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG, SLUG_MSG) @Length(1, 80) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiProperty({ enum: LessonType }) @IsEnum(LessonType) lessonType!: LessonType;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() mediaAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() thumbnailAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) @Max(86400) durationSeconds?: number | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() requiredForCompletion?: boolean;
  @ApiPropertyOptional({ description: 'Conteúdo provisório (ainda sem validação editorial).' }) @IsOptional() @IsBoolean() provisional?: boolean;
  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
}

export class UpdateLessonDto extends ImpactConfirmation {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2, 200) title?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(SLUG, SLUG_MSG) @Length(1, 80) slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) description?: string;
  @ApiPropertyOptional({ enum: LessonType }) @IsOptional() @IsEnum(LessonType) lessonType?: LessonType;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() mediaAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() thumbnailAssetId?: string | null;
  @ApiPropertyOptional() @IsOptional() @ValidateIf((_, v) => v !== null) @Type(() => Number) @IsInt() @Min(1) @Max(86400) durationSeconds?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requiredForCompletion?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() provisional?: boolean;
  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @ApiPropertyOptional({ description: 'Move a aula para outro módulo da mesma coleção.' }) @IsOptional() @IsUUID() moduleId?: string;
}

export class ReorderDto {
  @ApiProperty({ type: [String], description: 'Ids na nova ordem (todos os itens do pai).' })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @IsUUID('all', { each: true }) ids!: string[];
}
