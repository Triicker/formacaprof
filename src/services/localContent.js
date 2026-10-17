// Catálogo e progresso do MODO DEMONSTRAÇÃO (VITE_API_MODE=mock), a partir de src/mock/seed.js.
// No modo http tudo isso vem da API (httpApi.js). As duas implementações expõem a mesma interface,
// sempre parametrizada pela coleção (slug), para as telas não dependerem de onde vêm os dados.
import { BASTA, COLECOES, MODULOS, VIDEOS_PROJETO } from '../mock/seed';

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const allMaterialVideos = () => MODULOS.flatMap((m) => m.videos.map((v) => ({ ...v, modulo: m.slug })));
const paraVideo = (v, provisorio) => ({ ...v, lessonId: v.id, provisorio });
const modulosDemo = () => MODULOS.map((m) => ({
  slug: m.slug,
  titulo: m.titulo,
  subtitulo: m.subtitulo,
  livro: m.livro,
  // Na demonstração os capítulos reaproveitam os vídeos de apresentação: conteúdo provisório.
  // Planos de aula só existem no modo http (PDF protegido servido pela API); a demonstração não publica PDFs.
  documentos: [],
  videos: m.videos.map((v) => paraVideo(v, true)),
}));

function assertBasta(slug) {
  if (slug !== 'basta') throw new ApiError('Esta coleção ainda não está disponível.', 403, 'COLLECTION_UNAVAILABLE');
}

/**
 * @param progressFor  () => { assistidos: string[], curtidos: string[] } do usuário atual (lança se não houver sessão)
 * @param persist      () => void, grava o estado
 * @param saveFeedback (feedback) => void
 */
export function createContentApi({ progressFor, persist, saveFeedback, delay = async () => {} }) {
  function progresso() {
    const p = progressFor();
    const videos = allMaterialVideos();
    const total = videos.length;
    const feitos = videos.filter((v) => p.assistidos.includes(v.id)).length;
    const proximo = videos.find((v) => !p.assistidos.includes(v.id));
    return {
      assistidos: p.assistidos,
      curtidos: p.curtidos,
      totalVideos: total,
      videosAssistidos: feitos,
      totalModulos: MODULOS.length,
      modulosConcluidos: MODULOS.filter((m) => m.videos.every((v) => p.assistidos.includes(v.id))).length,
      percentual: Math.round((feitos / total) * 100),
      proximo: proximo ? { modulo: proximo.modulo, videoId: proximo.id, titulo: proximo.titulo } : null,
      porModulo: MODULOS.map((m) => ({
        slug: m.slug, titulo: m.titulo, total: m.videos.length, assistidos: m.videos.filter((v) => p.assistidos.includes(v.id)).length,
      })),
    };
  }

  function card(c) {
    if (!c.disponivel) return { id: c.slug, slug: c.slug, titulo: c.titulo, capa: c.capa, status: 'coming_soon', motivo: 'collection_unavailable', layout: null };
    const p = progresso();
    return {
      id: c.slug, slug: c.slug, titulo: c.titulo, capa: c.capa, status: 'available', matriculaId: 'demo',
      layout: 'basta', institutoUrl: BASTA.institutoUrl,
      progresso: {
        percentual: p.percentual, concluidas: p.videosAssistidos, total: p.totalVideos, proximo: p.proximo,
        estado: p.percentual === 100 ? 'concluida' : p.videosAssistidos ? 'em_andamento' : 'nao_iniciada',
      },
    };
  }

  return {
    async getColecoes() { await delay(150); return COLECOES.map(card); },
    async getColecao(slug) {
      const c = COLECOES.find((x) => x.slug === slug);
      if (!c) throw new ApiError('Coleção não encontrada.', 404, 'NOT_FOUND');
      return card(c);
    },
    async getVideosProjeto(slug) { assertBasta(slug); await delay(150); return VIDEOS_PROJETO.map((v) => paraVideo(v, false)); },
    async getModulos(slug) { assertBasta(slug); await delay(150); return modulosDemo(); },
    async getModulo(slug, moduloSlug) {
      assertBasta(slug);
      await delay(150);
      const m = modulosDemo().find((x) => x.slug === moduloSlug);
      if (!m) throw new ApiError('Módulo não encontrado.', 404, 'NOT_FOUND');
      return m;
    },

    async getProgresso(slug) { assertBasta(slug); await delay(100); return progresso(); },

    async setAssistido(slug, videoId, assistido) {
      assertBasta(slug);
      await delay(120);
      const p = progressFor();
      p.assistidos = assistido ? [...new Set([...p.assistidos, videoId])] : p.assistidos.filter((id) => id !== videoId);
      persist();
      return p.assistidos;
    },

    async setCurtido(slug, videoId, curtido) {
      assertBasta(slug);
      const p = progressFor();
      p.curtidos = curtido ? [...new Set([...p.curtidos, videoId])] : p.curtidos.filter((id) => id !== videoId);
      persist();
      return p.curtidos;
    },

    async enviarFeedback(slug, { experiencia, utilidade, navegacao, comentario }) {
      assertBasta(slug);
      await delay(400);
      progressFor();
      saveFeedback({ colecao: slug, experiencia, utilidade, navegacao, comentario, criadoEm: new Date().toISOString() });
      persist();
      return { ok: true };
    },

    /** Demonstração: a tela de feedback abre vazia (as avaliações ficam só neste navegador). */
    async obterFeedback() {
      return null;
    },

    async verificarCertificado() {
      throw new ApiError('A verificação de certificados só funciona na plataforma real.', 404, 'NOT_FOUND');
    },

    /** Demonstração: nunca emite certificado válido (não há verificação no servidor). */
    async emitirCertificado(slug) {
      assertBasta(slug);
      const p = progresso();
      if (p.percentual < 100) throw new ApiError(`Conclua as aulas obrigatórias para liberar o certificado (faltam ${p.totalVideos - p.videosAssistidos}).`, 409, 'COMPLETION_RULE_NOT_MET');
      return { demonstracao: true, codigo: null, emitidoEm: new Date().toISOString(), colecao: 'Formação para Professores – Projeto BASTA!', totalAulas: p.totalVideos };
    },

    async solicitarLiberacao() {
      throw new ApiError('Na demonstração não há pedido de liberação.', 400);
    },
  };
}
