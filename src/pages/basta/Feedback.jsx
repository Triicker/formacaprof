import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BastaHeader from '../../components/BastaHeader';
import SectionTitle from '../../components/SectionTitle';
import { api } from '../../services/api';

const PERGUNTAS = [
  { campo: 'experiencia', texto: '1. Como você avalia a sua experiência com o aplicativo?' },
  { campo: 'utilidade', texto: '2. Os materiais são realmente úteis para a sua prática docente?' },
  { campo: 'navegacao', texto: '3. A navegação foi intuitiva e fácil de usar?' },
];

function Estrelas({ valor, onChange, nome }) {
  return (
    <div className="stars" role="radiogroup" aria-label={nome}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={valor === n} aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          className="stars__btn" onClick={() => onChange(n)}>
          <img src={n <= valor ? '/img/star-filled.png' : '/img/star.png'} alt="" />
        </button>
      ))}
    </div>
  );
}

export default function Feedback() {
  const navigate = useNavigate();
  const [notas, setNotas] = useState({ experiencia: 0, utilidade: 0, navegacao: 0 });
  const [comentario, setComentario] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (Object.values(notas).some((n) => !n)) return setErro('Responda às três perguntas para enviar.');
    setEnviando(true);
    await api.enviarFeedback({ ...notas, comentario });
    navigate('/basta/feedback/obrigado');
  }

  return (
    <div className="basta-page">
      <BastaHeader />
      <SectionTitle color="green">Feedback</SectionTitle>
      <form className="feedback" onSubmit={onSubmit}>
        <p className="feedback__lead">Sua opinião é muito importante!</p>
        {PERGUNTAS.map((q) => (
          <fieldset key={q.campo} className="feedback__q">
            <legend>{q.texto}</legend>
            <Estrelas nome={q.texto} valor={notas[q.campo]}
              onChange={(n) => { setNotas((x) => ({ ...x, [q.campo]: n })); setErro(''); }} />
          </fieldset>
        ))}
        <label className="feedback__q">
          <span className="feedback__label">Comentários (opcional)</span>
          <textarea className="feedback__text" rows={4} maxLength={1000} value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </label>
        {erro && <p className="form-error" role="alert">{erro}</p>}
        <button className="pink-btn" disabled={enviando}>➤ {enviando ? 'Enviando…' : 'Enviar avaliação'}</button>
      </form>
    </div>
  );
}
