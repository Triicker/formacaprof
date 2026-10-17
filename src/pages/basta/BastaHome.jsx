import { Link } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import Tour from '../../components/Tour';
import UserMenu from '../../components/UserMenu';
import WhatsAppButton from '../../components/WhatsAppButton';
import { useBasta } from '../../layouts/BastaLayout';

// Ícones dos atalhos (vetoriais: nítidos em qualquer tamanho de tela).
const ICONES = {
  book: 'M12 6.5C10.3 5.3 8 4.8 5 5v13c3-.2 5.3.3 7 1.5 1.7-1.2 4-1.7 7-1.5V5c-3-.2-5.3.3-7 1.5zm-1 10.6c-1.5-.7-3.2-1-5-1V7c1.9-.1 3.6.3 5 1.2zm7-1c-1.8 0-3.5.3-5 1V8.2c1.4-.9 3.1-1.3 5-1.2z',
  doc: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm4 18H6V4h7v5h5zM8 12h8v1.6H8zm0 3.2h8v1.6H8zm0-6.4h4v1.6H8z',
  cap: 'M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17l7 4 7-4v-3.8L12 17z',
  chat: 'M12 3C6.5 3 2 6.6 2 11c0 2.4 1.3 4.6 3.4 6.1L4.6 21l4.3-2.3c1 .2 2 .3 3.1.3 5.5 0 10-3.6 10-8s-4.5-8-10-8zm-4 9.3a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6zm4 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6z',
  bank: 'M12 2 2 7v2h20V7zM4 11v7h3v-7zm6.5 0v7h3v-7zM17 11v7h3v-7zM2 20v2h20v-2z',
};
const Icone = ({ nome }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={ICONES[nome]} /></svg>;
const Seta = () => <span className="bt__arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5.5 15.5 12 9 18.5l-1.4-1.4 5.1-5.1-5.1-5.1z" /></svg></span>;

const TILES = [
  { to: 'conheca', cor: 'pink', icone: 'book', titulo: ['Conheça', 'o Projeto'], desc: 'Entenda os objetivos, impactos e as frentes de atuação do BASTA!' },
  { to: 'materiais', cor: 'purple', icone: 'doc', titulo: ['Materiais', 'Pedagógicos'], desc: 'Acesse conteúdos, planos de aula e recursos para a sua prática.' },
  { to: 'minha-formacao', cor: 'cyan', icone: 'cap', titulo: ['Minha', 'Formação'], desc: 'Continue sua jornada e acompanhe seu progresso.' },
  { to: 'feedback', cor: 'green', icone: 'chat', titulo: ['Feedback'], desc: 'Compartilhe suas impressões e contribua com esta formação.' },
];

const PASSOS = [
  { alvo: '.continue-btn', titulo: 'Continuar de onde parou', texto: 'Abre a próxima aula da sua formação, sem precisar procurar.' },
  { alvo: '.bt--pink', titulo: 'Conheça o projeto', texto: 'Vídeos de apresentação: objetivos, impactos e frentes de atuação do projeto.' },
  { alvo: '.bt--purple', titulo: 'Materiais pedagógicos', texto: 'Os capítulos por nível de ensino, com os vídeos e os planos de aula para baixar.' },
  { alvo: '.bt--cyan', titulo: 'Minha formação', texto: 'Seu progresso, as aulas que faltam e o certificado quando você concluir.' },
  { alvo: '.bt--green', titulo: 'Feedback', texto: 'Conte o que achou da formação. Sua opinião ajuda a melhorar o conteúdo.' },
];

export default function BastaHome() {
  const { abrirInstituto, progresso, base, slug } = useBasta();

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
        <Link className="continue-btn" to={`${base}/materiais/${progresso.proximo.modulo}/${progresso.proximo.videoId}`}>
          <span className="continue-btn__icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
          <span className="continue-btn__text"><small>Continuar de onde parou</small>{progresso.proximo.titulo}</span>
          <span className="continue-btn__chev" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 5.5 15.5 12 9 18.5l-1.4-1.4 5.1-5.1-5.1-5.1z" /></svg></span>
        </Link>
      )}

      <Tour id={`colecao-${slug}`} steps={PASSOS} pronto={!!progresso} />

      <nav className="basta-tiles" aria-label="Seções do projeto BASTA!">
        {TILES.map((t) => (
          <Link key={t.to} to={`${base}/${t.to}`} className={`bt bt--${t.cor}`}>
            <span className="bt__icon"><Icone nome={t.icone} /></span>
            <span className="bt__title">{t.titulo.map((l) => <span key={l}>{l}</span>)}</span>
            <span className="bt__desc">{t.desc}</span>
            <Seta />
          </Link>
        ))}
        <button type="button" className="bt-wide" onClick={abrirInstituto}>
          <span className="bt-wide__icon"><Icone nome="bank" /></span>
          <span className="bt-wide__title"><small>Conheça o</small>Instituto BASTA!</span>
          <span className="bt-wide__desc">Saiba mais sobre o Instituto BASTA!, sua atuação e como você pode fazer parte dessa rede.</span>
          <Seta />
        </button>
      </nav>
    </div>
  );
}
