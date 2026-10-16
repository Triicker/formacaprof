import { ForbiddenException, Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import type { Actor } from '../common/actor';

const SEM_PERMISSAO = 'Você não tem permissão para realizar esta ação.';

/**
 * Regras de autorização por ação e por recurso. Toda decisão de acesso a dados
 * institucionais passa por aqui; a interface apenas reflete estas regras.
 */
@Injectable()
export class AccessPolicy {
  isMember(actor: Actor, institutionId: string): boolean {
    return actor.memberships.some((m) => m.institutionId === institutionId);
  }

  isCoordinatorOf(actor: Actor, institutionId: string): boolean {
    return actor.memberships.some((m) => m.institutionId === institutionId && m.role === MembershipRole.coordinator);
  }

  /** Ver dados da instituição: administrador geral ou qualquer membro ativo. */
  assertCanViewInstitution(actor: Actor, institutionId: string): void {
    if (actor.isPlatformAdmin || this.isMember(actor, institutionId)) return;
    throw new ForbiddenException(SEM_PERMISSAO);
  }

  /** Listar/gerir membros: administrador geral ou coordenador da própria instituição. */
  assertCanManageMembers(actor: Actor, institutionId: string): void {
    if (actor.isPlatformAdmin || this.isCoordinatorOf(actor, institutionId)) return;
    throw new ForbiddenException(SEM_PERMISSAO);
  }

  /** Coordenadores convidam apenas professores; coordenadores só são convidados pelo administrador. */
  assertCanInvite(actor: Actor, institutionId: string, role: MembershipRole): void {
    if (actor.isPlatformAdmin) return;
    if (this.isCoordinatorOf(actor, institutionId) && role === MembershipRole.professor) return;
    throw new ForbiddenException(SEM_PERMISSAO);
  }

  /** Coordenador altera somente vínculos de professores da sua instituição, nunca o próprio. */
  assertCanChangeMembership(
    actor: Actor,
    target: { institutionId: string; role: MembershipRole; userId: string },
    changes: { role?: MembershipRole },
  ): void {
    if (actor.isPlatformAdmin) return;
    const ok =
      this.isCoordinatorOf(actor, target.institutionId) &&
      target.role === MembershipRole.professor &&
      target.userId !== actor.userId &&
      changes.role === undefined;
    if (!ok) throw new ForbiddenException(SEM_PERMISSAO);
  }

  assertPlatformAdmin(actor: Actor): void {
    if (!actor.isPlatformAdmin) throw new ForbiddenException(SEM_PERMISSAO);
  }
}
