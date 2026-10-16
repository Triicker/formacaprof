import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import VideoPlayer from '../components/VideoPlayer';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

export default function BoasVindas() {
  const { marcarBoasVindasVisto } = useAuth();
  const navigate = useNavigate();
  const [video, setVideo] = useState(null);

  useEffect(() => { api.getVideoBoasVindas().then(setVideo); }, []);

  async function comecar() {
    await marcarBoasVindasVisto();
    navigate('/inicio');
  }

  return (
    <AuthLayout bg="boasvindas">
      <div className="welcome">
        <p className="welcome__title">SEJAM BEM-VINDOS(AS),<br />PROFESSORES</p>
        {video ? <VideoPlayer video={video} /> : <div className="player player--skeleton" />}
        <button type="button" className="btn btn--orange" onClick={comecar}>
          VAMOS COMEÇAR <span className="btn__arrow">→</span>
        </button>
      </div>
    </AuthLayout>
  );
}
