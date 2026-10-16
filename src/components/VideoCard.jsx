import { Link } from 'react-router-dom';
import { formatarDuracao } from '../utils/tempo';

export default function VideoCard({ video, to, assistido }) {
  return (
    <Link to={to} className="video-card">
      <div className="video-card__frame">
        <img className="video-card__thumb" src={video.thumb} alt="" loading="lazy" />
        <img className="video-card__play" src="/img/play.png" alt="" />
        {assistido && <span className="video-card__badge" title="Aula assistida">✓</span>}
        {video.duracao && <span className="video-card__time">{formatarDuracao(video.duracao)}</span>}
      </div>
      <span className="video-card__title">{video.titulo}</span>
    </Link>
  );
}
