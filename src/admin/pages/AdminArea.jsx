import AdminShell from '../AdminShell';
import ContentState from '../../components/ContentState';
import { useAuth } from '../../context/AuthContext';
import { API_MODE } from '../../services/api';

const NAV = [
  { to: '/admin', label: 'Visão geral', icon: 'dashboard', end: true },
  { to: '/admin/instituicoes', label: 'Instituições', icon: 'school' },
  { to: '/admin/usuarios', label: 'Usuários', icon: 'users' },
  { to: '/admin/coordenadores', label: 'Coordenadores', icon: 'badge' },
  { to: '/admin/colecoes', label: 'Coleções', icon: 'book' },
  { to: '/admin/midias', label: 'Biblioteca de mídia', icon: 'media' },
  { to: '/admin/relatorios', label: 'Relatórios', icon: 'chart' },
  { to: '/admin/auditoria', label: 'Auditoria', icon: 'log' },
];

/** Área /admin: só administrador geral. A checagem aqui organiza a interface; o backend autoriza cada chamada. */
export default function AdminArea() {
  const { isAdmin } = useAuth();
  if (API_MODE !== 'http') {
    return <ContentState pagina tipo="indisponivel" titulo="Painel indisponível na demonstração" mensagem="O painel administrativo funciona apenas com a API real (VITE_API_MODE=http)." />;
  }
  if (!isAdmin) {
    return <ContentState pagina tipo="bloqueado" titulo="Acesso restrito" mensagem="Esta área é exclusiva da administração geral da Ética Editora." />;
  }
  return <AdminShell title="Administração" subtitle="Ética Editora" nav={NAV} context={<span>Administração geral da plataforma</span>} />;
}
