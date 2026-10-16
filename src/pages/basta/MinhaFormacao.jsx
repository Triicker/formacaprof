import { useNavigate } from 'react-router-dom';
import BastaHeader from '../../components/BastaHeader';
import SectionTitle from '../../components/SectionTitle';
import { useBasta } from '../../layouts/BastaLayout';
import { useToast } from '../../context/ToastContext';

export default function MinhaFormacao() {
  const { progresso: p, base } = useBasta();
  const navigate = useNavigate();
  const toast = useToast();

  if (!p) return <div className="basta-page"><BastaHeader /></div>;
  const completo = p.percentual === 100;

  function certificado() {
    if (completo) navigate(`${base}/certificado`);
    else toast(`Conclua os ${p.totalVideos} vídeos para liberar o certificado (faltam ${p.totalVideos - p.videosAssistidos}).`);
  }

  return (
    <div className="basta-page">
      <BastaHeader />
      <SectionTitle color="cyan">Minha formação</SectionTitle>

      <div className="formacao">
        <div className="ring" style={{ '--pct': p.percentual }} role="img" aria-label={`${p.percentual}% concluído`}>
          <div className="ring__inner">
            <strong>{p.percentual}%</strong>
            <span>concluído</span>
          </div>
        </div>

        <div className="formacao__cards">
          <button type="button" className="stat-card stat-card--pink" onClick={() => navigate(`${base}/materiais`)}>
            <span className="stat-card__icon"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg></span>
            <span><b>{p.videosAssistidos} de {p.totalVideos}</b><br />vídeos assistidos</span>
            <span className="stat-card__chev">›</span>
          </button>
          <button type="button" className="stat-card stat-card--cyan" onClick={() => navigate(`${base}/materiais`)}>
            <span className="stat-card__icon"><svg viewBox="0 0 24 24"><path d="M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2V17l7 4 7-4v-3.8L12 17z" /></svg></span>
            <span><b>{p.modulosConcluidos} de {p.totalModulos}</b><br />módulos finalizados</span>
            <span className="stat-card__chev">›</span>
          </button>

          <ul className="module-list">
            {p.porModulo.map((m) => (
              <li key={m.slug}>
                <span>{m.titulo}</span>
                <div className="mini-bar"><div style={{ width: `${(m.assistidos / m.total) * 100}%` }} /></div>
                <small>{m.assistidos}/{m.total}</small>
              </li>
            ))}
          </ul>

          <button type="button" className={`cert-btn ${completo ? '' : 'cert-btn--locked'}`} onClick={certificado}>
            <img src="/img/icon-download.png" alt="" />
            Baixar certificado de conclusão
          </button>
        </div>
      </div>
    </div>
  );
}
