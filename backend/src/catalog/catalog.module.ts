import { Controller, Get, Module, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { Actor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { CatalogService } from './catalog.service';

@ApiTags('Catálogo')
@ApiCookieAuth()
@Controller('collections')
export class CollectionsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  @ApiOperation({ summary: 'Vitrine do catálogo (sem links de mídias protegidas)' })
  list(@CurrentActor() actor: Actor) {
    return this.catalog.listCollections(actor);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Dados públicos da coleção' })
  get(@CurrentActor() actor: Actor, @Param('slug') slug: string) {
    return this.catalog.getCollection(actor, slug);
  }

  @Get(':slug/modules')
  @ApiOperation({ summary: 'Módulos e aulas (exige acesso efetivo à coleção)' })
  modules(@CurrentActor() actor: Actor, @Param('slug') slug: string) {
    return this.catalog.getModules(actor, slug);
  }
}

@ApiTags('Catálogo')
@ApiCookieAuth()
@Controller()
export class LessonsController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('modules/:id/lessons')
  @ApiOperation({ summary: 'Aulas do módulo (exige acesso efetivo)' })
  moduleLessons(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getModuleLessons(actor, id);
  }

  @Get('lessons/:id')
  @ApiOperation({ summary: 'Detalhe da aula com o endereço da mídia (exige acesso efetivo)' })
  lesson(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getLesson(actor, id);
  }

  @Get('platform/welcome-video')
  @ApiOperation({ summary: 'Vídeo de boas-vindas da plataforma' })
  welcome() {
    return this.catalog.welcomeVideo();
  }

  @Get('media/:id')
  @ApiOperation({ summary: 'Entrega a mídia após verificar a permissão (stream do arquivo ou redirecionamento)' })
  async media(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const m = await this.catalog.authorizeMedia(actor, id);
    res.setHeader('Cache-Control', 'private, no-store');
    if (m.kind === 'redirect') return res.redirect(302, m.url);
    res.type(m.mimeType);
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${m.fileName.replace(/[^\w.-]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(m.path);
  }
}

@Module({ controllers: [CollectionsController, LessonsController], providers: [CatalogService], exports: [CatalogService] })
export class CatalogModule {}
