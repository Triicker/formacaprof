import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const PATHS = {
  dashboard: 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z',
  school: 'M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17l7 4 7-4v-3.8L12 17z',
  users: 'M16 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 1.9 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
  badge: 'M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5zm0 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm5.5 10.2A7.6 7.6 0 0 1 12 20.9a7.6 7.6 0 0 1-5.5-3.7c0-1.8 3.7-2.8 5.5-2.8s5.5 1 5.5 2.8z',
  book: 'M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5a1.5 1.5 0 0 0 0 3H20v1H6.5A2.5 2.5 0 0 1 4 19.5z',
  media: 'M21 3H3v18h18zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5z',
  key: 'M12.6 10A6 6 0 1 0 7 17a6 6 0 0 0 5.6-4H17v4h4v-4h2v-3zM7 13a2 2 0 1 1 2-2 2 2 0 0 1-2 2z',
  chart: 'M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z',
  log: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm2 16H8v-2h8zm0-4H8v-2h8zm-3-5V3.5L18.5 9z',
  menu: 'M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z',
};
export const Icon = ({ name }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name]} /></svg>;

/**
 * Moldura comum dos painéis: barra lateral (gaveta no celular), topo com usuário e contexto,
 * conteúdo via <Outlet>. `context` é renderizado no topo (ex.: seletor de instituição).
 */
export default function AdminShell({ title, subtitle, nav, context, outletContext }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [aberto, setAberto] = useState(false);
  useEffect(() => setAberto(false), [pathname]);

  return (
    <div className="adm">
      {aberto && <div className="adm-scrim" onClick={() => setAberto(false)} aria-hidden="true" />}
      <aside className={`adm-side ${aberto ? 'adm-side--open' : ''}`} aria-label="Menu do painel">
        <Link to={nav[0].to} className="adm-side__brand">
          <img src="/img/logo-etica.png" alt="Ética Editora" />
          <span><b>{title}</b><small>{subtitle}</small></span>
        </Link>
        <nav className="adm-nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}><Icon name={n.icon} />{n.label}</NavLink>
          ))}
        </nav>
        <div className="adm-side__foot">
          <Link to="/inicio">← Área de formação</Link>
          <button type="button" onClick={async () => { await logout(); navigate('/login'); }}>Sair</button>
        </div>
      </aside>

      <div className="adm-main">
        <header className="adm-top">
          <button type="button" className="adm-btn adm-btn--sm adm-top__menu" onClick={() => setAberto(true)} aria-label="Abrir menu" aria-expanded={aberto}>
            <Icon name="menu" />
          </button>
          <div className="adm-top__context">{context}</div>
          <div className="adm-top__user"><span>Olá,</span> <b>{user?.nome}</b></div>
        </header>
        <main className="adm-content" id="conteudo">
          <Outlet context={outletContext} />
        </main>
      </div>
    </div>
  );
}
