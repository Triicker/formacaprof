import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { Input, Select } from '../../components/Field';
import { API_MODE, api } from '../../services/api';

const VAZIO = { nome: '', email: '', regiaoId: '', escolaId: '', nivelAcesso: '', senha: '', confirmarSenha: '', codigoAcesso: '' };

function validar(f) {
  const e = {};
  if (f.nome.trim().length < 3) e.nome = 'Informe seu nome completo.';
  if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'E-mail inválido.';
  if (!f.regiaoId) e.regiaoId = 'Selecione a região.';
  if (!f.escolaId) e.escolaId = 'Selecione a escola.';
  if (!f.nivelAcesso) e.nivelAcesso = 'Selecione o nível de acesso.';
  if (f.senha.length < 6) e.senha = 'Mínimo de 6 caracteres.';
  if (f.confirmarSenha !== f.senha) e.confirmarSenha = 'As senhas não conferem.';
  if (!f.codigoAcesso.trim()) e.codigoAcesso = 'Informe o código de acesso.';
  return e;
}

function CadastroDemo() {
  const navigate = useNavigate();
  const [form, setForm] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [regioes, setRegioes] = useState([]);
  const [escolas, setEscolas] = useState([]);
  const [niveis, setNiveis] = useState([]);

  useEffect(() => {
    api.getRegioes().then(setRegioes);
    api.getNiveisAcesso().then(setNiveis);
  }, []);

  useEffect(() => {
    if (form.regiaoId) api.getEscolas(form.regiaoId).then(setEscolas);
    else setEscolas([]);
  }, [form.regiaoId]);

  const set = (campo) => (e) => {
    const valor = e.target.value;
    setForm((f) => ({ ...f, [campo]: valor, ...(campo === 'regiaoId' ? { escolaId: '' } : {}) }));
    setErros((x) => ({ ...x, [campo]: undefined }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    const v = validar(form);
    setErros(v);
    if (Object.keys(v).length) return;
    setEnviando(true);
    setErroGeral('');
    try {
      await api.register(form);
      navigate('/cadastro/sucesso');
    } catch (err) {
      setErroGeral(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout bg="login" fit={false}>
      <form className="auth-form auth-form--wide" onSubmit={onSubmit} noValidate>
        <h2 className="auth-form__title">Crie seu cadastro</h2>
        <div className="form-grid">
          <Input label="Nome" value={form.nome} onChange={set('nome')} error={erros.nome} autoComplete="name" />
          <Input label="Email" type="email" value={form.email} onChange={set('email')} error={erros.email} autoComplete="email" />
          <Select label="Região da escola" options={regioes} value={form.regiaoId} onChange={set('regiaoId')} error={erros.regiaoId} />
          <Select label="Escola" options={escolas} value={form.escolaId}
            onChange={set('escolaId')} error={erros.escolaId} disabled={!form.regiaoId} />
          <Select label="Nível de acesso" options={niveis} value={form.nivelAcesso} onChange={set('nivelAcesso')} error={erros.nivelAcesso} />
          <Input label="Código de acesso" value={form.codigoAcesso} onChange={set('codigoAcesso')} error={erros.codigoAcesso} />
          <Input label="Senha" type="password" value={form.senha} onChange={set('senha')} error={erros.senha} autoComplete="new-password" />
          <Input label="Confirmar senha" type="password" value={form.confirmarSenha} onChange={set('confirmarSenha')} error={erros.confirmarSenha} autoComplete="new-password" />
        </div>
        {erroGeral && <p className="form-error" role="alert">{erroGeral}</p>}
        <button className="btn btn--green" disabled={enviando}>{enviando ? 'CADASTRANDO…' : 'CADASTRAR'}</button>
        <p className="auth-form__alt">Já tem cadastro? <Link to="/login" className="link link--orange">Faça login</Link></p>
      </form>
    </AuthLayout>
  );
}

// Com a API real não há autocadastro: escola e papel vêm do convite enviado pela instituição.
function CadastroPorConvite() {
  return (
    <AuthLayout bg="login" heroMobile>
      <div className="auth-form">
        <h2 className="auth-form__title">Cadastro por convite</h2>
        <p className="auth-form__info">
          O acesso à plataforma é criado pela sua instituição. Peça à coordenação pedagógica da sua escola
          o convite: você receberá um e-mail com o link para criar sua senha.
        </p>
        <p className="auth-form__alt">Já tem acesso? <Link to="/login" className="link link--orange">Faça login</Link></p>
      </div>
    </AuthLayout>
  );
}

export default function Cadastro() {
  return API_MODE === 'http' ? <CadastroPorConvite /> : <CadastroDemo />;
}
