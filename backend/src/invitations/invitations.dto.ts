import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { toNormalizedEmail } from '../common/tokens';
import { MembershipRole } from '@prisma/client';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from '../auth/auth.dto';

/** Não há campo de instituição: ela vem exclusivamente da URL, validada contra as permissões do autor. */
export class CreateInvitationDto {
  @ApiProperty({ example: 'professora@escola.edu.br' })
  @Transform(toNormalizedEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' }) @MaxLength(254)
  email!: string;

  @ApiProperty({ enum: MembershipRole })
  @IsEnum(MembershipRole)
  role!: MembershipRole;
}

export class InvitationTokenDto {
  @ApiProperty() @IsString() @Length(20, 128)
  token!: string;
}

/** Não há campos de instituição, papel ou e-mail: tudo é derivado do convite validado. */
export class AcceptInvitationDto extends InvitationTokenDto {
  @ApiPropertyOptional({ description: 'Obrigatório quando ainda não existe conta com o e-mail do convite.' })
  @IsOptional() @IsString() @Length(3, 160)
  name?: string;

  @ApiProperty({ description: 'Nova senha (conta nova) ou senha atual (conta já existente).' })
  @IsString() @Length(PASSWORD_RULE.min, PASSWORD_RULE.max, { message: PASSWORD_MESSAGE })
  password!: string;
}
