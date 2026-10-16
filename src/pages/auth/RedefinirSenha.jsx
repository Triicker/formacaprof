import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTokenDaUrl } from '../../utils/tokenDaUrl';
import AuthLayout from '../../components/AuthLayout';
import { Input } from '../../components/Field';
import { api } from '../../services/api';

export default function RedefinirSenha() {
  const token = useTokenDaUrl();
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState(token ? '' : 'Link de redefinição incompleto.');
  const [feito, setFeito] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const v = {};
    if (senha.length < 8) v.senha = 'Mínimo de 8 caracteres.';
    if (confirmar !== senha) v.confirmar = 'As senhas não conferem.';
    setErros(v);
    if (Object.keys(v).length) return;
    setEnviando(true);
    try {
      await api.redefinirSenha(token, senha);
      setFeito(true);
    } catch (err) {
      setErroGeral(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout bg="login" heroMobile>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h2 className="auth-form__title">Nova senha</h2>
        {feito ? (
          <p className="auth-form__info">Senha alterada. Por segurança, encerramos as sessões abertas. Entre com a nova senha.</p>
        ) : token && (
          <>
            <Input label="Nova senha (mín. 8)" icon="/img/icon-lock.png" type="password" autoComplete="new-password"
              value={senha} onChange={(e) => { setSenha(e.target.value); setErros({}); }} error={erros.senha} />
            <Input label="Confirme a nova senha" icon="/img/icon-lock.png" type="password" autoComplete="new-password"
              value={confirmar} onChange={(e) => { setConfirmar(e.target.value); setErros({}); }} error={erros.confirmar} />
            <button className="btn btn--green" disabled={enviando}>{enviando ? 'SALVANDO…' : 'SALVAR SENHA'}</button>
          </>
        )}
        {erroGeral && <p className="form-error" role="alert">{erroGeral}</p>}
        {erroGeral && <Link to="/recuperar-senha" className="link link--cyan">Solicitar novo link</Link>}
        <Link to="/login" className="link link--orange">Ir para o login</Link>
      </form>
    </AuthLayout>
  );
}
