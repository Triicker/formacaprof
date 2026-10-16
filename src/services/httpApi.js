// Cliente da API real (NestJS no Render), com a mesma interface do mockApi.
// As chamadas vão para /api/v1 no MESMO domínio do site (proxy do Vite em dev; Pages Function em produção),
// então a sessão é um cookie HttpOnly first-party — nenhum token fica acessível ao JavaScript.
// Neste modo, catálogo, progresso e certificados vêm do PostgreSQL; nada depende de src/mock/seed.js
// (exceto as listas do cadastro de demonstração, que não é usado no modo http).
import { ESCOLAS, NIVEIS_ACESSO, REGIOES } from '../mock/seed';
import { ApiError } from './localContent';

const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');

let aoExpirarSessao = () => {};
let usuarioAtual = null;
let instituicaoAtiva = null;
let cards = new Map(); // slug → card de /me/collections
let modulosCache = new Map(); // slug → módulos da API

function limparCaches() {
  cards = new Map();
  modulosCache = new Map();
}

async function req(method, path, body, { silencioso401 = false } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        // Exigido pela API em toda escrita (proteção CSRF).
        ...(method !== 'GET' ? { 'X-CSRF-Protection': '1' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua internet.', 0, 'NETWORK');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !silencioso401) {
      usuarioAtual = null;
      limparCaches();
      aoExpirarSessao();
    }
    const msg = Array.isArray(data?.message) ? data.message[0] : data?.message;
    throw new ApiError(msg || 'Erro ao comunicar com o servidor.', res.status, data?.code);
  }
  return data;
}

const comContexto = (path) => (instituicaoAtiva ? `${path}${path.includes('?') ? '&' : '?'}institutionId=${instituicaoAtiva}` : path);

// ---------- Mapeamentos API (inglês) → formato das telas ----------
function paraUsuario(p) {
  if (!p) return null;
  usuarioAtual = {
    id: p.id,
    nome: p.name,
    email: p.email,
    viuBoasVindas: !!p.welcomeSeenAt,
    admin: (p.platformRoles || []).includes('platform_admin'),
    vinculos: (p.memberships || []).map((m) => ({
      id: m.id,
      papel: m.role,
      instituicao: { id: m.institution.id, nome: m.institution.name, cidade: m.institution.city, uf: m.institution.state },
    })),
  };
  return usuarioAtual;
}

const ESTADO = { not_started: 'nao_iniciada', in_progress: 'em_andamento', completed: 'concluida' };
const paraProximo = (n) => (n ? { modulo: n.moduleSlug, videoId: n.slug, titulo: n.title } : null);

function paraCard(c) {
  const p = c.progress;
  return {
    id: c.id,
    slug: c.slug,
    titulo: c.title,
    capa: c.coverUrl,
    layout: c.theme?.layout ?? null,
    institutoUrl: c.theme?.institutoUrl ?? null,
    status: c.state,
    motivo: c.reason ?? null,
    mensagem: c.message ?? null,
    matriculaId: c.enrollmentId ?? null,
    progresso: p ? {
      percentual: p.percent, concluidas: p.requiredCompleted, total: p.requiredTotal,
      estado: ESTADO[p.status], proximo: paraProximo(p.next),
    } : null,
    instituicao: c.institution ? { temAcesso: c.institution.hasAccess, podeMatricular: c.institution.canEnroll } : undefined,
  };
}

const paraVideo = (l) => ({
  id: l.slug, lessonId: l.id, titulo: l.title, url: l.mediaUrl, thumb: l.thumbnailUrl, capa: l.thumbnailUrl,
  duracao: l.durationSeconds, provisorio: l.provisional,
});

function paraModulo(m) {
  return {
    id: m.id, slug: m.slug, titulo: m.title, subtitulo: m.subtitle || m.title, livro: m.coverUrl, tipo: m.kind,
    documentos: m.lessons.filter((l) => l.lessonType === 'document').map((l) => ({
      id: l.slug, lessonId: l.id, titulo: l.title, url: `${l.mediaUrl}?download=1`, provisorio: l.provisional,
    })),
    videos: m.lessons.filter((l) => l.lessonType === 'video').map(paraVideo),
  };
}

async function cardDe(slug) {
  if (!cards.has(slug)) await httpApi.getColecoes();
  const c = cards.get(slug);
  if (!c) throw new ApiError('Coleção não encontrada.', 404, 'NOT_FOUND');
  return c;
}

async function matriculaDe(slug) {
  const c = await cardDe(slug);
  if (!c.matriculaId) throw new ApiError(c.mensagem || 'Você não tem acesso a esta coleção.', 403, c.motivo);
  return c.matriculaId;
}

async function modulosDe(slug) {
  if (!modulosCache.has(slug)) modulosCache.set(slug, (await req('GET', `/collections/${encodeURIComponent(slug)}/modules`)).map(paraModulo));
  return modulosCache.get(slug);
}

async function lessonIdDe(slug, videoId) {
  for (const m of await modulosDe(slug)) {
    const v = m.videos.find((x) => x.id === videoId);
    if (v) return v.lessonId;
  }
  throw new ApiError('Aula não encontrada.', 404, 'NOT_FOUND');
}

export const httpApi = {
  modo: 'http',

  /** O AuthContext registra aqui o que fazer quando a API responde 401 (sessão expirada/revogada). */
  onSessaoExpirada(fn) { aoExpirarSessao = fn; },
  /** Instituição do contexto ativo (obrigatória na API quando o usuário tem mais de um vínculo). */
  setInstituicaoAtiva(id) {
    if (id !== instituicaoAtiva) limparCaches();
    instituicaoAtiva = id || null;
  },

  // ---------- Autenticação ----------
  login: async ({ usuario, senha }) => {
    limparCaches();
    return paraUsuario(await req('POST', '/auth/login', { email: usuario, password: senha }, { silencioso401: true }));
  },
  me: async () => {
    try {
      return paraUsuario(await req('GET', '/auth/me', undefined, { silencioso401: true }));
    } catch (e) {
      if (e.status === 401) return null;
      throw e;
    }
  },
  logout: async () => {
    try { await req('POST', '/auth/logout', undefined, { silencioso401: true }); } finally { usuarioAtual = null; limparCaches(); }
  },
  marcarBoasVindasVisto: async () => paraUsuario(await req('PATCH', '/users/me', { welcomeSeen: true })),
  recuperarSenha: (email) => req('POST', '/auth/forgot-password', { email }),
  redefinirSenha: (token, senha) => req('POST', '/auth/reset-password', { token, password: senha }),

  // ---------- Convites ----------
  previewConvite: (token) => req('POST', '/invitations/preview', { token }),
  aceitarConvite: async ({ token, nome, senha }) => {
    limparCaches();
    return paraUsuario(await req('POST', '/invitations/accept', { token, password: senha, ...(nome ? { name: nome } : {}) }, { silencioso401: true }));
  },

  // Cadastro público não existe com a API real: o acesso é criado pelo convite da instituição.
  register: async () => { throw new ApiError('O cadastro é feito por convite da sua instituição.', 400); },
  getRegioes: async () => REGIOES,
  getEscolas: async (regiaoId) => ESCOLAS.filter((e) => e.regiaoId === regiaoId),
  getNiveisAcesso: async () => NIVEIS_ACESSO,

  // ---------- Catálogo ----------
  async getVideoBoasVindas() {
    const v = await req('GET', '/platform/welcome-video');
    return { id: 'boas-vindas', titulo: v.title, url: v.url, capa: v.posterUrl, thumb: v.posterUrl, duracao: v.durationSeconds };
  },

  /** Cards com o estado EFETIVO calculado pelo servidor (coming_soon | locked | available). */
  async getColecoes() {
    const r = await req('GET', comContexto('/me/collections'));
    const lista = r.items.map(paraCard);
    cards = new Map(lista.map((c) => [c.slug, c]));
    return lista;
  },
  async getColecao(slug) {
    cards.delete(slug);
    return cardDe(slug);
  },
  async getVideosProjeto(slug) {
    const apresentacao = (await modulosDe(slug)).find((m) => m.tipo === 'presentation');
    return apresentacao?.videos ?? [];
  },
  async getModulos(slug) {
    return (await modulosDe(slug)).filter((m) => m.tipo === 'curriculum');
  },
  async getModulo(slug, moduloSlug) {
    const m = (await httpApi.getModulos(slug)).find((x) => x.slug === moduloSlug);
    if (!m) throw new ApiError('Módulo não encontrado.', 404, 'NOT_FOUND');
    return m;
  },

  // ---------- Progresso (calculado no servidor) ----------
  async getProgresso(slug) {
    const d = await req('GET', `/me/enrollments/${await matriculaDe(slug)}/progress`);
    const s = d.summary;
    const modulos = d.modules.filter((m) => m.requiredTotal > 0);
    return {
      assistidos: d.lessons.filter((l) => l.status === 'completed').map((l) => l.slug),
      curtidos: d.lessons.filter((l) => l.liked).map((l) => l.slug),
      totalVideos: s.requiredTotal,
      videosAssistidos: s.requiredCompleted,
      totalModulos: modulos.length,
      modulosConcluidos: modulos.filter((m) => m.requiredCompleted === m.requiredTotal).length,
      percentual: s.percent,
      proximo: paraProximo(s.next),
      porModulo: modulos.map((m) => ({ slug: m.slug, titulo: m.title, total: m.requiredTotal, assistidos: m.requiredCompleted })),
    };
  },
  async setAssistido(slug, videoId, assistido, origem = 'manual') {
    const enrollmentId = await matriculaDe(slug);
    await req('PUT', comContexto(`/me/lessons/${await lessonIdDe(slug, videoId)}/progress`), {
      enrollmentId, completed: assistido, ...(assistido ? { source: origem === 'player' ? 'player' : 'manual' } : {}),
    });
    cards.delete(slug);
  },
  async setCurtido(slug, videoId, curtido) {
    const enrollmentId = await matriculaDe(slug);
    await req('PUT', comContexto(`/me/lessons/${await lessonIdDe(slug, videoId)}/progress`), { enrollmentId, liked: curtido });
  },
  async enviarFeedback(slug, { experiencia, utilidade, navegacao, comentario }) {
    return req('POST', `/me/enrollments/${await matriculaDe(slug)}/feedback`, {
      experience: experiencia, usefulness: utilidade, navigation: navegacao, ...(comentario?.trim() ? { comment: comentario.trim() } : {}),
    });
  },

  // ---------- Certificado (regra validada no servidor) ----------
  async emitirCertificado(slug) {
    const c = await req('POST', `/me/enrollments/${await matriculaDe(slug)}/certificate`);
    return {
      id: c.id, codigo: c.verificationCode, emitidoEm: c.issuedAt, valido: c.valid,
      nome: c.holderName, colecao: c.collectionTitle, instituicao: c.institutionName, totalAulas: c.requiredLessons,
    };
  },

  // ---------- Coordenação ----------
  async solicitarLiberacao(slug) {
    const c = await cardDe(slug);
    if (!instituicaoAtiva) throw new ApiError('Selecione a instituição ativa.', 400);
    return req('POST', `/institutions/${instituicaoAtiva}/collections/${c.id}/access-requests`, {});
  },

  resetDemo: async () => {},
};
