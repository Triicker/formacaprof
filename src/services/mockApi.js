// Implementação mockada da API: persiste tudo no localStorage do navegador.
// Só para demonstração/desenvolvimento (VITE_API_MODE=mock): senhas ficam em texto puro aqui
// e esse modelo NUNCA é usado com a API real.
import { ESCOLAS, NIVEIS_ACESSO, PROGRESSO_DEMO, REGIOES, USUARIO_DEMO, VIDEO_BOAS_VINDAS } from '../mock/seed';
import { ApiError, createContentApi } from './localContent';

const KEY = 'formacaprof:db:v1';
const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const SEM_CONVITE = 'Convites e redefinição de senha só funcionam com a API real (VITE_API_MODE=http).';

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

// Mesmo formato de usuário entregue pelo httpApi.
function publicUser(u) {
  if (!u) return null;
  const escola = ESCOLAS.find((e) => e.id === u.escolaId);
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    viuBoasVindas: !!u.viuBoasVindas,
    admin: false,
    vinculos: escola ? [{
      id: `m-${u.id}`,
      papel: u.nivelAcesso === 'coordenador' ? 'coordinator' : 'professor',
      instituicao: { id: escola.id, nome: escola.nome },
    }] : [],
  };
}

function currentUser() {
  const u = db.usuarios.find((x) => x.id === db.sessao);
  if (!u) throw new ApiError('Sessão expirada. Faça login novamente.', 401);
  return u;
}

function userProgress(uid) {
  if (!db.progresso[uid]) db.progresso[uid] = { assistidos: [], curtidos: [] };
  return db.progresso[uid];
}

export const mockApi = {
  modo: 'mock',

  // ---------- Autenticação ----------
  async login({ usuario, senha }) {
    await delay();
    const id = usuario.trim().toLowerCase();
    const u = db.usuarios.find((x) => x.email.toLowerCase() === id);
    if (!u || u.senha !== senha) throw new ApiError('Usuário ou senha inválidos.', 401);
    db.sessao = u.id;
    save();
    return publicUser(u);
  },

  async register(dados) {
    await delay(400);
    const email = dados.email.trim().toLowerCase();
    if (db.usuarios.some((x) => x.email.toLowerCase() === email)) {
      throw new ApiError('Já existe um cadastro com este e-mail.', 409);
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
    return publicUser(db.usuarios.find((x) => x.id === db.sessao));
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

  async redefinirSenha() { throw new ApiError(SEM_CONVITE, 400); },
  async previewConvite() { throw new ApiError(SEM_CONVITE, 400); },
  async aceitarConvite() { throw new ApiError(SEM_CONVITE, 400); },

  // ---------- Cadastros auxiliares ----------
  async getRegioes() { return REGIOES; },
  async getEscolas(regiaoId) { return ESCOLAS.filter((e) => e.regiaoId === regiaoId); },
  async getNiveisAcesso() { return NIVEIS_ACESSO; },

  setInstituicaoAtiva() {},
  async getVideoBoasVindas() { return VIDEO_BOAS_VINDAS; },

  // ---------- Conteúdo e progresso ----------
  ...createContentApi({
    progressFor: () => userProgress(currentUser().id),
    persist: save,
    saveFeedback: (f) => db.feedbacks.push({ id: `f-${Date.now()}`, usuarioId: db.sessao, ...f }),
    delay,
  }),

  // ---------- Utilitário de testes ----------
  async resetDemo() {
    db = freshDb();
    save();
  },
};

export { ApiError };
