import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BastaHeader from '../../components/BastaHeader';
import NeonSelect from '../../components/NeonSelect';
import VideoCard from '../../components/VideoCard';
import { useBasta } from '../../layouts/BastaLayout';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';

export default function MateriaisModulo() {
  const { modulo: moduloSlug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { progresso, slug, base } = useBasta();
  const [modulos, setModulos] = useState([]);
  const [modulo, setModulo] = useState(null);

  useEffect(() => { api.getModulos(slug).then(setModulos); }, [slug]);
  useEffect(() => {
    api.getModulo(slug, moduloSlug).then(setModulo).catch((e) => { toast(e.message); navigate(`${base}/materiais`); });
  }, [slug, moduloSlug, base, navigate, toast]);

  const p = progresso?.porModulo.find((x) => x.slug === moduloSlug);

  return (
    <div className="basta-page">
      <BastaHeader back={`${base}/materiais`} />
      <NeonSelect
        value={moduloSlug}
        options={modulos.map((m) => ({ value: m.slug, label: m.subtitulo }))}
        onChange={(v) => navigate(`${base}/materiais/${v}`)}
      />
      {p && (
        <div className="module-progress">
          <div className="mini-bar"><div style={{ width: `${(p.assistidos / p.total) * 100}%` }} /></div>
          <span>{p.assistidos} de {p.total} aulas assistidas</span>
        </div>
      )}
      <div className="video-grid">
        {modulo?.videos.map((v) => (
          <VideoCard key={v.id} video={v} to={`${base}/materiais/${moduloSlug}/${v.id}`} assistido={progresso?.assistidos.includes(v.id)} />
        ))}
      </div>
    </div>
  );
}
