import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BastaHeader from '../../components/BastaHeader';
import NeonSelect from '../../components/NeonSelect';
import SectionTitle from '../../components/SectionTitle';
import VideoPlayer from '../../components/VideoPlayer';
import { useBasta } from '../../layouts/BastaLayout';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { formatarDuracao } from '../../utils/tempo';

// Tela de vídeo aberto — usada por "Conheça o projeto" e "Materiais pedagógicos".
export default function VideoPage({ origem }) {
  const { modulo: slug, videoId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { progresso, setAssistido, setCurtido } = useBasta();
  const [lista, setLista] = useState(null);
  const [modulo, setModulo] = useState(null);
  const [modulos, setModulos] = useState([]);

  useEffect(() => {
    if (origem === 'projeto') {
      api.getVideosProjeto().then(setLista);
    } else {
      api.getModulos().then(setModulos);
      api.getModulo(slug).then((m) => { setModulo(m); setLista(m.videos); })
        .catch((e) => { toast(e.message); navigate('/basta/materiais'); });
    }
  }, [origem, slug, navigate, toast]);

  const base = origem === 'projeto' ? '/basta/conheca' : `/basta/materiais/${slug}`;
  const video = lista?.find((v) => v.id === videoId);
  const idx = lista?.findIndex((v) => v.id === videoId) ?? -1;
  const proximo = idx >= 0 ? lista[idx + 1] : null;

  useEffect(() => {
    if (lista && !video) navigate(base, { replace: true });
  }, [lista, video, base, navigate]);

  if (!video) return <div className="basta-page"><BastaHeader back={base} /></div>;

  const assistido = progresso?.assistidos.includes(video.id);
  const curtido = progresso?.curtidos.includes(video.id);

  async function compartilhar() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: video.titulo, url }); } catch { /* cancelado */ }
    } else {
      await navigator.clipboard?.writeText(url);
      toast('Link copiado para a área de transferência.');
    }
  }

  return (
    <div className="basta-page">
      <BastaHeader back={base} />
      {origem === 'projeto' ? (
        <SectionTitle color="pink">Conheça o projeto</SectionTitle>
      ) : (
        <NeonSelect
          value={slug}
          options={modulos.map((m) => ({ value: m.slug, label: m.subtitulo }))}
          onChange={(v) => navigate(`/basta/materiais/${v}`)}
        />
      )}

      <div className="video-layout">
        <div className="video-layout__player">
          <VideoPlayer video={video} onEnded={() => !assistido && setAssistido(video.id, true)} />
        </div>

        <div className="video-layout__info">
          <div className="video-meta">
            <h1 className="video-meta__title">{video.titulo}</h1>
            <div className="video-meta__actions">
              <button type="button" className="icon-btn" onClick={compartilhar} aria-label="Compartilhar">
                <img src="/img/icon-send.png" alt="" />
              </button>
              <button type="button" className={`icon-btn ${curtido ? 'icon-btn--on' : ''}`} onClick={() => setCurtido(video.id, !curtido)}
                aria-label={curtido ? 'Remover curtida' : 'Curtir'} aria-pressed={!!curtido}>
                <img src="/img/icon-like.png" alt="" />
              </button>
            </div>
          </div>
          <p className="video-meta__sub">Aula {idx + 1} de {lista.length}{video.duracao ? ` · ${formatarDuracao(video.duracao)}` : ''}</p>

          <button type="button" className={`watched-btn ${assistido ? 'watched-btn--on' : ''}`} onClick={() => setAssistido(video.id, !assistido)}>
            <span className="watched-btn__check">✓</span>
            {assistido ? 'Aula assistida' : 'Marcar como aula assistida'}
          </button>

          {modulo && (
            <section className="support">
              <SectionTitle color="pink" as="h3">{modulo.titulo}</SectionTitle>
              <a className="support__item" href={modulo.planoDeAula} download>
                <span>Plano de aula – {modulo.titulo}</span>
                <img src="/img/icon-download.png" alt="Baixar" />
              </a>
            </section>
          )}

          {proximo && (
            <Link to={`${base}/${proximo.id}`} className="next-btn">
              <small>Próxima aula</small>
              <span>{proximo.titulo}</span>
              <b aria-hidden="true">→</b>
            </Link>
          )}
        </div>

        <aside className="video-layout__playlist">
          <h3 className="playlist__title">Aulas</h3>
          <ol className="playlist">
            {lista.map((v) => (
              <li key={v.id}>
                <Link to={`${base}/${v.id}`} className={`playlist__item ${v.id === video.id ? 'playlist__item--active' : ''}`}>
                  <span className={`playlist__dot ${progresso?.assistidos.includes(v.id) ? 'playlist__dot--done' : ''}`} />
                  {v.titulo}
                </Link>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
