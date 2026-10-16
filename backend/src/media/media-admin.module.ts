import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, Injectable, Module, NotFoundException,
  NotImplementedException, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUrl, Length, Max, Min } from 'class-validator';
import { MediaVisibility, Prisma, RecordStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { AuditService } from '../audit/audit.service';
import { mediaUrl } from '../catalog/media-url';
import type { Actor } from '../common/actor';
import { CurrentActor, PlatformAdminOnly } from '../common/decorators';
import { pageArgs, pageResult, PageQuery } from '../common/pagination';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { PrismaService } from '../prisma/prisma.service';

/** Teto absoluto do upload pela API (o limite por tipo vem da configuração). Vídeos grandes: upload direto ao storage. */
const TETO_UPLOAD = 50 * 1024 * 1024;

type Tipo = 'image' | 'pdf' | 'video';
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf', 'video/mp4': 'mp4', 'video/webm': 'webm' };
const tipoDe = (mime: string): Tipo => (mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : 'video');

/** Identifica o formato pelos primeiros bytes (não confia na extensão nem no Content-Type do navegador). SVG não é aceito. */
export function sniffMime(b: Buffer): string | null {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (b.length >= 4 && b.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
  return null;
}

const bool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

export class MediaQuery extends PageQuery {
  @ApiPropertyOptional({ enum: ['image', 'pdf', 'video'] }) @IsOptional() @IsIn(['image', 'pdf', 'video']) kind?: Tipo;
  @ApiPropertyOptional({ description: 'Somente arquivos não usados em coleções, módulos ou aulas.' }) @IsOptional() @Transform(bool) @IsBoolean() unused?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) q?: string;
}

export class UploadMediaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @ApiPropertyOptional({ enum: MediaVisibility, description: 'Padrão: imagens públicas; PDFs e vídeos protegidos.' }) @IsOptional() @IsEnum(MediaVisibility) visibility?: MediaVisibility;
}

export class ExternalMediaDto {
  @ApiProperty({ example: 'https://midiasave-5c064.web.app/video1.mp4' }) @IsUrl({ protocols: ['https'], require_protocol: true }) externalUrl!: string;
  @ApiProperty({ enum: ['video/mp4', 'video/webm', 'application/pdf'] }) @IsIn(['video/mp4', 'video/webm', 'application/pdf']) mimeType!: string;
  @ApiProperty() @IsString() @Length(1, 160) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(86400) durationSeconds?: number;
}

export class UpdateMediaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 160) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) description?: string;
  @ApiPropertyOptional({ enum: MediaVisibility }) @IsOptional() @IsEnum(MediaVisibility) visibility?: MediaVisibility;
}

const USO = { collectionCovers: true, collectionThumbnails: true, moduleCovers: true, lessonMedia: true, lessonThumbnails: true } as const;
const naoUsado: Prisma.MediaAssetWhereInput = {
  collectionCovers: { none: {} }, collectionThumbnails: { none: {} }, moduleCovers: { none: {} }, lessonMedia: { none: {} }, lessonThumbnails: { none: {} },
  OR: [{ key: null }, { NOT: { key: { startsWith: 'platform.' } } }],
};

@Injectable()
export class MediaAdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private limiteMb(tipo: Tipo) {
    const m = this.config.media;
    return tipo === 'image' ? m.maxImageMb : tipo === 'pdf' ? m.maxPdfMb : m.maxVideoMb;
  }

  /** Valida conteúdo/tamanho e grava em STORAGE_DIR/uploads/AAAA/MM/<uuid>.<ext>. */
  private async gravar(file: Express.Multer.File | undefined, tipoEsperado?: Tipo) {
    if (!file?.buffer?.length) throw new BadRequestException('Envie um arquivo.');
    const mime = sniffMime(file.buffer);
    if (!mime) throw new BadRequestException('Formato não suportado. Envie PNG, JPG, WEBP, PDF, MP4 ou WEBM.');
    const tipo = tipoDe(mime);
    if (tipoEsperado && tipo !== tipoEsperado) throw new BadRequestException('A substituição precisa ser do mesmo tipo do arquivo original.');
    const limite = this.limiteMb(tipo);
    if (tipo === 'video' && limite === 0) {
      throw new BadRequestException('Upload de vídeo pela API está desativado: registre o link externo do vídeo ou use o upload direto ao armazenamento (R2).');
    }
    if (file.size > limite * 1024 * 1024) throw new BadRequestException(`Arquivo acima do limite de ${limite} MB para este tipo.`);

    const agora = new Date();
    const key = `uploads/${agora.getUTCFullYear()}/${String(agora.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${EXT[mime]}`;
    const caminho = resolve(this.config.storageDir, key);
    if (!caminho.startsWith(this.config.storageDir + sep)) throw new BadRequestException('Caminho inválido.');
    await mkdir(dirname(caminho), { recursive: true });
    await writeFile(caminho, file.buffer, { flag: 'wx' });
    const original = (file.originalname || 'arquivo').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    return { key, mime, tipo, size: file.size, original };
  }

  async list(q: MediaQuery) {
    const where: Prisma.MediaAssetWhereInput = {
      status: RecordStatus.active,
      ...(q.kind === 'image' ? { mimeType: { startsWith: 'image/' } } : q.kind === 'video' ? { mimeType: { startsWith: 'video/' } } : q.kind === 'pdf' ? { mimeType: 'application/pdf' } : {}),
      ...(q.unused ? naoUsado : {}),
      ...(q.q ? { OR: [{ key: { contains: q.q, mode: 'insensitive' } }, { metadata: { path: ['title'], string_contains: q.q } }, { metadata: { path: ['fileName'], string_contains: q.q } }] } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.mediaAsset.findMany({ where, ...pageArgs(q), orderBy: { createdAt: q.order ?? 'desc' }, include: { _count: { select: USO } } }),
      this.prisma.mediaAsset.count({ where }),
    ]);
    return pageResult(rows.map((a) => this.present(a)), total, q);
  }

  private present(a: Prisma.MediaAssetGetPayload<{ include: { _count: { select: typeof USO } } }>) {
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const uso = Object.values(a._count).reduce((n, v) => n + v, 0) + (a.key?.startsWith('platform.') ? 1 : 0);
    return {
      id: a.id, key: a.key, storageProvider: a.storageProvider, mimeType: a.mimeType, kind: tipoDe(a.mimeType), fileSize: a.fileSize, visibility: a.visibility,
      title: (meta.title as string) ?? (meta.fileName as string) ?? a.key ?? 'Sem título', description: (meta.description as string) ?? null,
      // Para o administrador, a pré-visualização também passa pelo portão /media/:id (nunca o link externo cru).
      url: mediaUrl(a) ?? `/api/v1/media/${a.id}`, usage: a._count, usageTotal: uso, provisional: meta.editorial === 'placeholder',
      createdAt: a.createdAt, updatedAt: a.updatedAt, replacements: Array.isArray(meta.history) ? meta.history.length : 0,
    };
  }

  async upload(actor: Actor, file: Express.Multer.File | undefined, dto: UploadMediaDto) {
    const g = await this.gravar(file);
    const visibility = dto.visibility ?? (g.tipo === 'image' ? MediaVisibility.public : MediaVisibility.protected);
    const a = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          storageProvider: 'local', storageKey: g.key, mimeType: g.mime, fileSize: g.size, visibility,
          metadata: { title: dto.title?.trim() || g.original, description: dto.description?.trim() || null, fileName: g.original },
        },
        include: { _count: { select: USO } },
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'media.uploaded', entityType: 'media', entityId: asset.id, metadata: { mimeType: g.mime, size: g.size } }, tx);
      return asset;
    });
    return this.present(a);
  }

  async registerExternal(actor: Actor, dto: ExternalMediaDto) {
    const a = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          storageProvider: 'external', externalUrl: dto.externalUrl, mimeType: dto.mimeType, visibility: MediaVisibility.protected,
          metadata: { title: dto.title.trim(), description: dto.description?.trim() || null, ...(dto.durationSeconds ? { durationSeconds: dto.durationSeconds } : {}) },
        },
        include: { _count: { select: USO } },
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'media.registered', entityType: 'media', entityId: asset.id, metadata: { mimeType: dto.mimeType } }, tx);
      return asset;
    });
    return this.present(a);
  }

  async update(actor: Actor, id: string, dto: UpdateMediaDto) {
    const a = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!a || a.status !== RecordStatus.active) throw new NotFoundException('Arquivo não encontrado.');
    if (dto.visibility === MediaVisibility.protected && a.storageProvider === 'static') {
      throw new BadRequestException('Arquivos estáticos do site são sempre públicos. Envie o arquivo pela biblioteca para protegê-lo.');
    }
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const r = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.update({
        where: { id },
        data: {
          ...(dto.visibility ? { visibility: dto.visibility } : {}),
          metadata: { ...meta, ...(dto.title !== undefined ? { title: dto.title.trim() } : {}), ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}) } as Prisma.InputJsonValue,
        },
        include: { _count: { select: USO } },
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'media.updated', entityType: 'media', entityId: id, metadata: { fields: Object.keys(dto) } }, tx);
      return asset;
    });
    return this.present(r);
  }

  /** Substituição controlada: mesmo tipo, mesmo id (as associações continuam valendo); o arquivo anterior fica no histórico. */
  async replace(actor: Actor, id: string, file: Express.Multer.File | undefined) {
    const a = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!a || a.status !== RecordStatus.active) throw new NotFoundException('Arquivo não encontrado.');
    if (a.storageProvider !== 'local') throw new BadRequestException('Só arquivos enviados pela biblioteca podem ser substituídos. Para links externos, registre uma nova mídia.');
    const g = await this.gravar(file, tipoDe(a.mimeType));
    const meta = (a.metadata ?? {}) as Record<string, unknown>;
    const historico = Array.isArray(meta.history) ? meta.history : [];
    const r = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.update({
        where: { id },
        data: {
          storageKey: g.key, mimeType: g.mime, fileSize: g.size,
          metadata: { ...meta, fileName: g.original, history: [...historico, { storageKey: a.storageKey, fileSize: a.fileSize, replacedAt: new Date().toISOString(), by: actor.userId }] },
        },
        include: { _count: { select: USO } },
      });
      await this.audit.record({ actorUserId: actor.userId, action: 'media.replaced', entityType: 'media', entityId: id, metadata: { previousKey: a.storageKey, size: g.size } }, tx);
      return asset;
    });
    return this.present(r);
  }

  /** Remoção lógica, apenas de arquivos sem uso (o arquivo físico permanece até a rotina de limpeza). */
  async remove(actor: Actor, id: string) {
    const a = await this.prisma.mediaAsset.findFirst({ where: { id, status: RecordStatus.active, ...naoUsado } });
    if (!a) {
      const existe = await this.prisma.mediaAsset.count({ where: { id, status: RecordStatus.active } });
      if (existe) throw new ConflictException('Arquivo em uso por coleções, módulos ou aulas. Troque a associação antes de remover.');
      throw new NotFoundException('Arquivo não encontrado.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({ where: { id }, data: { status: RecordStatus.inactive } });
      await this.audit.record({ actorUserId: actor.userId, action: 'media.deleted', entityType: 'media', entityId: id }, tx);
    });
  }

  /** Upload direto ao storage com credencial temporária (vídeos grandes). Preparado para Cloudflare R2. */
  directUpload() {
    throw new NotImplementedException({
      statusCode: 501, code: 'DIRECT_UPLOAD_NOT_CONFIGURED',
      message: this.config.media.directUpload === 'r2'
        ? 'Integração com R2 ainda não habilitada nesta versão.'
        : 'Upload direto não configurado. Defina MEDIA_DIRECT_UPLOAD=r2 e as credenciais do bucket (Etapa futura) ou registre o link externo do vídeo.',
    });
  }
}

@ApiTags('Administração global · Mídia')
@ApiCookieAuth()
@PlatformAdminOnly()
@Controller('admin/media')
export class MediaAdminController {
  constructor(private readonly media: MediaAdminService) {}

  @Get()
  @ApiOperation({ summary: 'Biblioteca de mídia (filtros: tipo, não utilizados, busca)' })
  list(@Query() q: MediaQuery) { return this.media.list(q); }

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, title: { type: 'string' }, description: { type: 'string' }, visibility: { type: 'string', enum: ['public', 'protected'] } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TETO_UPLOAD, files: 1 } }))
  @ApiOperation({ summary: 'Envia imagem/PDF (validação de tipo pelo conteúdo e de tamanho)' })
  upload(@CurrentActor() a: Actor, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadMediaDto) { return this.media.upload(a, file, dto); }

  @Post('external')
  @ApiOperation({ summary: 'Registra mídia hospedada fora (ex.: vídeo atual). Entregue só via /media/:id após autorização' })
  external(@CurrentActor() a: Actor, @Body() dto: ExternalMediaDto) { return this.media.registerExternal(a, dto); }

  @Post('direct-upload')
  @ApiOperation({ summary: 'Credencial temporária para upload direto ao storage (preparado para R2)' })
  direct() { return this.media.directUpload(); }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita título, descrição e visibilidade' })
  update(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaDto) { return this.media.update(a, id, dto); }

  @Post(':id/replace')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TETO_UPLOAD, files: 1 } }))
  @ApiOperation({ summary: 'Substitui o arquivo mantendo o mesmo id (histórico preservado)' })
  replace(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) { return this.media.replace(a, id, file); }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove (lógico) arquivo não utilizado' })
  async remove(@CurrentActor() a: Actor, @Param('id', ParseUUIDPipe) id: string) { await this.media.remove(a, id); }
}

@Module({ controllers: [MediaAdminController], providers: [MediaAdminService] })
export class MediaAdminModule {}
