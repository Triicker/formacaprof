import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import { toNormalizedEmail } from '../common/tokens';

export const PASSWORD_RULE = { min: 8, max: 128 };
export const PASSWORD_MESSAGE = `A senha deve ter entre ${PASSWORD_RULE.min} e ${PASSWORD_RULE.max} caracteres.`;

export class LoginDto {
  @ApiProperty({ example: 'ana@escola.edu.br' })
  @Transform(toNormalizedEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, PASSWORD_RULE.max)
  password!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @Transform(toNormalizedEmail)
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  @MaxLength(254)
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @Length(20, 128)
  token!: string;

  @ApiProperty({ minLength: PASSWORD_RULE.min })
  @IsString()
  @Length(PASSWORD_RULE.min, PASSWORD_RULE.max, { message: PASSWORD_MESSAGE })
  password!: string;
}
