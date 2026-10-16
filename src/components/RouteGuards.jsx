import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Guards de navegação. Só melhoram a experiência: quem decide o acesso aos dados é sempre o backend.

export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="page-loading" />;
  return user ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading" />;
  return user ? <Navigate to="/inicio" replace /> : children;
}

/** Exige ao menos um dos papéis: 'professor' | 'coordinator' | 'platform_admin'. */
export function RequireRole({ roles, children, fallback = '/sem-vinculo' }) {
  const { papeis } = useAuth();
  return roles.some((r) => papeis.includes(r)) ? children : <Navigate to={fallback} replace />;
}

/** Com vínculos em mais de uma instituição, o contexto ativo precisa ser escolhido antes do conteúdo. */
export function RequireInstitutionContext({ children }) {
  const { precisaEscolherInstituicao } = useAuth();
  const location = useLocation();
  return precisaEscolherInstituicao
    ? <Navigate to="/escolher-instituicao" replace state={{ from: location.pathname }} />
    : children;
}

export const PAPEIS_CONTEUDO = ['professor', 'coordinator', 'platform_admin'];
