import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useToast } from './ToastContext';

const AuthContext = createContext(null);
const INSTITUICAO_KEY = 'formacaprof:instituicao-ativa';

const lerInstituicao = () => { try { return localStorage.getItem(INSTITUICAO_KEY); } catch { return null; } };

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [instituicaoId, setInstituicaoId] = useState(lerInstituicao);

  // Recupera a sessão existente (cookie HttpOnly no modo http).
  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  // Sessão expirada/revogada no servidor: volta ao estado deslogado (as rotas privadas redirecionam ao login).
  useEffect(() => {
    api.onSessaoExpirada?.(() => {
      setUser((atual) => {
        if (atual) toast('Sua sessão expirou. Faça login novamente.');
        return null;
      });
    });
  }, [toast]);

  const login = useCallback(async (credenciais) => {
    const u = await api.login(credenciais);
    setUser(u);
    return u;
  }, []);

  /** Aceite de convite já autentica: a API cria a sessão junto com a conta/vínculo. */
  const aceitarConvite = useCallback(async (dados) => {
    const u = await api.aceitarConvite(dados);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); }
  }, []);

  const marcarBoasVindasVisto = useCallback(async () => {
    setUser(await api.marcarBoasVindasVisto());
  }, []);

  const escolherInstituicao = useCallback((id) => {
    setInstituicaoId(id);
    try { localStorage.setItem(INSTITUICAO_KEY, id); } catch { /* ignora */ }
  }, []);

  // Papéis e instituição ativa servem só para a interface: a autorização real é sempre do backend.
  const perfil = useMemo(() => {
    const vinculos = user?.vinculos ?? [];
    const instituicoes = new Set(vinculos.map((v) => v.instituicao.id));
    // Com um único vínculo ele é o contexto; com vários, só vale a instituição escolhida explicitamente.
    const ativo = vinculos.find((v) => v.instituicao.id === instituicaoId) ?? (instituicoes.size === 1 ? vinculos[0] : null);
    // Informado de forma síncrona: as telas filhas buscam dados no primeiro efeito, já com o contexto certo.
    api.setInstituicaoAtiva?.(ativo?.instituicao.id ?? null);
    return {
      vinculos,
      vinculoAtivo: ativo,
      instituicaoAtiva: ativo?.instituicao ?? null,
      precisaEscolherInstituicao: instituicoes.size > 1 && !ativo,
      isAdmin: !!user?.admin,
      isCoordenador: ativo?.papel === 'coordinator',
      papeis: [...new Set([...(user?.admin ? ['platform_admin'] : []), ...vinculos.map((v) => v.papel)])],
    };
  }, [user, instituicaoId]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, aceitarConvite, marcarBoasVindasVisto, escolherInstituicao, ...perfil }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
