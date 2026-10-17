import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Input } from '../../components/Field';
import { useAuth } from '../../context/AuthContext';
import { API_MODE, api } from '../../services/api';

const rotuloConta = (c) => `${c.name} · ${c.role === 'coordinator' ? 'coordenação' : 'professor(a)'}${c.institution ? ` · ${c.institution.replace(' (testes)', '')}` : ''}`;

export default function Login() {
  const { login, entrarComoTeste } = useAuth();
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Período de testes: a API só devolve contas enquanto houver contas de QA ativas.
  const [contasTeste, setContasTeste] = useState([]);
  const [contaTeste, setContaTeste] = useState('');
  useEffect(() => { api.contasDeTeste?.().then(setContasTeste).catch(() => {}); }, []);

  async function entrarTeste(e) {
    e.preventDefault();
    if (!contaTeste) return setErro('Escolha uma conta de teste.');
    setErro('');
    setEnviando(true);
    try {
      const u = await entrarComoTeste(contaTeste);
      navigate(u.viuBoasVindas ? '/inicio' : '/boas-vindas');
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  }

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
        {contasTeste.length > 0 && (
          <div className="qa-login">
            <label className="qa-login__label" htmlFor="conta-teste">Ambiente de testes: entre sem digitar</label>
            <select id="conta-teste" className="qa-login__select" value={contaTeste} onChange={(e) => { setContaTeste(e.target.value); setErro(''); }}>
              <option value="">Escolha uma conta de teste…</option>
              {contasTeste.map((c) => <option key={c.email} value={c.email}>{rotuloConta(c)}</option>)}
            </select>
            <button type="button" className="btn btn--orange" onClick={entrarTeste} disabled={enviando || !contaTeste}>
              ENTRAR COMO TESTE <span className="btn__arrow">→</span>
            </button>
            <p className="qa-login__ou">ou entre com e-mail e senha</p>
          </div>
        )}
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
