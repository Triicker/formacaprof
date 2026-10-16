import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTokenDaUrl } from '../../utils/tokenDaUrl';
import AuthLayout from '../../components/AuthLayout';
import { Input } from '../../components/Field';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const PAPEL = { professor: 'professor(a)', coordinator: 'coordenador(a) pedagógico(a)' };

export default function AceitarConvite() {
  const navigate = useNavigate();
  const { aceitarConvite } = useAuth();
  const token = useTokenDaUrl();
  const [convite, setConvite] = useState(null);
  const [erroConvite, setErroConvite] = useState(token ? '' : 'Link de convite incompleto.');
  const [form, setForm] = useState({ nome: '', senha: '', confirmar: '' });
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (token) api.previewConvite(token).then(setConvite).catch((e) => setErroConvite(e.message));
  }, [token]);

  const set = (campo) => (e) => {
    setForm((f) => ({ ...f, [campo]: e.target.value }));
    setErros((x) => ({ ...x, [campo]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    const contaNova = !convite.accountExists;
    const v = {};
    if (contaNova && form.nome.trim().length < 3) v.nome = 'Informe seu nome completo.';
    if (form.senha.length < 8) v.senha = 'Mínimo de 8 caracteres.';
    if (contaNova && form.confirmar !== form.senha) v.confirmar = 'As senhas não conferem.';
    setErros(v);
    if (Object.keys(v).length) return;

    setEnviando(true);
    setErroGeral('');
    try {
      const u = await aceitarConvite({ token, nome: contaNova ? form.nome.trim() : undefined, senha: form.senha });
      navigate(u.viuBoasVindas ? '/inicio' : '/boas-vindas', { replace: true });
    } catch (err) {
      setErroGeral(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout bg="login" heroMobile>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h2 className="auth-form__title">Aceitar convite</h2>
        {erroConvite && (
          <>
            <p className="form-error" role="alert">{erroConvite}</p>
            <p className="auth-form__info">Peça à coordenação da sua escola um novo convite.</p>
          </>
        )}
        {!erroConvite && !convite && <p className="auth-form__info">Verificando convite…</p>}
        {convite && (
          <>
            <p className="auth-form__info">
              Você foi convidado(a) como <b>{PAPEL[convite.role]}</b> da instituição <b>{convite.institution.name}</b>.
              <br />Acesso: <b>{convite.email}</b>
            </p>
            {convite.accountExists ? (
              <>
                <p className="auth-form__info">Você já tem conta. Confirme sua senha atual para incluir esta instituição.</p>
                <Input label="Senha atual" icon="/img/icon-lock.png" type="password" autoComplete="current-password"
                  value={form.senha} onChange={set('senha')} error={erros.senha} />
              </>
            ) : (
              <>
                <Input label="Nome completo" icon="/img/icon-user.png" autoComplete="name"
                  value={form.nome} onChange={set('nome')} error={erros.nome} />
                <Input label="Crie uma senha (mín. 8)" icon="/img/icon-lock.png" type="password" autoComplete="new-password"
                  value={form.senha} onChange={set('senha')} error={erros.senha} />
                <Input label="Confirme a senha" icon="/img/icon-lock.png" type="password" autoComplete="new-password"
                  value={form.confirmar} onChange={set('confirmar')} error={erros.confirmar} />
              </>
            )}
            {erroGeral && <p className="form-error" role="alert">{erroGeral}</p>}
            <button className="btn btn--green" disabled={enviando}>
              {enviando ? 'ENTRANDO…' : 'ACEITAR E ENTRAR'} <span className="btn__arrow">→</span>
            </button>
          </>
        )}
        <Link to="/login" className="link link--orange">Ir para o login</Link>
      </form>
    </AuthLayout>
  );
}
