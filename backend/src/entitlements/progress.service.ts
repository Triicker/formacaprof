import { Injectable } from '@nestjs/common';
import { ContentStatus, Enrollment, LessonProgressStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;

export interface ProgressSummary {
  requiredTotal: number;
  requiredCompleted: number;
  percent: number;
  status: 'not_started' | 'in_progress' | 'completed';
  next: { lessonId: string; slug: string; title: string; moduleSlug: string } | null;
}

/**
 * Regra de conclusão (calculada SEMPRE no servidor):
 * - Contam apenas aulas `required_for_completion` publicadas, em módulos publicados da coleção da matrícula.
 * - Uma aula conta quando seu progresso está `completed` (conclusão híbrida: botão "marcar como assistida"
 *   ou fim da reprodução no player — ambas registradas com a origem).
 * - O percentual é derivado dessas contagens; o cliente nunca envia percentual.
 */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  private publishedLessons(collectionId: string, db: Db) {
    return db.lesson.findMany({
      where: { status: ContentStatus.published, module: { collectionId, status: ContentStatus.published } },
      select: {
        id: true, slug: true, title: true, lessonType: true, requiredForCompletion: true, displayOrder: true,
        module: { select: { id: true, slug: true, title: true, kind: true, displayOrder: true } },
      },
      orderBy: [{ module: { displayOrder: 'asc' } }, { displayOrder: 'asc' }],
    });
  }

  async detail(enrollment: Pick<Enrollment, 'id' | 'collectionId'>, db: Db = this.prisma) {
    const [lessons, rows] = await Promise.all([
      this.publishedLessons(enrollment.collectionId, db),
      db.lessonProgress.findMany({ where: { enrollmentId: enrollment.id } }),
    ]);
    const byLesson = new Map(rows.map((r) => [r.lessonId, r]));
    const items = lessons.map((l) => {
      const p = byLesson.get(l.id);
      return {
        lessonId: l.id, slug: l.slug, title: l.title, lessonType: l.lessonType, required: l.requiredForCompletion,
        moduleId: l.module.id, moduleSlug: l.module.slug,
        status: p?.status ?? 'not_started',
        completedAt: p?.completedAt ?? null, watchedSeconds: p?.watchedSeconds ?? 0, liked: p?.liked ?? false,
      };
    });
    const required = items.filter((i) => i.required);
    const done = required.filter((i) => i.status === LessonProgressStatus.completed);
    const next = required.find((i) => i.status !== LessonProgressStatus.completed);

    const modules = new Map<string, { id: string; slug: string; title: string; kind: string; requiredTotal: number; requiredCompleted: number }>();
    for (const l of lessons) {
      if (!modules.has(l.module.id)) modules.set(l.module.id, { ...l.module, requiredTotal: 0, requiredCompleted: 0 });
    }
    for (const i of required) {
      const m = modules.get(i.moduleId)!;
      m.requiredTotal++;
      if (i.status === LessonProgressStatus.completed) m.requiredCompleted++;
    }

    const summary: ProgressSummary = {
      requiredTotal: required.length,
      requiredCompleted: done.length,
      percent: required.length ? Math.round((done.length / required.length) * 100) : 0,
      status: required.length && done.length === required.length ? 'completed' : rows.length ? 'in_progress' : 'not_started',
      next: next ? { lessonId: next.lessonId, slug: next.slug, title: next.title, moduleSlug: next.moduleSlug } : null,
    };
    return {
      summary,
      modules: [...modules.values()].map(({ id, slug, title, kind, requiredTotal, requiredCompleted }) => ({ id, slug, title, kind, requiredTotal, requiredCompleted })),
      lessons: items.map(({ moduleId: _m, ...rest }) => rest),
    };
  }

  /** Percentuais de muitas matrículas com duas consultas (relatórios e exportações). */
  async bulk(enrollments: Pick<Enrollment, 'id' | 'collectionId'>[]) {
    const out = new Map<string, { requiredTotal: number; requiredCompleted: number; percent: number }>();
    if (!enrollments.length) return out;
    const colecoes = [...new Set(enrollments.map((e) => e.collectionId))];
    const obrigatorias = await this.prisma.lesson.findMany({
      where: { status: ContentStatus.published, requiredForCompletion: true, module: { collectionId: { in: colecoes }, status: ContentStatus.published } },
      select: { id: true, module: { select: { collectionId: true } } },
    });
    const totalPorColecao = new Map<string, number>();
    for (const l of obrigatorias) totalPorColecao.set(l.module.collectionId, (totalPorColecao.get(l.module.collectionId) ?? 0) + 1);
    const feitas = await this.prisma.lessonProgress.groupBy({
      by: ['enrollmentId'],
      where: { enrollmentId: { in: enrollments.map((e) => e.id) }, status: LessonProgressStatus.completed, lessonId: { in: obrigatorias.map((l) => l.id) } },
      _count: { _all: true },
    });
    const feitasPor = new Map(feitas.map((f) => [f.enrollmentId, f._count._all]));
    for (const e of enrollments) {
      const total = totalPorColecao.get(e.collectionId) ?? 0;
      const concl = feitasPor.get(e.id) ?? 0;
      out.set(e.id, { requiredTotal: total, requiredCompleted: concl, percent: total ? Math.round((concl / total) * 100) : 0 });
    }
    return out;
  }

  async summary(enrollment: Pick<Enrollment, 'id' | 'collectionId'>, db: Db = this.prisma): Promise<ProgressSummary> {
    return (await this.detail(enrollment, db)).summary;
  }

  /**
   * Mantém enrollments.completed_at coerente com a regra (preenche ao concluir, limpa se deixar de cumprir).
   * Política de versão curricular: com certificado emitido, a conclusão é definitiva e não é desfeita
   * por mudanças posteriores no conteúdo.
   */
  async syncCompletion(enrollment: Pick<Enrollment, 'id' | 'collectionId' | 'completedAt'>, db: Db = this.prisma) {
    const s = await this.summary(enrollment, db);
    const done = s.status === 'completed';
    if (done && !enrollment.completedAt) await db.enrollment.update({ where: { id: enrollment.id }, data: { completedAt: new Date() } });
    if (!done && enrollment.completedAt) {
      const certificado = await db.certificate.findUnique({ where: { enrollmentId: enrollment.id }, select: { revokedAt: true } });
      if (!certificado || certificado.revokedAt) await db.enrollment.update({ where: { id: enrollment.id }, data: { completedAt: null } });
    }
    return s;
  }
}
