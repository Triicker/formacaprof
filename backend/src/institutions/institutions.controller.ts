import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { CreateInstitutionDto, ListInstitutionsQuery, UpdateInstitutionDto } from './institutions.dto';
import { InstitutionsService } from './institutions.service';

@ApiTags('Instituições')
@ApiCookieAuth()
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  @ApiOperation({ summary: 'Lista instituições (todas para o administrador; as próprias para os demais)' })
  list(@CurrentActor() actor: Actor, @Query() q: ListInstitutionsQuery) {
    return this.institutions.list(actor, q);
  }

  @Post()
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Cadastra instituição (administrador geral)' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateInstitutionDto) {
    return this.institutions.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes da instituição (administrador ou membro ativo)' })
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.institutions.get(actor, id);
  }

  @Patch(':id')
  @PlatformAdminOnly()
  @ApiOperation({ summary: 'Atualiza instituição (administrador geral)' })
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInstitutionDto) {
    return this.institutions.update(actor, id, dto);
  }
}
