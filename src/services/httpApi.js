// Esqueleto da API real (backend no Render). Mesma interface do mockApi.
// Os endpoints abaixo são a proposta de contrato — ajuste conforme o backend.
const BASE = import.meta.env.VITE_API_URL || '';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || 'Erro ao comunicar com o servidor.');
  return data;
}

export const httpApi = {
  login: (dados) => req('POST', '/auth/login', dados),
  register: (dados) => req('POST', '/auth/register', dados),
  me: () => req('GET', '/auth/me').catch(() => null),
  logout: () => req('POST', '/auth/logout'),
  marcarBoasVindasVisto: () => req('POST', '/me/boas-vindas'),
  recuperarSenha: (email) => req('POST', '/auth/recuperar-senha', { email }),

  getRegioes: () => req('GET', '/regioes'),
  getEscolas: (regiaoId) => req('GET', `/regioes/${regiaoId}/escolas`),
  getNiveisAcesso: () => req('GET', '/niveis-acesso'),

  getColecoes: () => req('GET', '/colecoes'),
  getBasta: () => req('GET', '/colecoes/basta'),
  getVideoBoasVindas: () => req('GET', '/videos/boas-vindas'),
  getVideosProjeto: () => req('GET', '/colecoes/basta/projeto/videos'),
  getModulos: () => req('GET', '/colecoes/basta/modulos'),
  getModulo: (slug) => req('GET', `/colecoes/basta/modulos/${slug}`),

  getProgresso: () => req('GET', '/me/progresso/basta'),
  setAssistido: (videoId, assistido) => req('PUT', `/me/videos/${videoId}/assistido`, { assistido }),
  setCurtido: (videoId, curtido) => req('PUT', `/me/videos/${videoId}/curtido`, { curtido }),

  enviarFeedback: (dados) => req('POST', '/colecoes/basta/feedback', dados),
  resetDemo: async () => {},
};
