import { MembershipRole } from '@prisma/client';

export interface ActorMembership {
  id: string;
  institutionId: string;
  role: MembershipRole;
}

/** Usuário autenticado da requisição. Só contém vínculos ativos de instituições ativas. */
export interface Actor {
  userId: string;
  sessionId: string;
  email: string;
  isPlatformAdmin: boolean;
  memberships: ActorMembership[];
}

declare module 'express' {
  interface Request {
    actor?: Actor;
  }
}
