import { Body, Controller, Delete, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import {
  CreateCollectionDto, CreateLessonDto, CreateModuleDto, ReorderDto, UpdateCollectionDto, UpdateLessonDto, UpdateModuleDto,
} from './content-admin.dto';
import { ContentAdminService } from './content-admin.service';

/** Gestão do conteúdo oficial (somente administrador geral; coordenadores não editam nesta versão). */
@ApiTags('Administração global · Conteúdo')
@ApiCookieAuth()
@PlatformAdminOnly()
@Controller('admin')
export class ContentAdminController {
  constructor(private readonly content: ContentAdminService) {}

  @Get('collections')
  @ApiOperation({ summary: 'Todas as coleções (inclusive rascunho/arquivadas) com números' })
  list() { return this.content.listCollections(); }

  @Post('collections')
  @ApiOperation({ summary: 'Cria coleção (sempre como rascunho)' })
  create(@CurrentActor() a: Actor, @Body() dto: CreateCollectionDto) { return this.content.createCollection(a, dto); }

  @Get('collections/:id')
  @ApiOperation({ summary: 'Coleção com módulos e aulas em todos os estados (editor)' })
  get(@Param('id', ParseUUIDPipe) id: string) { return this.content.getCollection(id); }

  @Get('collections/:id/impact')
  @ApiOperation({ summary: 'Instituições, matrículas, conclusões e certificados afetados por mudanças na coleção' })
  impact(@Param('id', ParseUUIDPipe) id: string) { return this.content.impact(id); }

  @Patch('collections/:id')
  @ApiOperation({ summary: 'Edita dados/tema/status. Despublicar com pessoas afetadas exige confirmImpact + justification' })
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCollectionDto) { return this.content.updateCollection(a, id, dto); }

  @Post('collections/:id/modules')
  @ApiOperation({ summary: 'Cria módulo na coleção' })
  createModule(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateModuleDto) { return this.content.createModule(a, id, dto); }

  @Put('collections/:id/modules/order')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reordena os módulos (lista completa de ids)' })
  async reorderModules(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) { await this.content.reorderModules(a, id, dto.ids); }

  @Patch('modules/:id')
  @ApiOperation({ summary: 'Edita módulo' })
  updateModule(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModuleDto) { return this.content.updateModule(a, id, dto); }

  @Delete('modules/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Exclui módulo vazio' })
  async deleteModule(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { await this.content.deleteModule(a, id); }

  @Post('modules/:id/lessons')
  @ApiOperation({ summary: 'Cria aula no módulo' })
  createLesson(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLessonDto) { return this.content.createLesson(a, id, dto); }

  @Put('modules/:id/lessons/order')
  @HttpCode(204)
  @ApiOperation({ summary: 'Reordena as aulas do módulo (lista completa de ids)' })
  async reorderLessons(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReorderDto) { await this.content.reorderLessons(a, id, dto.ids); }

  @Patch('lessons/:id')
  @ApiOperation({ summary: 'Edita aula (mudanças que afetam a conclusão exigem confirmImpact + justification)' })
  updateLesson(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLessonDto) { return this.content.updateLesson(a, id, dto); }

  @Delete('lessons/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Exclui aula sem histórico de progresso (com histórico: arquivar)' })
  async deleteLesson(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { await this.content.deleteLesson(a, id); }
}

@Module({ controllers: [ContentAdminController], providers: [ContentAdminService] })
export class ContentAdminModule {}
