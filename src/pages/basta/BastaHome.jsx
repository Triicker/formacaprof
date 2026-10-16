import { Link } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import UserMenu from '../../components/UserMenu';
import WhatsAppButton from '../../components/WhatsAppButton';
import { useBasta } from '../../layouts/BastaLayout';

const TILES = [
  { to: '/basta/conheca', img: '/img/tile-conheca.png', label: 'Conheça o Projeto' },
  { to: '/basta/materiais', img: '/img/tile-materiais.png', label: 'Materiais Pedagógicos' },
  { to: '/basta/minha-formacao', img: '/img/tile-formacao.png', label: 'Minha Formação' },
  { to: '/basta/feedback', img: '/img/tile-feedback.png', label: 'Feedback' },
];

export default function BastaHome() {
  const { abrirInstituto, progresso } = useBasta();

  return (
    <div className="basta-home">
      <div className="basta-home__mobile-top">
        <BackButton to="/inicio" label="Todas as coleções" />
        <div className="basta-home__mobile-actions">
          <UserMenu tone="pink" />
          <WhatsAppButton />
        </div>
      </div>

      <section className="basta-hero">
        <div className="basta-hero__text">
          <img className="basta-hero__logo" src="/img/basta-logo.png" alt="BASTA!" />
          <h1 className="brand-title brand-title--pink">
            <span className="brand-title__top">Formação para</span>
            <span className="brand-title__bottom">PROFESSORES</span>
          </h1>
          {progresso && (
            <p className="basta-hero__progress">
              Você concluiu <b>{progresso.percentual}%</b> da formação — {progresso.videosAssistidos} de {progresso.totalVideos} vídeos.
            </p>
          )}
        </div>
        <img className="basta-hero__img" src="/img/basta-mulher.png" alt="" />
      </section>

      {progresso?.proximo && (
        <Link className="continue-btn" to={`/basta/materiais/${progresso.proximo.modulo}/${progresso.proximo.videoId}`}>
          <span className="continue-btn__icon" aria-hidden="true">▶</span>
          <span><small>Continuar de onde parou</small>{progresso.proximo.titulo}</span>
        </Link>
      )}

      <nav className="basta-tiles" aria-label="Seções do projeto BASTA!">
        {TILES.map((t) => (
          <Link key={t.to} to={t.to} className="basta-tile">
            <img src={t.img} alt={t.label} />
          </Link>
        ))}
        <button type="button" className="basta-tile basta-tile--wide" onClick={abrirInstituto}>
          <img src="/img/tile-instituto.png" alt="Conheça o Instituto BASTA!" />
        </button>
      </nav>
    </div>
  );
}
