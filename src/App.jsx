import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { PAPEIS_CONTEUDO, PublicOnly, RequireAuth, RequireInstitutionContext, RequireRole } from './components/RouteGuards';
import Login from './pages/auth/Login';
import Cadastro from './pages/auth/Cadastro';
import CadastroSucesso from './pages/auth/CadastroSucesso';
import RecuperarSenha from './pages/auth/RecuperarSenha';
import RedefinirSenha from './pages/auth/RedefinirSenha';
import AceitarConvite from './pages/auth/AceitarConvite';
import SemVinculo from './pages/SemVinculo';
import EscolherInstituicao from './pages/EscolherInstituicao';
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
import ContentState from './components/ContentState';
import AdminArea from './admin/pages/AdminArea';
import AdminDashboard from './admin/pages/AdminDashboard';
import AdminInstituicoes from './admin/pages/AdminInstituicoes';
import AdminInstituicao from './admin/pages/AdminInstituicao';
import AdminUsuarios from './admin/pages/AdminUsuarios';
import AdminCoordenadores from './admin/pages/AdminCoordenadores';
import AdminColecoes from './admin/pages/AdminColecoes';
import AdminColecao from './admin/pages/AdminColecao';
import AdminPrevia from './admin/pages/AdminPrevia';
import AdminMidias from './admin/pages/AdminMidias';
import AdminRelatorios from './admin/pages/AdminRelatorios';
import AdminAuditoria from './admin/pages/AdminAuditoria';
import AdminMatricula from './admin/pages/AdminMatricula';
import CoordArea from './admin/pages/CoordArea';
import CoordDashboard from './admin/pages/CoordDashboard';
import CoordProfessores from './admin/pages/CoordProfessores';
import CoordColecoes from './admin/pages/CoordColecoes';
import CoordRelatorios from './admin/pages/CoordRelatorios';

// Rotas de conteúdo: sessão válida + vínculo ativo (ou administrador geral) + contexto institucional definido.
// O acesso a cada coleção é conferido pelo layout da coleção (estado efetivo vindo da API).
function Privada({ children }) {
  return (
    <RequireAuth>
      <RequireRole roles={PAPEIS_CONTEUDO}>
        <RequireInstitutionContext>{children}</RequireInstitutionContext>
      </RequireRole>
    </RequireAuth>
  );
}

// Páginas de uma coleção: as mesmas para /basta (compatibilidade) e /colecoes/:slug.
const paginasDaColecao = (
  <>
    <Route index element={<BastaHome />} />
    <Route path="conheca" element={<ConhecaProjeto />} />
    <Route path="conheca/:videoId" element={<VideoPage origem="projeto" />} />
    <Route path="materiais" element={<Materiais />} />
    <Route path="materiais/:modulo" element={<MateriaisModulo />} />
    <Route path="materiais/:modulo/:videoId" element={<VideoPage origem="materiais" />} />
    <Route path="minha-formacao" element={<MinhaFormacao />} />
    <Route path="feedback" element={<Feedback />} />
    <Route path="feedback/obrigado" element={<FeedbackObrigado />} />
  </>
);

/** /colecoes/basta/... redireciona para o endereço canônico /basta/...; outras coleções usam a rota genérica. */
function ColecaoGenerica() {
  const { slug } = useParams();
  const { pathname } = useLocation();
  if (slug === 'basta') return <Navigate to={pathname.replace(/^\/colecoes\/basta/, '/basta')} replace />;
  return <BastaLayout key={slug} slug={slug} base={`/colecoes/${slug}`} />;
}

function CertificadoGenerico() {
  const { slug } = useParams();
  return slug === 'basta' ? <Navigate to="/basta/certificado" replace /> : <Certificado slug={slug} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/inicio" replace />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/cadastro" element={<PublicOnly><Cadastro /></PublicOnly>} />
      <Route path="/cadastro/sucesso" element={<CadastroSucesso />} />
      <Route path="/recuperar-senha" element={<PublicOnly><RecuperarSenha /></PublicOnly>} />
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />
      <Route path="/convite" element={<AceitarConvite />} />
      <Route path="/sem-vinculo" element={<RequireAuth><SemVinculo /></RequireAuth>} />

      <Route path="/boas-vindas" element={<Privada><BoasVindas /></Privada>} />
      <Route path="/inicio" element={<Privada><Inicio /></Privada>} />

      <Route path="/escolher-instituicao" element={<RequireAuth><EscolherInstituicao /></RequireAuth>} />

      <Route path="/basta" element={<Privada><BastaLayout slug="basta" base="/basta" /></Privada>}>{paginasDaColecao}</Route>
      <Route path="/basta/certificado" element={<Privada><Certificado slug="basta" /></Privada>} />
      <Route path="/colecoes/:slug" element={<Privada><ColecaoGenerica /></Privada>}>{paginasDaColecao}</Route>
      <Route path="/colecoes/:slug/certificado" element={<Privada><CertificadoGenerico /></Privada>} />

      <Route path="/admin" element={<RequireAuth><AdminArea /></RequireAuth>}>
        <Route index element={<AdminDashboard />} />
        <Route path="instituicoes" element={<AdminInstituicoes />} />
        <Route path="instituicoes/:id" element={<AdminInstituicao />} />
        <Route path="usuarios" element={<AdminUsuarios />} />
        <Route path="coordenadores" element={<AdminCoordenadores />} />
        <Route path="colecoes" element={<AdminColecoes />} />
        <Route path="colecoes/:id" element={<AdminColecao />} />
        <Route path="colecoes/:id/previa" element={<AdminPrevia />} />
        <Route path="midias" element={<AdminMidias />} />
        <Route path="relatorios" element={<AdminRelatorios />} />
        <Route path="auditoria" element={<AdminAuditoria />} />
        <Route path="matriculas/:id" element={<AdminMatricula />} />
        <Route path="*" element={<ContentState tipo="inexistente" voltarPara="/admin" voltarTexto="Voltar à visão geral" />} />
      </Route>

      <Route path="/coordenacao" element={<RequireAuth><CoordArea /></RequireAuth>}>
        <Route index element={<CoordDashboard />} />
        <Route path="professores" element={<CoordProfessores />} />
        <Route path="colecoes" element={<CoordColecoes />} />
        <Route path="relatorios" element={<CoordRelatorios />} />
        <Route path="*" element={<ContentState tipo="inexistente" voltarPara="/coordenacao" voltarTexto="Voltar à visão geral" />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
