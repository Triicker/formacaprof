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
    { to: base, label: 'Início BASTA!', end: true },
    { to: `${base}/conheca`, label: 'Conheça o projeto', cor: 'pink' },
    { to: `${base}/materiais`, label: 'Materiais pedagógicos', cor: 'purple' },
    { to: `${base}/minha-formacao`, label: 'Minha formação', cor: 'cyan' },
    { to: `${base}/feedback`, label: 'Feedback', cor: 'green' },
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
              {n.label}
            </NavLink>
          ))}
          <button type="button" className="basta__nav-link basta__nav-link--default" onClick={abrirInstituto}>
            Conheça o Instituto BASTA! ↗
          </button>
        </nav>
        {progresso && (
          <Link to={`${base}/minha-formacao`} className="basta__sidebar-progress">
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
