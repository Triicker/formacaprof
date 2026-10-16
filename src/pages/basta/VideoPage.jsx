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
  const { modulo: moduloSlug, videoId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { slug, base, progresso, setAssistido, setCurtido } = useBasta();
  const [lista, setLista] = useState(null);
  const [modulo, setModulo] = useState(null);
  const [modulos, setModulos] = useState([]);

  const voltar = origem === 'projeto' ? `${base}/conheca` : `${base}/materiais/${moduloSlug}`;

  useEffect(() => {
    const falhou = (e) => { toast(e.message); navigate(origem === 'projeto' ? base : `${base}/materiais`, { replace: true }); };
    if (origem === 'projeto') {
      api.getVideosProjeto(slug).then(setLista).catch(falhou);
    } else {
      api.getModulos(slug).then(setModulos).catch(() => {});
      api.getModulo(slug, moduloSlug).then((m) => { setModulo(m); setLista(m.videos); }).catch(falhou);
    }
  }, [origem, slug, moduloSlug, base, navigate, toast]);

  const video = lista?.find((v) => v.id === videoId);
  const idx = lista?.findIndex((v) => v.id === videoId) ?? -1;
  const proximo = idx >= 0 ? lista[idx + 1] : null;

  useEffect(() => {
    if (lista && !video) navigate(voltar, { replace: true });
  }, [lista, video, voltar, navigate]);

  if (!video) return <div className="basta-page"><BastaHeader back={voltar} /></div>;

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
      <BastaHeader back={voltar} />
      {origem === 'projeto' ? (
        <SectionTitle color="pink">Conheça o projeto</SectionTitle>
      ) : (
        <NeonSelect
          value={moduloSlug}
          options={modulos.map((m) => ({ value: m.slug, label: m.subtitulo }))}
          onChange={(v) => navigate(`${base}/materiais/${v}`)}
        />
      )}

      <div className="video-layout">
        <div className="video-layout__player">
          {/* Conclusão híbrida: fim da reprodução (player) ou botão (manual), ambos validados no servidor. */}
          <VideoPlayer video={video} onEnded={() => !assistido && setAssistido(video.id, true, 'player')} />
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
          {video.provisorio && (
            <p className="video-meta__notice">Vídeo provisório: o conteúdo definitivo deste capítulo está em produção.</p>
          )}

          <button type="button" className={`watched-btn ${assistido ? 'watched-btn--on' : ''}`} onClick={() => setAssistido(video.id, !assistido, 'manual')}>
            <span className="watched-btn__check">✓</span>
            {assistido ? 'Aula assistida' : 'Marcar como aula assistida'}
          </button>

          {modulo?.documentos.length > 0 && (
            <section className="support">
              <SectionTitle color="pink" as="h3">{modulo.titulo}</SectionTitle>
              {modulo.documentos.map((d) => (
                <a key={d.id} className="support__item" href={d.url} download>
                  <span>{d.titulo}{d.provisorio ? ' (versão provisória)' : ''}</span>
                  <img src="/img/icon-download.png" alt="Baixar" />
                </a>
              ))}
            </section>
          )}

          {proximo && (
            <Link to={`${voltar}/${proximo.id}`} className="next-btn">
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
                <Link to={`${voltar}/${v.id}`} className={`playlist__item ${v.id === video.id ? 'playlist__item--active' : ''}`}>
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
