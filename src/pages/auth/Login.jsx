import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Input } from '../../components/Field';
import { useAuth } from '../../context/AuthContext';
import { API_MODE } from '../../services/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!usuario || !senha) return setErro('Preencha usuário e senha.');
    setEnviando(true);
    try {
      const u = await login({ usuario, senha });
      navigate(u.viuBoasVindas ? '/inicio' : '/boas-vindas');
    } catch (err) {
      setErro(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout bg="login" heroMobile>
      <form className="auth-form" onSubmit={onSubmit} noValidate>
        <h2 className="auth-form__title">Acesse sua conta</h2>
        <Input label="Usuário (e-mail)" icon="/img/icon-user.png" type="email" autoComplete="username"
          value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        <Input label="Senha" icon="/img/icon-lock.png" type="password" autoComplete="current-password"
          value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <p className="form-error" role="alert">{erro}</p>}
        <button className="btn btn--green" disabled={enviando}>
          {enviando ? 'ENTRANDO…' : 'ENTRAR'} <span className="btn__arrow">→</span>
        </button>
        <Link to="/recuperar-senha" className="link link--cyan">Esqueceu a senha?</Link>
        <p className="auth-form__alt">Não tem login? <Link to="/cadastro" className="link link--orange">Faça o seu cadastro</Link></p>
        {API_MODE === 'mock' && <p className="demo-hint">Demo: <b>ana@etica.com</b> / <b>123456</b></p>}
      </form>
    </AuthLayout>
  );
}
