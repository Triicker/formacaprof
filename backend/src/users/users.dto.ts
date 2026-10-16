import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Equals, IsEnum, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { UserStatus } from '@prisma/client';

/** Campos que o próprio usuário pode alterar. Qualquer outro campo é rejeitado (forbidNonWhitelisted). */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Ana Maria Souza' })
  @IsOptional() @IsString() @Length(3, 160)
  name?: string;

  @ApiPropertyOptional({ description: 'Marca o vídeo de boas-vindas como visto.' })
  @IsOptional() @Equals(true)
  welcomeSeen?: true;
}

export class ListUsersQuery {
  @IsOptional() @IsString() @Length(1, 100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset = 0;
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus) status!: UserStatus;
}
