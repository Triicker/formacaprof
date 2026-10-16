import { useEffect, useRef, useState } from 'react';

// Player vertical (9:16). Com URL toca o MP4 de verdade; sem URL simula a reprodução.
export default function VideoPlayer({ video, onEnded }) {
  const [tocando, setTocando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    setTocando(false);
    setProgresso(0);
    return () => clearInterval(timer.current);
  }, [video.id]);

  function play() {
    setTocando(true);
    if (video.url) return;
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setProgresso((p) => {
        if (p >= 100) {
          clearInterval(timer.current);
          onEnded?.();
          return 100;
        }
        return p + 2;
      });
    }, 120);
  }

  if (tocando && video.url) {
    return (
      <div className="player">
        <video className="player__video" src={video.url} poster={video.capa} controls autoPlay playsInline onEnded={onEnded} />
      </div>
    );
  }

  return (
    <div className="player">
      <img className="player__cover" src={video.capa} alt="" />
      {!tocando && (
        <button type="button" className="player__play" onClick={play} aria-label="Reproduzir vídeo">
          <img src="/img/play.png" alt="" />
        </button>
      )}
      {tocando && (
        <div className="player__mock">
          <span>Reproduzindo (simulação)</span>
          <div className="player__bar"><div style={{ width: `${progresso}%` }} /></div>
        </div>
      )}
    </div>
  );
}
