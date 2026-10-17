import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Actor } from '../common/actor';
import { CurrentActor, Public } from '../common/decorators';
import { ContextQuery, FeedbackDto, UpdateLessonProgressDto } from './learning.dto';
import { LearningService } from './learning.service';

@ApiTags('Minha formação')
@ApiCookieAuth()
@Controller('me')
export class MeLearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('collections')
  @ApiOperation({ summary: 'Coleções com o estado efetivo do usuário (coming_soon | locked | available) e progresso' })
  collections(@CurrentActor() actor: Actor, @Query() q: ContextQuery) {
    return this.learning.myCollections(actor, q.institutionId);
  }

  @Get('enrollments')
  @ApiOperation({ summary: 'Matrículas do usuário' })
  enrollments(@CurrentActor() actor: Actor, @Query() q: ContextQuery) {
    return this.learning.myEnrollments(actor, q.institutionId);
  }

  @Get('enrollments/:id/progress')
  @ApiOperation({ summary: 'Progresso por aula e por módulo, calculado no servidor' })
  progress(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.enrollmentProgress(actor, id);
  }

  @Put('lessons/:id/progress')
  @ApiOperation({ summary: 'Registra reprodução/conclusão/curtida de uma aula (valida matrícula e pertencimento)' })
  updateProgress(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLessonProgressDto, @Query() q: ContextQuery) {
    return this.learning.updateLessonProgress(actor, id, dto, q.institutionId);
  }

  @Get('enrollments/:id/feedback')
  @ApiOperation({ summary: 'Avaliação já enviada nesta matrícula (ou null)' })
  myFeedback(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.myFeedback(actor, id);
  }

  @Post('enrollments/:id/feedback')
  @ApiOperation({ summary: 'Avaliação da formação (uma por matrícula; um novo envio substitui a anterior)' })
  feedback(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FeedbackDto) {
    return this.learning.submitFeedback(actor, id, dto);
  }

  @Post('enrollments/:id/certificate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Emite o certificado se a regra de conclusão for satisfeita (idempotente)' })
  issue(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.issueCertificate(actor, id);
  }

  @Get('certificates')
  @ApiOperation({ summary: 'Certificados do usuário' })
  certificates(@CurrentActor() actor: Actor) {
    return this.learning.myCertificates(actor);
  }

  @Get('certificates/:id')
  @ApiOperation({ summary: 'Certificado do usuário' })
  certificate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.myCertificate(actor, id);
  }
}

@ApiTags('Minha formação')
@Controller('certificates')
export class CertificateVerificationController {
  constructor(private readonly learning: LearningService) {}

  @Public()
  @Get('verify/:code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Verificação pública de autenticidade pelo código impresso no certificado' })
  verify(@Param('code') code: string) {
    return this.learning.verifyCertificate(code);
  }
}

@Module({ controllers: [MeLearningController, CertificateVerificationController], providers: [LearningService] })
export class LearningModule {}
