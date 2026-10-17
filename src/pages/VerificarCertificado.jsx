import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { Input } from '../components/Field';
import { api } from '../services/api';

const dataLonga = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * Página pública (sem login) para qualquer pessoa — uma escola, uma secretaria — conferir um
 * certificado pelo código impresso nele. Mostra só nome, formação, instituição e datas; nunca e-mail.
 */
export default function VerificarCertificado() {
  const { codigo: daUrl } = useParams();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState(daUrl ?? '');
  const [estado, setEstado] = useState(null); // null | 'buscando' | { cert } | { erro }

  useEffect(() => {
    if (!daUrl) { setEstado(null); return; }
    setCodigo(daUrl);
    setEstado('buscando');
    api.verificarCertificado(daUrl)
      .then((cert) => setEstado({ cert }))
      .catch((e) => setEstado({ erro: e.status === 404 ? 'Nenhum certificado encontrado com este código. Confira as letras e os números.' : e.message }));
  }, [daUrl]);

  function onSubmit(e) {
    e.preventDefault();
    const limpo = codigo.trim().toUpperCase();
    if (!/^FP-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(limpo)) {
      setEstado({ erro: 'O código tem o formato FP-XXXX-XXXX e está no rodapé do certificado.' });
      return;
    }
    navigate(`/certificado/verificar/${limpo}`);
  }

  const cert = estado?.cert;
  return (
    <AuthLayout bg="login" heroMobile>
      <div className="auth-form">
        <h2 className="auth-form__title">Verificar certificado</h2>
        {cert ? (
          <div className={`cert-check ${cert.valido ? 'cert-check--ok' : 'cert-check--off'}`} role="status">
            <p className="cert-check__selo">{cert.valido ? '✓ Certificado válido' : '✕ Certificado revogado'}</p>
            <dl>
              <dt>Nome</dt><dd>{cert.nome}</dd>
              <dt>Formação</dt><dd>{cert.colecao}</dd>
              {cert.instituicao && <><dt>Instituição</dt><dd>{cert.instituicao}</dd></>}
              <dt>Emitido em</dt><dd>{dataLonga(cert.emitidoEm)}</dd>
              {cert.revogadoEm && <><dt>Revogado em</dt><dd>{dataLonga(cert.revogadoEm)}</dd></>}
              <dt>Código</dt><dd>{cert.codigo}</dd>
            </dl>
            <Link to="/certificado/verificar" className="link link--orange">Verificar outro código</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="auth-form__info">Digite o código impresso no certificado para confirmar se ele é autêntico.</p>
            <Input label="Código do certificado" value={codigo} placeholder="FP-XXXX-XXXX" autoComplete="off"
              onChange={(e) => { setCodigo(e.target.value.toUpperCase()); setEstado(null); }}
              error={estado?.erro} />
            <button className="btn btn--green" disabled={estado === 'buscando'}>{estado === 'buscando' ? 'VERIFICANDO…' : 'VERIFICAR'}</button>
          </form>
        )}
        <Link to="/login" className="link link--orange">Ir para o login</Link>
      </div>
    </AuthLayout>
  );
}
