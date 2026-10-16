import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { ListUsersQuery, UpdateMeDto, UpdateUserStatusDto } from './users.dto';
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
  @ApiOperation({ summary: 'Lista usuários (administrador geral)' })
  async list(@Query() q: ListUsersQuery) {
    const [items, total] = await this.users.list({ q: q.q, take: q.limit, skip: q.offset });
    return { items: items.map((u) => ({ ...u, platformRoles: u.platformRoles.map((r) => r.role) })), total };
  }

  @Patch(':id')
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Ativa ou desativa uma conta (administrador geral)' })
  setStatus(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserStatusDto) {
    return this.users.setStatus(actor, id, dto.status);
  }
}
