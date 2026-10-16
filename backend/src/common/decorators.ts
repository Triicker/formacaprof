import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { Actor } from './actor';

export const IS_PUBLIC = 'isPublic';
/** Rota acessível sem sessão (login, convites, recuperação de senha, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PLATFORM_ADMIN_ONLY = 'platformAdminOnly';
/** Restringe a rota ao administrador geral da plataforma. */
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_ONLY, true);

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return req.actor as Actor;
});
