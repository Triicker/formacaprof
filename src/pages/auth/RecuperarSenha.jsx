import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Input } from '../../components/Field';
import { api } from '../../services/api';

// Tela não prevista no userflow: incluída para o link "Esqueceu a senha?" ter destino.
export default function RecuperarSenha() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return setErro('Informe um e-mail válido.');
    await api.recuperarSenha(email);
    setEnviado(true);
  }

  return (
    <AuthLayout bg="login" heroMobile>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h2 className="auth-form__title">Recuperar senha</h2>
        {enviado ? (
          <p className="auth-form__info">
            Se houver um cadastro com <b>{email}</b>, você receberá um e-mail com as instruções para redefinir sua senha.
          </p>
        ) : (
          <>
            <p className="auth-form__info">Informe o e-mail cadastrado para receber o link de redefinição.</p>
            <Input label="Email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErro(''); }} error={erro} />
            <button className="btn btn--green">ENVIAR LINK</button>
          </>
        )}
        <Link to="/login" className="link link--orange">Voltar para o login</Link>
      </form>
    </AuthLayout>
  );
}
