import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { EnrollmentStatus } from '@prisma/client';
import type { Actor } from '../common/actor';
import { CurrentActor } from '../common/decorators';
import { EnrollmentsService } from './enrollments.service';

/** Não há campo de instituição: ela vem só da URL, validada contra o vínculo de coordenação. */
export class CreateEnrollmentDto {
  @ApiProperty() @IsUUID() userId!: string;
  @ApiProperty() @IsUUID() collectionId!: string;
}

export class UpdateEnrollmentDto {
  @ApiProperty({ enum: EnrollmentStatus }) @IsEnum(EnrollmentStatus) status!: EnrollmentStatus;
}

export class AccessRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) message?: string;
}

@ApiTags('Coordenação')
@ApiCookieAuth()
@Controller('institutions/:id')
export class CoordinationController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Get('collections')
  @ApiOperation({ summary: 'Coleções publicadas com o direito da instituição e números consolidados' })
  collections(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.enrollments.institutionCollections(actor, id);
  }

  @Get('collections/:collectionId/enrollments')
  @ApiOperation({ summary: 'Matrículas da coleção na instituição, com progresso individual e consolidado' })
  list(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('collectionId', ParseUUIDPipe) collectionId: string) {
    return this.enrollments.listEnrollments(actor, id, collectionId);
  }

  @Post('collections/:collectionId/access-requests')
  @HttpCode(202)
  @ApiOperation({ summary: 'Coordenação pede ao administrador a liberação de uma coleção (não concede acesso)' })
  requestAccess(
    @CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string,
    @Param('collectionId', ParseUUIDPipe) collectionId: string, @Body() dto: AccessRequestDto,
  ) {
    return this.enrollments.requestAccess(actor, id, collectionId, dto.message);
  }

  @Post('enrollments')
  @ApiOperation({ summary: 'Matricula um membro da instituição numa coleção autorizada' })
  enroll(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateEnrollmentDto) {
    return this.enrollments.enroll(actor, id, dto);
  }

  @Patch('enrollments/:enrollmentId')
  @ApiOperation({ summary: 'Revoga ou reativa uma matrícula da instituição' })
  update(
    @CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string, @Body() dto: UpdateEnrollmentDto,
  ) {
    return this.enrollments.update(actor, id, enrollmentId, dto.status);
  }

  @Get('enrollments/:enrollmentId/progress')
  @ApiOperation({ summary: 'Progresso individual com aulas pendentes' })
  progress(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string) {
    return this.enrollments.enrollmentProgress(actor, id, enrollmentId);
  }
}

@Module({ controllers: [CoordinationController], providers: [EnrollmentsService] })
export class EnrollmentsModule {}
