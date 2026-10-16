import { Link } from 'react-router-dom';
import BastaHeader from '../../components/BastaHeader';
import SectionTitle from '../../components/SectionTitle';
import { useBasta } from '../../layouts/BastaLayout';

export default function FeedbackObrigado() {
  const { base } = useBasta();
  return (
    <div className="basta-page">
      <BastaHeader />
      <SectionTitle color="green">Feedback</SectionTitle>
      <div className="thanks">
        <img className="thanks__icon" src="/img/feedback-ok.png" alt="" />
        <h1 className="thanks__title">Obrigado pelo<br />seu feedback!</h1>
        <p className="thanks__text">Suas contribuições nos ajudam a fortalecer o projeto BASTA! e a ampliar o seu impacto.</p>
        <Link to={base} className="pink-btn">⌂ Voltar para o início</Link>
      </div>
    </div>
  );
}
