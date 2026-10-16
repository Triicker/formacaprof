import BrandTitle from './BrandTitle';

// Layout da área geral (login, cadastro, recuperar senha, boas-vindas).
// Mobile: coluna única (logo, título, professora, formulário, selos).
// Desktop: logo no topo, professora à esquerda, título + painel à direita e selos no rodapé.
// `fit`: a tela ocupa exatamente a altura do viewport (ilustração/player encolhem em vez de rolar).
export default function AuthLayout({ bg = 'login', heroMobile = false, fit = true, children }) {
  return (
    <div className={`auth auth--bg-${bg} ${fit ? 'auth--fit' : ''}`}>
      <img className="auth__logo" src="/img/logo-etica.png" alt="Ética Editora" />
      <div className="auth__brand"><BrandTitle size="lg" /></div>
      <div className={`auth__hero ${heroMobile ? 'auth__hero--mobile' : ''}`}>
        <img className="auth__prof" src="/img/prof-login.png" alt="" />
      </div>
      <main className="auth__panel">{children}</main>
      <footer className="auth__footer">
        <img className="auth__footer-label" src="/img/credenciada-texto.png" alt="Empresa credenciada:" />
        <img className="auth__footer-logos" src="/img/credenciadas-logos.png"
          alt="SNEL, Câmara Brasileira do Livro, ABED e Ministério da Educação" />
      </footer>
    </div>
  );
}
