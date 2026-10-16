import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import MobileTabBar from '../components/MobileTabBar';
import UserMenu from '../components/UserMenu';
import WhatsAppButton from '../components/WhatsAppButton';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

const NAV = [
  { to: '/basta', label: 'Início BASTA!', end: true },
  { to: '/basta/conheca', label: 'Conheça o projeto', cor: 'pink' },
  { to: '/basta/materiais', label: 'Materiais pedagógicos', cor: 'purple' },
  { to: '/basta/minha-formacao', label: 'Minha formação', cor: 'cyan' },
  { to: '/basta/feedback', label: 'Feedback', cor: 'green' },
];

const TABS = [
  { to: '/basta', label: 'Início', icone: 'home', end: true },
  { to: '/basta/conheca', label: 'Projeto', icone: 'play' },
  { to: '/basta/materiais', label: 'Materiais', icone: 'book' },
  { to: '/basta/minha-formacao', label: 'Formação', icone: 'cap' },
];

export default function BastaLayout() {
  const toast = useToast();
  const navigate = useNavigate();
  const [progresso, setProgresso] = useState(null);
  const [basta, setBasta] = useState(null);

  const recarregar = useCallback(() => api.getProgresso().then(setProgresso), []);

  useEffect(() => {
    recarregar();
    api.getBasta().then(setBasta);
  }, [recarregar]);

  const setAssistido = useCallback(async (videoId, valor) => {
    await api.setAssistido(videoId, valor);
    await recarregar();
    toast(valor ? 'Aula marcada como assistida.' : 'Marcação removida.', valor ? 'success' : 'info');
  }, [recarregar, toast]);

  const setCurtido = useCallback(async (videoId, valor) => {
    await api.setCurtido(videoId, valor);
    await recarregar();
  }, [recarregar]);

  const abrirInstituto = useCallback(() => {
    if (basta?.institutoUrl) window.open(basta.institutoUrl, '_blank', 'noopener');
    else toast('Link do Instituto BASTA! ainda não definido.');
  }, [basta, toast]);

  return (
    <div className="basta">
      <aside className="basta__sidebar">
        <Link to="/basta" className="basta__sidebar-logo"><img src="/img/basta-logo.png" alt="BASTA!" /></Link>
        <nav className="basta__nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={`basta__nav-link basta__nav-link--${n.cor || 'default'}`}>
              {n.label}
            </NavLink>
          ))}
          <button type="button" className="basta__nav-link basta__nav-link--default" onClick={abrirInstituto}>
            Conheça o Instituto BASTA! ↗
          </button>
        </nav>
        {progresso && (
          <Link to="/basta/minha-formacao" className="basta__sidebar-progress">
            <span>Sua formação</span>
            <div className="mini-bar"><div style={{ width: `${progresso.percentual}%` }} /></div>
            <small>{progresso.percentual}% concluído</small>
          </Link>
        )}
        <Link to="/inicio" className="basta__all">← Todas as coleções</Link>
      </aside>

      <div className="basta__main">
        <div className="basta__topbar">
          <UserMenu tone="pink" />
          <WhatsAppButton />
        </div>
        <Outlet context={{ progresso, recarregar, setAssistido, setCurtido, abrirInstituto }} />
      </div>

      <MobileTabBar tema="pink" itens={TABS} extras={[
        { onClick: () => navigate('/basta/feedback'), label: 'Avaliar a formação (feedback)' },
        { onClick: abrirInstituto, label: 'Conheça o Instituto BASTA!' },
        { onClick: () => navigate('/inicio'), label: 'Todas as coleções' },
      ]} />
    </div>
  );
}

export const useBasta = () => useOutletContext();
