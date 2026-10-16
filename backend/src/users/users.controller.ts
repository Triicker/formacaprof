import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { AdminUpdateUserDto, ListUsersQuery, SetPlatformRoleDto, UpdateMeDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('Usuários')
@ApiCookieAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Dados do usuário autenticado, papéis e vínculos ativos' })
  me(@CurrentActor() actor: Actor) {
    return this.users.profile(actor.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza dados pessoais permitidos (nome, boas-vindas visto)' })
  updateMe(@CurrentActor() actor: Actor, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(actor, dto);
  }

  @Get()
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Lista usuários com busca, filtros (status, papel, instituição), ordenação e paginação' })
  list(@Query() q: ListUsersQuery) {
    return this.users.list(q);
  }

  @Get(':id')
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Detalhe do usuário: vínculos (todos os status), papéis, sessões ativas, convites pendentes' })
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.detail(id);
  }

  @Patch(':id')
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Altera nome e/ou status da conta (desativar encerra as sessões)' })
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminUpdateUserDto) {
    return this.users.adminUpdate(actor, id, dto);
  }

  @Post(':id/sessions/revoke')
  @HttpCode(200)
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Encerra todas as sessões abertas do usuário' })
  revokeSessions(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.revokeSessions(actor, id);
  }

  @Put(':id/platform-role')
  @PlatformAdminOnly()
  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @ApiOperation({ summary: 'Concede/remove administrador geral (senha do executor + justificativa; auditado)' })
  setPlatformRole(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SetPlatformRoleDto) {
    return this.users.setPlatformRole(actor, id, dto);
  }
}
