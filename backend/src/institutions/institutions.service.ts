import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RecordStatus } from '@prisma/client';
import { AccessPolicy } from '../access/access-policy.service';
import { AuditService } from '../audit/audit.service';
import type { Actor } from '../common/actor';
import { slugify } from '../common/tokens';
import { PrismaService } from '../prisma/prisma.service';
import { REGIOES } from './regioes';
import { CreateInstitutionDto, ListInstitutionsQuery, UpdateInstitutionDto } from './institutions.dto';

const PUBLIC_FIELDS = {
  id: true, name: true, slug: true, externalId: true, region: true, city: true, state: true, status: true,
  organizationId: true, createdAt: true, updatedAt: true,
  organization: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.InstitutionSelect;

/** A UF precisa pertencer à região informada (tabela do IBGE). */
function assertLocal(region?: string, state?: string) {
  if (!region || !state) return;
  if (!REGIOES[region]?.includes(state)) throw new BadRequestException(`A UF ${state} não pertence à região ${region}.`);
}

@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessPolicy, private readonly audit: AuditService) {}

  /** Administrador vê todas; demais usuários veem apenas as instituições em que têm vínculo ativo. */
  async list(actor: Actor, q: ListInstitutionsQuery) {
    const where: Prisma.InstitutionWhereInput = {
      status: q.status,
      organizationId: q.organizationId,
      ...(q.q ? { name: { contains: q.q, mode: 'insensitive' } } : {}),
      ...(actor.isPlatformAdmin ? {} : { id: { in: actor.memberships.map((m) => m.institutionId) } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.institution.findMany({ where, select: PUBLIC_FIELDS, orderBy: { name: 'asc' }, take: q.limit, skip: q.offset }),
      this.prisma.institution.count({ where }),
    ]);
    return { items, total };
  }

  async get(actor: Actor, id: string) {
    this.access.assertCanViewInstitution(actor, id);
    const inst = await this.prisma.institution.findUnique({ where: { id }, select: PUBLIC_FIELDS });
    if (!inst) throw new NotFoundException('Instituição não encontrada.');
    return inst;
  }

  async create(actor: Actor, dto: CreateInstitutionDto) {
    await this.assertOrganization(dto.organizationId);
    assertLocal(dto.region, dto.state);
    const slug = dto.slug ?? (await this.uniqueSlug(slugify(dto.name)));
    return this.write(async (tx) => {
      const inst = await tx.institution.create({ data: { ...dto, name: dto.name.trim(), slug }, select: PUBLIC_FIELDS });
      await this.audit.record({ actorUserId: actor.userId, institutionId: inst.id, action: 'institution.created', entityType: 'institution', entityId: inst.id, metadata: { name: inst.name } }, tx);
      return inst;
    });
  }

  async update(actor: Actor, id: string, dto: UpdateInstitutionDto) {
    await this.assertOrganization(dto.organizationId);
    if (dto.region !== undefined || dto.state !== undefined) {
      const atual = await this.prisma.institution.findUnique({ where: { id }, select: { region: true, state: true } });
      assertLocal(dto.region ?? atual?.region ?? undefined, dto.state ?? atual?.state ?? undefined);
    }
    return this.write(async (tx) => {
      const inst = await tx.institution.update({ where: { id }, data: dto, select: PUBLIC_FIELDS });
      await this.audit.record({ actorUserId: actor.userId, institutionId: id, action: 'institution.updated', entityType: 'institution', entityId: id, metadata: { fields: Object.keys(dto) } }, tx);
      return inst;
    });
  }

  private async assertOrganization(organizationId?: string) {
    if (!organizationId) return;
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { status: true } });
    if (!org) throw new BadRequestException('Organização não encontrada.');
    if (org.status !== RecordStatus.active) throw new BadRequestException('Organização inativa.');
  }

  private async uniqueSlug(base: string) {
    const usados = new Set(
      (await this.prisma.institution.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((i) => i.slug),
    );
    if (!usados.has(base)) return base;
    for (let n = 2; ; n++) if (!usados.has(`${base}-${n}`)) return `${base}-${n}`;
  }

  private async write<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    try {
      return await this.prisma.$transaction(fn);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') throw new ConflictException('Já existe uma instituição com este slug ou código externo.');
        if (e.code === 'P2025') throw new NotFoundException('Instituição não encontrada.');
      }
      throw e;
    }
  }
}
