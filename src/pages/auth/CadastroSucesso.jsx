import { Link } from 'react-router-dom';

export default function CadastroSucesso() {
  return (
    <div className="auth auth--bg-sucesso auth--center">
      <div className="success-card">
        <img className="success-card__icon" src="/img/icon-correct.png" alt="" />
        <h2 className="success-card__title">SUCESSO!</h2>
        <p className="success-card__text">Parabéns! O seu cadastro foi realizado com sucesso!</p>
        <Link to="/login" className="btn btn--orange btn--sm">VOLTAR PARA O INÍCIO</Link>
      </div>
    </div>
  );
}
