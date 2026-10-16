import { Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { WHATSAPP_URL } from '../components/WhatsAppButton';
import { useAuth } from '../context/AuthContext';

// Conta autenticada, mas sem vínculo ativo com nenhuma instituição (ex.: vínculo desativado pela coordenação).
export default function SemVinculo() {
  const { user, papeis, logout } = useAuth();
  const navigate = useNavigate();
  if (papeis.length) return <Navigate to="/inicio" replace />;

  return (
    <AuthLayout bg="login" heroMobile>
      <div className="auth-form">
        <h2 className="auth-form__title">Sem instituição vinculada</h2>
        <p className="auth-form__info">
          Olá, {user?.nome}. Sua conta não está vinculada a nenhuma instituição ativa no momento.
          Peça à coordenação da sua escola um convite ou a reativação do seu acesso.
        </p>
        <a className="link link--cyan" href={WHATSAPP_URL} target="_blank" rel="noreferrer">Falar com o suporte</a>
        <button type="button" className="btn btn--orange" onClick={async () => { await logout(); navigate('/login'); }}>
          SAIR
        </button>
      </div>
    </AuthLayout>
  );
}
