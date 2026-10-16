import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/auth/Login';
import Cadastro from './pages/auth/Cadastro';
import CadastroSucesso from './pages/auth/CadastroSucesso';
import RecuperarSenha from './pages/auth/RecuperarSenha';
import BoasVindas from './pages/BoasVindas';
import Inicio from './pages/Inicio';
import BastaLayout from './layouts/BastaLayout';
import BastaHome from './pages/basta/BastaHome';
import ConhecaProjeto from './pages/basta/ConhecaProjeto';
import Materiais from './pages/basta/Materiais';
import MateriaisModulo from './pages/basta/MateriaisModulo';
import VideoPage from './pages/basta/VideoPage';
import MinhaFormacao from './pages/basta/MinhaFormacao';
import Feedback from './pages/basta/Feedback';
import FeedbackObrigado from './pages/basta/FeedbackObrigado';
import Certificado from './pages/basta/Certificado';

function Privada({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading" />;
  return user ? children : <Navigate to="/login" replace />;
}

function Publica({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading" />;
  return user ? <Navigate to="/inicio" replace /> : children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/inicio" replace />} />
      <Route path="/login" element={<Publica><Login /></Publica>} />
      <Route path="/cadastro" element={<Publica><Cadastro /></Publica>} />
      <Route path="/cadastro/sucesso" element={<CadastroSucesso />} />
      <Route path="/recuperar-senha" element={<Publica><RecuperarSenha /></Publica>} />

      <Route path="/boas-vindas" element={<Privada><BoasVindas /></Privada>} />
      <Route path="/inicio" element={<Privada><Inicio /></Privada>} />

      <Route path="/basta" element={<Privada><BastaLayout /></Privada>}>
        <Route index element={<BastaHome />} />
        <Route path="conheca" element={<ConhecaProjeto />} />
        <Route path="conheca/:videoId" element={<VideoPage origem="projeto" />} />
        <Route path="materiais" element={<Materiais />} />
        <Route path="materiais/:modulo" element={<MateriaisModulo />} />
        <Route path="materiais/:modulo/:videoId" element={<VideoPage origem="materiais" />} />
        <Route path="minha-formacao" element={<MinhaFormacao />} />
        <Route path="feedback" element={<Feedback />} />
        <Route path="feedback/obrigado" element={<FeedbackObrigado />} />
      </Route>
      <Route path="/basta/certificado" element={<Privada><Certificado /></Privada>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
