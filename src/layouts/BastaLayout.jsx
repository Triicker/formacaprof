import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useOutletContext } from 'react-router-dom';
import ContentState from '../components/ContentState';
import MobileTabBar from '../components/MobileTabBar';
import UserMenu from '../components/UserMenu';
import WhatsAppButton from '../components/WhatsAppButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

/** Layouts de coleção implementados. Coleções com outro tema não são forçadas ao visual BASTA. */
const LAYOUTS_SUPORTADOS = ['basta'];

const ICONES_NAV = {
  home: 'M12 3 2 11h3v9h5v-6h4v6h5v-9h3z',
  book: 'M12 6.5C10.3 5.3 8 4.8 5 5v13c3-.2 5.3.3 7 1.5 1.7-1.2 4-1.7 7-1.5V5c-3-.2-5.3.3-7 1.5zm-1 10.6c-1.5-.7-3.2-1-5-1V7c1.9-.1 3.6.3 5 1.2zm7-1c-1.8 0-3.5.3-5 1V8.2c1.4-.9 3.1-1.3 5-1.2z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5zM8 12h8v1.6H8zm0 3.2h8v1.6H8z',
  cap: 'M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17l7 4 7-4v-3.8L12 17z',
  chat: 'M4 4h16v12H7l-3 3zm2 2v8.2L6.2 14H18V6z',
  bank: 'M12 2 2 7v2h20V7zM4 11v7h3v-7zm6.5 0v7h3v-7zM17 11v7h3v-7zM2 20v2h20v-2z',
};
const IconeNav = ({ nome }) => <svg className="basta__nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={ICONES_NAV[nome]} /></svg>;

const MENSAGEM_ESTADO = {
  coming_soon: { tipo: 'indisponivel', titulo: 'Em breve', mensagem: 'Esta coleção ainda está em preparação.' },
  locked: { tipo: 'bloqueado' },
};

/**
 * Layout de uma coleção (tema BASTA). Antes de exibir qualquer página, consulta o estado EFETIVO
 * da coleção na API: sem acesso, mostra o motivo — inclusive para quem chega por URL direta.
 * `slug` identifica a coleção; `base` é a rota-base usada nos links (ex.: /basta, /colecoes/x).
 */
export default function BastaLayout({ slug = 'basta', base = '/basta' }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { instituicaoAtiva } = useAuth();
  const [colecao, setColecao] = useState(null);
  const [erro, setErro] = useState(null);
  const [progresso, setProgresso] = useState(null);

  const carregar = useCallback(() => {
    setErro(null);
    setColecao(null);
    api.getColecao(slug).then(setColecao).catch((e) => setErro(e));
  }, [slug]);
  useEffect(carregar, [carregar, instituicaoAtiva?.id]);

  const liberada = colecao?.status === 'available';
  const recarregar = useCallback(() => api.getProgresso(slug).then(setProgresso).catch(() => {}), [slug]);
  useEffect(() => { if (liberada) recarregar(); }, [liberada, recarregar]);

  const setAssistido = useCallback(async (videoId, valor, origem = 'manual') => {
    try {
      await api.setAssistido(slug, videoId, valor, origem);
      await recarregar();
      toast(valor ? 'Aula marcada como assistida.' : 'Marcação removida.', valor ? 'success' : 'info');
    } catch (e) {
      toast(e.message);
    }
  }, [slug, recarregar, toast]);

  const setCurtido = useCallback(async (videoId, valor) => {
    try {
      await api.setCurtido(slug, videoId, valor);
      await recarregar();
    } catch (e) {
      toast(e.message);
    }
  }, [slug, recarregar, toast]);

  const abrirInstituto = useCallback(() => {
    if (colecao?.institutoUrl) window.open(colecao.institutoUrl, '_blank', 'noopener');
    else toast('Link do Instituto BASTA! ainda não definido.');
  }, [colecao, toast]);

  if (erro) {
    const inexistente = erro.status === 404;
    return (
      <ContentState pagina tipo={inexistente ? 'inexistente' : 'erro'} mensagem={inexistente ? 'Esta coleção não existe ou foi retirada do catálogo.' : erro.message}
        onTentarNovamente={inexistente ? undefined : carregar} />
    );
  }
  if (!colecao) return <ContentState pagina tipo="carregando" titulo="Carregando a coleção…" />;
  if (!liberada) {
    const m = MENSAGEM_ESTADO[colecao.status] ?? MENSAGEM_ESTADO.locked;
    return <ContentState pagina tipo={m.tipo} titulo={m.titulo} mensagem={m.mensagem ?? colecao.mensagem} />;
  }
  if (!LAYOUTS_SUPORTADOS.includes(colecao.layout)) {
    return <ContentState pagina tipo="indisponivel" titulo="Coleção em preparação" mensagem="O ambiente desta coleção ainda está sendo preparado." />;
  }

  const nav = [
    { to: base, label: 'Início BASTA!', end: true, icone: 'home' },
    { to: `${base}/conheca`, label: 'Conheça o projeto', cor: 'pink', icone: 'book' },
    { to: `${base}/materiais`, label: 'Materiais pedagógicos', cor: 'purple', icone: 'doc' },
    { to: `${base}/minha-formacao`, label: 'Minha formação', cor: 'cyan', icone: 'cap' },
    { to: `${base}/feedback`, label: 'Feedback', cor: 'green', icone: 'chat' },
  ];
  const tabs = [
    { to: base, label: 'Início', icone: 'home', end: true },
    { to: `${base}/conheca`, label: 'Projeto', icone: 'play' },
    { to: `${base}/materiais`, label: 'Materiais', icone: 'book' },
    { to: `${base}/minha-formacao`, label: 'Formação', icone: 'cap' },
  ];

  return (
    <div className="basta">
      <aside className="basta__sidebar">
        <Link to={base} className="basta__sidebar-logo"><img src="/img/basta-logo.png" alt="BASTA!" /></Link>
        <nav className="basta__nav">
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={`basta__nav-link basta__nav-link--${n.cor || 'default'}`}>
              <IconeNav nome={n.icone} /><span>{n.label}</span>
            </NavLink>
          ))}
          <button type="button" className="basta__nav-link basta__nav-link--default" onClick={abrirInstituto}>
            <IconeNav nome="bank" /><span>Conheça o Instituto BASTA!</span><span className="basta__nav-ext" aria-hidden="true">›</span>
          </button>
        </nav>
        {progresso && (
          <Link to={`${base}/minha-formacao`} className="basta__sidebar-progress">
            <span>Sua formação</span>
            <div className="mini-bar"><div style={{ width: `${progresso.percentual}%` }} /></div>
            <small><b>{progresso.percentual}%</b> concluído</small>
          </Link>
        )}
        <Link to="/inicio" className="basta__all">← Todas as coleções</Link>
      </aside>

      <div className="basta__main">
        <div className="basta__topbar">
          <UserMenu tone="pink" />
          <WhatsAppButton />
        </div>
        <Outlet context={{ slug, base, colecao, progresso, recarregar, setAssistido, setCurtido, abrirInstituto }} />
      </div>

      <MobileTabBar tema="pink" itens={tabs} extras={[
        { onClick: () => navigate(`${base}/feedback`), label: 'Avaliar a formação (feedback)' },
        { onClick: abrirInstituto, label: 'Conheça o Instituto BASTA!' },
        { onClick: () => navigate('/inicio'), label: 'Todas as coleções' },
      ]} />
    </div>
  );
}

export const useBasta = () => useOutletContext();
