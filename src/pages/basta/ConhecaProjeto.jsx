import { useEffect, useState } from 'react';
import BastaHeader from '../../components/BastaHeader';
import SectionTitle from '../../components/SectionTitle';
import VideoCard from '../../components/VideoCard';
import { useBasta } from '../../layouts/BastaLayout';
import { api } from '../../services/api';

export default function ConhecaProjeto() {
  const { progresso, slug, base } = useBasta();
  const [videos, setVideos] = useState(null);

  useEffect(() => { api.getVideosProjeto(slug).then(setVideos); }, [slug]);

  return (
    <div className="basta-page">
      <BastaHeader />
      <SectionTitle color="pink">Conheça o projeto</SectionTitle>
      <div className="video-grid">
        {videos?.map((v) => (
          <VideoCard key={v.id} video={v} to={`${base}/conheca/${v.id}`} assistido={progresso?.assistidos.includes(v.id)} />
        ))}
      </div>
    </div>
  );
}
