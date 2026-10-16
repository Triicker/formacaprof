import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { API_MODE, api } from '../services/api';
import { WHATSAPP_URL } from './WhatsAppButton';

const ICONES = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  play: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 6 6 4-6 4z" />,
  book: <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a1.5 1.5 0 0 0 0 3H20v1H6.5A2.5 2.5 0 0 1 4 19.5zM8 6v2h8V6z" />,
  cap: <path d="M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17l7 4 7-4v-3.8L12 17z" />,
  grid: <path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z" />,
  resume: <path d="M12 4a8 8 0 1 0 8 8h2A10 10 0 1 1 12 2zm-2 4.5 6 3.5-6 3.5zM16 2h6v6l-2.2-2.2-3 3-1.6-1.6 3-3z" />,
  chat: <path d="M12 2a10 10 0 0 0-8.7 14.9L2 22l5.2-1.3A10 10 0 1 0 12 2zm-4 9h2v2H8zm3 0h2v2h-2zm3 0h2v2h-2z" />,
  more: <path d="M5 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />,
};

const Icone = ({ nome }) => <svg viewBox="0 0 24 24" aria-hidden="true">{ICONES[nome]}</svg>;

// Barra de navegação inferior (só no mobile). `itens`: { to, label, icone, end } ou { href | onClick, label, icone }.
// O último botão, "Mais", abre uma folha com as ações secundárias (`extras`) e as opções da conta.
export default function MobileTabBar({ itens, extras = [], tema = 'orange' }) {
  const [aberto, setAberto] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const { pathname } = useLocation();

  useEffect(() => setAberto(false), [pathname]);
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aberto]);

  async function resetar() {
    await api.resetDemo();
    toast('Dados de demonstração restaurados.');
    window.location.href = '/login';
  }

  const acoes = [
    ...extras,
    { href: WHATSAPP_URL, label: 'Suporte pelo WhatsApp' },
    { onClick: () => navigate('/boas-vindas'), label: 'Vídeo de boas-vindas' },
    ...(API_MODE === 'mock' ? [{ onClick: resetar, label: 'Resetar dados de demonstração' }] : []),
    { onClick: async () => { await logout(); navigate('/login'); }, label: 'Sair', perigo: true },
  ];

  return (
    <>
      <nav className={`tabbar tabbar--${tema}`} aria-label="Navegação principal">
        {itens.map((it) => {
          const conteudo = <><Icone nome={it.icone} /><span>{it.label}</span></>;
          if (it.to) {
            return <NavLink key={it.label} to={it.to} end={it.end} className="tabbar__item">{conteudo}</NavLink>;
          }
          if (it.href) {
            return <a key={it.label} href={it.href} target="_blank" rel="noreferrer" className="tabbar__item">{conteudo}</a>;
          }
          return <button key={it.label} type="button" onClick={it.onClick} className="tabbar__item">{conteudo}</button>;
        })}
        <button type="button" className={`tabbar__item ${aberto ? 'active' : ''}`} onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto} aria-haspopup="dialog">
          <Icone nome="more" /><span>Mais</span>
        </button>
      </nav>

      {aberto && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Mais opções" onClick={() => setAberto(false)}>
          <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
            <span className="sheet__handle" />
            {user && (
              <div className="sheet__user">
                <img src="/img/avatar.png" alt="" />
                <div><b>Prof. {user.nome}</b><small>{user.email}</small></div>
              </div>
            )}
            {acoes.map((a) => (a.href ? (
              <a key={a.label} className="sheet__item" href={a.href} target="_blank" rel="noreferrer">{a.label}</a>
            ) : (
              <button key={a.label} type="button" className={`sheet__item ${a.perigo ? 'sheet__item--danger' : ''}`}
                onClick={() => { setAberto(false); a.onClick(); }}>{a.label}</button>
            )))}
          </div>
        </div>
      )}
    </>
  );
}
