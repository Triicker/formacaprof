import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { CompletionSource } from '@prisma/client';

export class ContextQuery {
  @ApiPropertyOptional({ description: 'Instituição ativa (obrigatória quando o usuário tem mais de um vínculo).' })
  @IsOptional() @IsUUID()
  institutionId?: string;
}

/**
 * O cliente informa apenas fatos (posição de reprodução, conclusão, curtida).
 * Percentuais e totais nunca são aceitos: são calculados no servidor.
 */
export class UpdateLessonProgressDto {
  @ApiPropertyOptional({ description: 'Matrícula a usar; se omitida, é derivada da coleção da aula + instituição ativa.' })
  @IsOptional() @IsUUID()
  enrollmentId?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  completed?: boolean;

  @ApiPropertyOptional({ enum: CompletionSource, description: 'manual = botão; player = fim da reprodução.' })
  @IsOptional() @IsEnum(CompletionSource)
  source?: CompletionSource;

  @ApiPropertyOptional({ description: 'Posição de reprodução em segundos (limitada à duração da aula).' })
  @IsOptional() @IsInt() @Min(0) @Max(86_400)
  watchedSeconds?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  liked?: boolean;
}

export class FeedbackDto {
  @IsInt() @Min(1) @Max(5) experience!: number;
  @IsInt() @Min(1) @Max(5) usefulness!: number;
  @IsInt() @Min(1) @Max(5) navigation!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}
