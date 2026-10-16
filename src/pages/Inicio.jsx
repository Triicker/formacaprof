import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandTitle from '../components/BrandTitle';
import CollectionCard, { CollectionCardSkeleton } from '../components/CollectionCard';
import ContentState from '../components/ContentState';
import MobileTabBar from '../components/MobileTabBar';
import UserMenu from '../components/UserMenu';
import WhatsAppButton, { WHATSAPP_URL } from '../components/WhatsAppButton';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { baseDaColecao, linkContinuar } from '../utils/colecoes';

export default function Inicio() {
  const [colecoes, setColecoes] = useState(null);
  const [erro, setErro] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  const { instituicaoAtiva, isCoordenador } = useAuth();

  const carregar = useCallback(() => {
    setErro('');
    setColecoes(null);
    api.getColecoes().then(setColecoes).catch((e) => setErro(e.message));
  }, []);

  useEffect(carregar, [carregar, instituicaoAtiva?.id]);

  const primeiraLiberada = colecoes?.find((c) => c.status === 'available');
  const formacao = primeiraLiberada ? `${baseDaColecao(primeiraLiberada.slug)}/minha-formacao` : null;
  const continuar = linkContinuar(colecoes) ?? formacao;
  // Sem coleção liberada, as abas avisam em vez de apontar para a própria tela (evita abas "ativas" duplicadas).
  const semFormacao = () => toast(colecoes
    ? 'Você ainda não tem uma formação liberada. Procure a coordenação da sua escola.'
    : 'Carregando sua formação…');

  async function abrir(c) {
    if (c.status === 'available') return navigate(baseDaColecao(c.slug));
    if (c.status === 'coming_soon') return toast(`A coleção "${c.titulo}" estará disponível em breve.`);
    if (isCoordenador && c.instituicao) {
      if (c.instituicao.temAcesso) {
        return toast(`Sua instituição tem acesso a "${c.titulo}". A matrícula é feita pela coordenação.`);
      }
      // O coordenador não libera coleções: só pede ao administrador.
      if (window.confirm(`Sua instituição ainda não tem acesso a "${c.titulo}". Deseja solicitar a liberação ao administrador?`)) {
        try {
          await api.solicitarLiberacao(c.slug);
          toast('Pedido de liberação enviado ao administrador.', 'success');
        } catch (e) {
          toast(e.message);
        }
      }
      return undefined;
    }
    return toast(c.mensagem || `Você ainda não tem acesso à coleção "${c.titulo}". Procure a coordenação da sua escola.`);
  }

  return (
    <div className="home">
      <header className="home__header">
        <img className="home__logo" src="/img/logo-etica.png" alt="Ética Editora" />
        <div className="home__header-right">
          <UserMenu />
          <WhatsAppButton />
        </div>
      </header>

      <main className="home__main">
        <section className="home__hero">
          <div className="home__hero-text">
            <BrandTitle size="lg" />
            <p className="home__hero-sub">Escolha uma coleção para começar sua formação.</p>
          </div>
          <img className="home__hero-img" src="/img/prof-inicio.png" alt="" />
        </section>

        <section className="home__collections" aria-labelledby="titulo-colecoes" aria-busy={!colecoes && !erro}>
          <h2 className="home__section-title" id="titulo-colecoes">Acessar coleções</h2>
          {erro ? (
            <ContentState tipo="erro" mensagem={erro} onTentarNovamente={carregar} voltarPara="/inicio" voltarTexto="Recarregar página" />
          ) : (
            <div className="collection-grid">
              {colecoes
                ? colecoes.map((c) => <CollectionCard key={c.slug} colecao={c} onOpen={abrir} />)
                : Array.from({ length: 10 }, (_, i) => <CollectionCardSkeleton key={i} />)}
            </div>
          )}
        </section>
      </main>

      <MobileTabBar itens={[
        { to: '/inicio', label: 'Coleções', icone: 'grid', end: true },
        continuar ? { to: continuar, label: 'Continuar', icone: 'resume' } : { onClick: semFormacao, label: 'Continuar', icone: 'resume' },
        formacao ? { to: formacao, label: 'Formação', icone: 'cap' } : { onClick: semFormacao, label: 'Formação', icone: 'cap' },
        { href: WHATSAPP_URL, label: 'Suporte', icone: 'chat' },
      ]} />
    </div>
  );
}
