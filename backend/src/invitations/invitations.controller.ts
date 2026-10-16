import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Actor } from '../common/actor';
import { CurrentActor, Public } from '../common/decorators';
import { AcceptInvitationDto, CreateInvitationDto, InvitationTokenDto } from './invitations.dto';
import { InvitationsService } from './invitations.service';

const QUINZE_MIN = 15 * 60_000;

@ApiTags('Convites')
@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('institutions/:id/invitations')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Convida para a instituição (admin: professor/coordenador; coordenador: apenas professor da própria instituição)' })
  create(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateInvitationDto) {
    return this.invitations.create(actor, id, dto);
  }

  @Get('institutions/:id/invitations')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Convites da instituição (admin ou coordenador da própria instituição)' })
  list(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.list(actor, id);
  }

  @Delete('institutions/:id/invitations/:invitationId')
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoga um convite pendente' })
  async revoke(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    await this.invitations.revoke(actor, id, invitationId);
  }

  @Public()
  @Post('invitations/preview')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: QUINZE_MIN } })
  @ApiOperation({ summary: 'Dados do convite para a tela de aceite (token no corpo, nunca na URL da API)' })
  preview(@Body() dto: InvitationTokenDto) {
    return this.invitations.preview(dto.token);
  }

  @Public()
  @Post('invitations/accept')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: QUINZE_MIN } })
  @ApiOperation({ summary: 'Aceita o convite: cria a conta (ou vincula a existente), o vínculo e a sessão' })
  accept(@Body() dto: AcceptInvitationDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.invitations.accept(dto, req, res);
  }
}
