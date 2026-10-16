import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Actor } from '../common/actor';
import { CurrentActor, Public } from '../common/decorators';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto, LoginDto, ResetPasswordDto } from './auth.dto';
import { AuthService } from './auth.service';

const QUINZE_MIN = 15 * 60_000;

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly users: UsersService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Login por e-mail e senha; cria a sessão em cookie HttpOnly' })
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(dto.email, dto.password, req, res);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  @ApiOperation({ summary: 'Revoga a sessão atual' })
  async logout(@CurrentActor() actor: Actor, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(actor, res);
  }

  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Usuário autenticado (401 se não houver sessão válida)' })
  me(@CurrentActor() actor: Actor) {
    return this.users.profile(actor.userId);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(202)
  @Throttle({ default: { limit: 5, ttl: QUINZE_MIN } })
  @ApiOperation({ summary: 'Envia link de redefinição (resposta igual exista ou não a conta)' })
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    return { message: 'Se houver uma conta com este e-mail, enviaremos as instruções.' };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: QUINZE_MIN } })
  @ApiOperation({ summary: 'Define nova senha com token de uso único e encerra as sessões abertas' })
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }
}
