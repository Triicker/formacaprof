import { Link } from 'react-router-dom';
import BackButton from './BackButton';
import { useBasta } from '../layouts/BastaLayout';

// Cabeçalho das telas internas da coleção (mobile: voltar + logo; desktop: só voltar).
export default function BastaHeader({ back }) {
  const { base } = useBasta();
  return (
    <header className="basta-header">
      <BackButton to={back ?? base} />
      <Link to={base} className="basta-header__logo"><img src="/img/basta-logo.png" alt="BASTA!" /></Link>
      <span className="basta-header__spacer" />
    </header>
  );
}
