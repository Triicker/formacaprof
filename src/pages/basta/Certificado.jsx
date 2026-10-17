import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import ContentState from '../../components/ContentState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../services/api';
import { baseDaColecao } from '../../utils/colecoes';

// Certificado imprimível (o navegador salva como PDF). A emissão é decidida pelo servidor:
// só existe quando a regra de conclusão é satisfeita, e traz um código de verificação.
export default function Certificado({ slug = 'basta' }) {
  const { user } = useAuth();
  const toast = useToast();
  const base = baseDaColecao(slug);
  const [cert, setCert] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    api.emitirCertificado(slug).then(setCert).catch((e) => {
      if (e.code === 'COMPLETION_RULE_NOT_MET') toast(e.message);
      setErro(e);
    });
  }, [slug, toast]);

  if (erro?.code === 'COMPLETION_RULE_NOT_MET') return <Navigate to={`${base}/minha-formacao`} replace />;
  if (erro) return <ContentState pagina tipo={erro.status === 403 ? 'bloqueado' : 'erro'} mensagem={erro.message} voltarPara={`${base}/minha-formacao`} voltarTexto="Voltar para Minha formação" />;
  if (!cert) return <ContentState pagina tipo="carregando" titulo="Emitindo certificado…" />;

  const data = new Date(cert.emitidoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="cert-page">
      <div className="cert-page__actions">
        <Link to={`${base}/minha-formacao`}>← Voltar</Link>
        <button type="button" onClick={() => window.print()}>Imprimir / salvar PDF</button>
      </div>
      <article className="cert">
        <img className="cert__logo" src="/img/basta-logo.png" alt="BASTA!" />
        <h1>Certificado de Conclusão</h1>
        <p>Certificamos que</p>
        <h2>{cert.nome ?? user.nome}</h2>
        <p>
          concluiu a <b>{cert.demonstracao ? cert.colecao : `Formação para Professores – ${cert.colecao}`}</b>
          {cert.instituicao ? <>, pela instituição <b>{cert.instituicao}</b>,</> : ''} assistindo às {cert.totalAulas} aulas obrigatórias.
        </p>
        <p className="cert__date">{data}</p>
        {cert.demonstracao ? (
          <p className="cert__code cert__code--demo">Demonstração — sem validade (não emitido pelo servidor)</p>
        ) : (
          <>
            <p className="cert__code">Código de verificação: <b>{cert.codigo}</b></p>
            <p className="cert__verify">Confira a autenticidade em {window.location.host}/certificado/verificar/{cert.codigo}</p>
          </>
        )}
        <img className="cert__etica" src="/img/logo-etica.png" alt="Ética Editora" />
      </article>
    </div>
  );
}
