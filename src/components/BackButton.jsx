import { useNavigate } from 'react-router-dom';

export default function BackButton({ to, label = 'Voltar' }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className="back-btn"
      aria-label={label}
      onClick={() => (to ? navigate(to) : navigate(-1))}
    >
      <img src="/img/btn-back.png" alt="" />
    </button>
  );
}
