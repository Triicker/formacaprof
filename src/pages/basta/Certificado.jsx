import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

// Certificado imprimível (o navegador salva como PDF). No backend real, gerar PDF no servidor.
export default function Certificado() {
  const { user } = useAuth();
  const [p, setP] = useState(null);

  useEffect(() => { api.getProgresso().then(setP); }, []);

  if (!p) return null;
  if (p.percentual < 100) return <Navigate to="/basta/minha-formacao" replace />;

  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="cert-page">
      <div className="cert-page__actions">
        <Link to="/basta/minha-formacao">← Voltar</Link>
        <button type="button" onClick={() => window.print()}>Imprimir / salvar PDF</button>
      </div>
      <article className="cert">
        <img className="cert__logo" src="/img/basta-logo.png" alt="BASTA!" />
        <h1>Certificado de Conclusão</h1>
        <p>Certificamos que</p>
        <h2>{user.nome}</h2>
        <p>concluiu a <b>Formação para Professores – Projeto BASTA!</b>, assistindo a {p.totalVideos} aulas em {p.totalModulos} módulos.</p>
        <p className="cert__date">{data}</p>
        <img className="cert__etica" src="/img/logo-etica.png" alt="Ética Editora" />
      </article>
    </div>
  );
}
