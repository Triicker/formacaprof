import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { UserStatus } from '@prisma/client';
import { PageQuery } from '../common/pagination';

/** Campos que o próprio usuário pode alterar. Qualquer outro campo é rejeitado (forbidNonWhitelisted). */
export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Ana Maria Souza' })
  @IsOptional() @IsString() @Length(3, 160)
  name?: string;

  @ApiPropertyOptional({ description: 'Marca o vídeo de boas-vindas como visto.' })
  @IsOptional() @Equals(true)
  welcomeSeen?: true;
}

export class ListUsersQuery extends PageQuery {
  @ApiPropertyOptional({ description: 'Busca por nome ou e-mail.' })
  @IsOptional() @IsString() @Length(1, 100) q?: string;

  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;

  @ApiPropertyOptional({ enum: ['professor', 'coordinator', 'platform_admin'] })
  @IsOptional() @IsIn(['professor', 'coordinator', 'platform_admin']) role?: 'professor' | 'coordinator' | 'platform_admin';

  @ApiPropertyOptional() @IsOptional() @IsUUID() institutionId?: string;

  @ApiPropertyOptional({ enum: ['name', 'createdAt', 'lastLoginAt'] })
  @IsOptional() @IsIn(['name', 'createdAt', 'lastLoginAt']) sort?: 'name' | 'createdAt' | 'lastLoginAt';
}

/** Dados que o administrador pode alterar. E-mail (identidade) e senha não são editáveis aqui. */
export class AdminUpdateUserDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3, 160) name?: string;
  @ApiPropertyOptional({ enum: UserStatus }) @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
}

/** Mudança de papel global: exige justificativa e a senha do próprio administrador (reautenticação). */
export class SetPlatformRoleDto {
  @ApiProperty({ description: 'true concede, false remove o papel de administrador geral.' })
  @IsBoolean() grant!: boolean;

  @ApiProperty({ minLength: 10 }) @IsString() @Length(10, 500) justification!: string;

  @ApiProperty({ description: 'Senha atual de quem está executando a ação.' })
  @IsString() @Length(1, 128) currentPassword!: string;
}
