import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AccessStatus, Collection, ContentStatus, EnrollmentStatus, InstitutionCollectionAccess, MembershipRole } from '@prisma/client';
import type { Actor } from '../common/actor';
import { PrismaService } from '../prisma/prisma.service';

export type DenialReason =
  | 'collection_unavailable'
  | 'no_institution'
  | 'institution_without_access'
  | 'access_suspended'
  | 'access_revoked'
  | 'access_expired'
  | 'not_enrolled'
  | 'enrollment_revoked';

export const DENIAL_MESSAGES: Record<DenialReason, string> = {
  collection_unavailable: 'Esta coleção ainda não está disponível.',
  no_institution: 'Sua conta não está vinculada a uma instituição.',
  institution_without_access: 'Sua instituição não possui acesso a esta coleção.',
  access_suspended: 'O acesso da sua instituição a esta coleção está suspenso.',
  access_revoked: 'O acesso da sua instituição a esta coleção foi encerrado.',
  access_expired: 'O acesso da sua instituição a esta coleção expirou.',
  not_enrolled: 'Você ainda não foi matriculado(a) nesta coleção. Procure a coordenação da sua escola.',
  enrollment_revoked: 'Sua matrícula nesta coleção foi encerrada. Procure a coordenação da sua escola.',
};

export type InstitutionAccessState = 'active' | 'suspended' | 'revoked' | 'expired' | 'none';

type CollectionRef = Pick<Collection, 'id' | 'status'>;

/**
 * Regra de acesso de quem estuda (professor ou coordenador cursando):
 *   1. coleção publicada; 2. direito institucional ativo e não expirado;
 *   3. vínculo ativo com a instituição (garantido pelo Actor); 4. matrícula individual ativa.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Instituição do contexto ativo. Com mais de um vínculo, o cliente precisa informar qual. */
  resolveContext(actor: Actor, institutionId?: string): string | null {
    if (institutionId) {
      if (!actor.memberships.some((m) => m.institutionId === institutionId)) {
        throw new ForbiddenException('Você não tem vínculo ativo com esta instituição.');
      }
      return institutionId;
    }
    const ids = [...new Set(actor.memberships.map((m) => m.institutionId))];
    if (ids.length <= 1) return ids[0] ?? null;
    throw new BadRequestException({
      statusCode: 400, code: 'INSTITUTION_CONTEXT_REQUIRED', message: 'Selecione a instituição ativa (institutionId).',
    });
  }

  accessState(access: Pick<InstitutionCollectionAccess, 'status' | 'expiresAt'> | null | undefined): InstitutionAccessState {
    if (!access) return 'none';
    if (access.status === AccessStatus.suspended) return 'suspended';
    if (access.status === AccessStatus.revoked) return 'revoked';
    if (access.expiresAt && access.expiresAt <= new Date()) return 'expired';
    return 'active';
  }

  private denialFor(state: InstitutionAccessState): DenialReason | null {
    switch (state) {
      case 'active': return null;
      case 'none': return 'institution_without_access';
      case 'suspended': return 'access_suspended';
      case 'revoked': return 'access_revoked';
      default: return 'access_expired';
    }
  }

  async institutionAccess(institutionId: string, collectionId: string) {
    const access = await this.prisma.institutionCollectionAccess.findUnique({
      where: { institutionId_collectionId: { institutionId, collectionId } },
    });
    return { access, state: this.accessState(access) };
  }

  async learnerAccess(userId: string, institutionId: string | null, collection: CollectionRef) {
    if (collection.status !== ContentStatus.published) return { ok: false as const, reason: 'collection_unavailable' as DenialReason };
    if (!institutionId) return { ok: false as const, reason: 'no_institution' as DenialReason };
    const { state } = await this.institutionAccess(institutionId, collection.id);
    const denial = this.denialFor(state);
    if (denial) return { ok: false as const, reason: denial, institutionAccess: state };
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { institutionId_userId_collectionId: { institutionId, userId, collectionId: collection.id } },
    });
    if (!enrollment) return { ok: false as const, reason: 'not_enrolled' as DenialReason, institutionAccess: state };
    if (enrollment.status === EnrollmentStatus.revoked) return { ok: false as const, reason: 'enrollment_revoked' as DenialReason, institutionAccess: state };
    return { ok: true as const, enrollment, institutionAccess: state };
  }

  async assertLearnerAccess(userId: string, institutionId: string | null, collection: CollectionRef) {
    const r = await this.learnerAccess(userId, institutionId, collection);
    if (!r.ok) throw new ForbiddenException({ statusCode: 403, code: r.reason.toUpperCase(), message: DENIAL_MESSAGES[r.reason] });
    return r.enrollment;
  }

  /**
   * Pode ver o conteúdo (módulos, aulas, mídias)? Administrador geral sempre; demais, se em ALGUMA
   * das suas instituições ativas forem aluno com acesso efetivo ou coordenador com direito institucional ativo.
   */
  async canViewContent(actor: Actor, collection: CollectionRef): Promise<boolean> {
    if (actor.isPlatformAdmin) return collection.status !== ContentStatus.archived;
    if (collection.status !== ContentStatus.published) return false;
    for (const m of actor.memberships) {
      if (m.role === MembershipRole.coordinator) {
        if ((await this.institutionAccess(m.institutionId, collection.id)).state === 'active') return true;
      }
      if ((await this.learnerAccess(actor.userId, m.institutionId, collection)).ok) return true;
    }
    return false;
  }

  async assertCanViewContent(actor: Actor, collection: CollectionRef) {
    if (!(await this.canViewContent(actor, collection))) {
      throw new ForbiddenException({ statusCode: 403, code: 'CONTENT_FORBIDDEN', message: 'Você não tem acesso a este conteúdo.' });
    }
  }
}
