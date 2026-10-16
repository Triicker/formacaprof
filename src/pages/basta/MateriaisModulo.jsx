import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import BastaHeader from '../../components/BastaHeader';
import NeonSelect from '../../components/NeonSelect';
import VideoCard from '../../components/VideoCard';
import { useBasta } from '../../layouts/BastaLayout';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';

export default function MateriaisModulo() {
  const { modulo: slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { progresso } = useBasta();
  const [modulos, setModulos] = useState([]);
  const [modulo, setModulo] = useState(null);

  useEffect(() => { api.getModulos().then(setModulos); }, []);
  useEffect(() => {
    api.getModulo(slug).then(setModulo).catch((e) => { toast(e.message); navigate('/basta/materiais'); });
  }, [slug, navigate, toast]);

  const p = progresso?.porModulo.find((x) => x.slug === slug);

  return (
    <div className="basta-page">
      <BastaHeader back="/basta/materiais" />
      <NeonSelect
        value={slug}
        options={modulos.map((m) => ({ value: m.slug, label: m.subtitulo }))}
        onChange={(v) => navigate(`/basta/materiais/${v}`)}
      />
      {p && (
        <div className="module-progress">
          <div className="mini-bar"><div style={{ width: `${(p.assistidos / p.total) * 100}%` }} /></div>
          <span>{p.assistidos} de {p.total} aulas assistidas</span>
        </div>
      )}
      <div className="video-grid">
        {modulo?.videos.map((v) => (
          <VideoCard key={v.id} video={v} to={`/basta/materiais/${slug}/${v.id}`} assistido={progresso?.assistidos.includes(v.id)} />
        ))}
      </div>
    </div>
  );
}
