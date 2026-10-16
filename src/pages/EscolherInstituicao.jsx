import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';

const PAPEL = { professor: 'Professor(a)', coordinator: 'Coordenação pedagógica' };

// Seleção do contexto institucional para quem tem vínculo com mais de uma instituição.
export default function EscolherInstituicao() {
  const { vinculos, escolherInstituicao } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();

  function escolher(id) {
    escolherInstituicao(id);
    navigate(state?.from && state.from !== '/escolher-instituicao' ? state.from : '/inicio', { replace: true });
  }

  return (
    <AuthLayout bg="login" heroMobile>
      <div className="auth-form">
        <h2 className="auth-form__title">Escolha a instituição</h2>
        <p className="auth-form__info">Você tem acesso por mais de uma instituição. Com qual deseja continuar?</p>
        <div className="context-list">
          {vinculos.map((v) => (
            <button key={v.id} type="button" className="context-option" onClick={() => escolher(v.instituicao.id)}>
              <b>{v.instituicao.nome}</b>
              <small>{PAPEL[v.papel] ?? v.papel}{v.instituicao.cidade ? ` · ${v.instituicao.cidade}/${v.instituicao.uf}` : ''}</small>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
