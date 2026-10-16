import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_MODE, api } from '../services/api';

// Pílula "Olá, Prof. Nome" com menu (sair / rever boas-vindas / resetar demo).
export default function UserMenu({ tone = 'gold' }) {
  const { user, logout, vinculos, instituicaoAtiva } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fechar = (e) => ref.current && !ref.current.contains(e.target) && setAberto(false);
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, []);

  if (!user) return null;
  const primeiroNome = user.nome.split(' ').slice(0, 2).join(' ');

  async function resetar() {
    await api.resetDemo();
    toast('Dados de demonstração restaurados.');
    window.location.href = '/login';
  }

  return (
    <div className="user-menu" ref={ref}>
      <button type="button" className={`user-pill user-pill--${tone}`} onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        <img src="/img/avatar.png" alt="" />
        <span>Olá, Prof. {primeiroNome}</span>
      </button>
      {aberto && (
        <div className="user-menu__dropdown">
          {vinculos.length > 1 && (
            <button type="button" onClick={() => navigate('/escolher-instituicao')}>
              Trocar instituição{instituicaoAtiva ? ` (${instituicaoAtiva.nome})` : ''}
            </button>
          )}
          <button type="button" onClick={() => navigate('/boas-vindas')}>Vídeo de boas-vindas</button>
          {API_MODE === 'mock' && <button type="button" onClick={resetar}>Resetar dados de demonstração</button>}
          <button type="button" onClick={async () => { await logout(); navigate('/login'); }}>Sair</button>
        </div>
      )}
    </div>
  );
}
