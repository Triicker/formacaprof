// Implementação mockada da API: persiste tudo no localStorage do navegador.
// Cada função tem a mesma assinatura que a versão HTTP (httpApi.js) terá.
import {
  REGIOES, ESCOLAS, NIVEIS_ACESSO, COLECOES, VIDEOS_PROJETO, VIDEO_BOAS_VINDAS, MODULOS, BASTA,
  USUARIO_DEMO, PROGRESSO_DEMO,
} from '../mock/seed';

const KEY = 'formacaprof:db:v1';
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));

function freshDb() {
  return {
    usuarios: [USUARIO_DEMO],
    sessao: null,
    progresso: { [USUARIO_DEMO.id]: { assistidos: PROGRESSO_DEMO, curtidos: [] } },
    feedbacks: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage indisponível: segue em memória */ }
  return freshDb();
}

let db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignora */ }
}

class ApiError extends Error {}

function publicUser(u) {
  if (!u) return null;
  const { senha, ...rest } = u;
  return rest;
}

function currentUser() {
  const u = db.usuarios.find((x) => x.id === db.sessao);
  if (!u) throw new ApiError('Sessão expirada. Faça login novamente.');
  return u;
}

function userProgress(uid) {
  if (!db.progresso[uid]) db.progresso[uid] = { assistidos: [], curtidos: [] };
  return db.progresso[uid];
}

const allMaterialVideos = () => MODULOS.flatMap((m) => m.videos.map((v) => ({ ...v, modulo: m.slug })));

export const mockApi = {
  // ---------- Autenticação ----------
  async login({ usuario, senha }) {
    await delay();
    const id = usuario.trim().toLowerCase();
    const u = db.usuarios.find((x) => x.email.toLowerCase() === id);
    if (!u || u.senha !== senha) throw new ApiError('Usuário ou senha inválidos.');
    db.sessao = u.id;
    save();
    return publicUser(u);
  },

  async register(dados) {
    await delay(400);
    const email = dados.email.trim().toLowerCase();
    if (db.usuarios.some((x) => x.email.toLowerCase() === email)) {
      throw new ApiError('Já existe um cadastro com este e-mail.');
    }
    const u = {
      id: `u-${Date.now()}`,
      nome: dados.nome.trim(),
      email,
      senha: dados.senha,
      regiaoId: dados.regiaoId,
      escolaId: dados.escolaId,
      nivelAcesso: dados.nivelAcesso,
      codigoAcesso: dados.codigoAcesso.trim(),
      viuBoasVindas: false,
    };
    db.usuarios.push(u);
    save();
    return publicUser(u);
  },

  async me() {
    await delay(50);
    const u = db.usuarios.find((x) => x.id === db.sessao);
    return publicUser(u);
  },

  async logout() {
    db.sessao = null;
    save();
  },

  async marcarBoasVindasVisto() {
    const u = currentUser();
    u.viuBoasVindas = true;
    save();
    return publicUser(u);
  },

  async recuperarSenha(email) {
    await delay(400);
    // Mock: sempre responde sucesso para não revelar quais e-mails existem.
    return { ok: true, email };
  },

  // ---------- Cadastros auxiliares ----------
  async getRegioes() { return REGIOES; },
  async getEscolas(regiaoId) { return ESCOLAS.filter((e) => e.regiaoId === regiaoId); },
  async getNiveisAcesso() { return NIVEIS_ACESSO; },

  // ---------- Conteúdo ----------
  async getColecoes() { await delay(150); return COLECOES; },
  async getBasta() { return BASTA; },
  async getVideoBoasVindas() { return VIDEO_BOAS_VINDAS; },
  async getVideosProjeto() { await delay(150); return VIDEOS_PROJETO; },
  async getModulos() { await delay(150); return MODULOS; },
  async getModulo(slug) {
    await delay(150);
    const m = MODULOS.find((x) => x.slug === slug);
    if (!m) throw new ApiError('Módulo não encontrado.');
    return m;
  },

  // ---------- Progresso ----------
  async getProgresso() {
    await delay(100);
    const p = userProgress(currentUser().id);
    const videos = allMaterialVideos();
    const total = videos.length;
    const assistidosMateriais = videos.filter((v) => p.assistidos.includes(v.id)).length;
    const modulosConcluidos = MODULOS.filter((m) => m.videos.every((v) => p.assistidos.includes(v.id))).length;
    const proximo = videos.find((v) => !p.assistidos.includes(v.id));
    return {
      assistidos: p.assistidos,
      curtidos: p.curtidos,
      totalVideos: total,
      videosAssistidos: assistidosMateriais,
      totalModulos: MODULOS.length,
      modulosConcluidos,
      percentual: Math.round((assistidosMateriais / total) * 100),
      // Próxima aula não assistida ("Continuar de onde parou").
      proximo: proximo ? { modulo: proximo.modulo, videoId: proximo.id, titulo: proximo.titulo } : null,
      porModulo: MODULOS.map((m) => ({
        slug: m.slug,
        titulo: m.titulo,
        total: m.videos.length,
        assistidos: m.videos.filter((v) => p.assistidos.includes(v.id)).length,
      })),
    };
  },

  async setAssistido(videoId, assistido) {
    await delay(120);
    const p = userProgress(currentUser().id);
    p.assistidos = assistido
      ? [...new Set([...p.assistidos, videoId])]
      : p.assistidos.filter((id) => id !== videoId);
    save();
    return p.assistidos;
  },

  async setCurtido(videoId, curtido) {
    const p = userProgress(currentUser().id);
    p.curtidos = curtido
      ? [...new Set([...p.curtidos, videoId])]
      : p.curtidos.filter((id) => id !== videoId);
    save();
    return p.curtidos;
  },

  // ---------- Feedback ----------
  async enviarFeedback({ experiencia, utilidade, navegacao, comentario }) {
    await delay(400);
    const u = currentUser();
    db.feedbacks.push({
      id: `f-${Date.now()}`, usuarioId: u.id, colecao: 'basta',
      experiencia, utilidade, navegacao, comentario, criadoEm: new Date().toISOString(),
    });
    save();
    return { ok: true };
  },

  // ---------- Utilitário de testes ----------
  async resetDemo() {
    db = freshDb();
    save();
  },
};

export { ApiError };
