import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandTitle from '../components/BrandTitle';
import MobileTabBar from '../components/MobileTabBar';
import UserMenu from '../components/UserMenu';
import WhatsAppButton, { WHATSAPP_URL } from '../components/WhatsAppButton';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';

export default function Inicio() {
  const [colecoes, setColecoes] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  const [progresso, setProgresso] = useState(null);

  useEffect(() => {
    api.getColecoes().then(setColecoes);
    api.getProgresso().then(setProgresso).catch(() => {});
  }, []);

  const proximo = progresso?.proximo;
  const continuar = proximo ? `/basta/materiais/${proximo.modulo}/${proximo.videoId}` : '/basta/minha-formacao';

  function abrir(c) {
    if (c.disponivel) navigate(`/${c.slug}`);
    else toast(`A coleção "${c.titulo}" estará disponível em breve.`);
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

      <section className="home__hero">
        <div className="home__hero-text">
          <BrandTitle size="lg" />
          <p className="home__hero-sub">Escolha uma coleção para começar sua formação.</p>
        </div>
        <img className="home__hero-img" src="/img/prof-inicio.png" alt="" />
      </section>

      <section className="home__collections">
        <h2 className="home__section-title">Acessar coleções</h2>
        <div className="collection-grid">
          {(colecoes || Array.from({ length: 10 })).map((c, i) =>
            c ? (
              <button key={c.slug} type="button" className={`collection-card ${c.disponivel ? '' : 'collection-card--soon'}`} onClick={() => abrir(c)}>
                <img src={c.capa} alt={c.titulo} />
                {!c.disponivel && <span className="collection-card__tag">Em breve</span>}
              </button>
            ) : <div key={i} className="collection-card collection-card--skeleton" />,
          )}
        </div>
      </section>

      <MobileTabBar itens={[
        { to: '/inicio', label: 'Coleções', icone: 'grid' },
        { to: continuar, label: 'Continuar', icone: 'resume' },
        { to: '/basta/minha-formacao', label: 'Formação', icone: 'cap' },
        { href: WHATSAPP_URL, label: 'Suporte', icone: 'chat' },
      ]} />
    </div>
  );
}
