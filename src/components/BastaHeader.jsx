import { Link } from 'react-router-dom';
import BackButton from './BackButton';

// Cabeçalho das telas internas BASTA (mobile: voltar + logo; desktop: só voltar).
export default function BastaHeader({ back = '/basta' }) {
  return (
    <header className="basta-header">
      <BackButton to={back} />
      <Link to="/basta" className="basta-header__logo"><img src="/img/basta-logo.png" alt="BASTA!" /></Link>
      <span className="basta-header__spacer" />
    </header>
  );
}
