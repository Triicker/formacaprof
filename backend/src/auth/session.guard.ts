import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC, PLATFORM_ADMIN_ONLY } from '../common/decorators';
import { SessionService } from './session.service';

/** Guard global: toda rota exige sessão válida, exceto as marcadas com @Public(). */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly sessions: SessionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const token = this.sessions.readToken(req);
    const actor = token ? await this.sessions.resolve(token) : null;
    if (!actor) throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    req.actor = actor;

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_ONLY, targets) && !actor.isPlatformAdmin) {
      throw new ForbiddenException('Você não tem permissão para realizar esta ação.');
    }
    return true;
  }
}
