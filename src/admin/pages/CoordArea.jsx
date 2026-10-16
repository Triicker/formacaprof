import { useOutletContext } from 'react-router-dom';
import AdminShell from '../AdminShell';
import ContentState from '../../components/ContentState';
import { useAuth } from '../../context/AuthContext';
import { API_MODE } from '../../services/api';

const NAV = [
  { to: '/coordenacao', label: 'Visão geral', icon: 'dashboard', end: true },
  { to: '/coordenacao/professores', label: 'Professores', icon: 'users' },
  { to: '/coordenacao/colecoes', label: 'Coleções', icon: 'book' },
  { to: '/coordenacao/relatorios', label: 'Relatórios', icon: 'chart' },
];

/** Instituição ativa da coordenação (definida pelo CoordArea). */
export const useCoordInstitution = () => useOutletContext().instituicao;

/**
 * Área /coordenacao: pessoas com vínculo ativo de coordenação. Com vários vínculos, o topo mostra um seletor.
 * A instituição vai na URL de cada chamada e o backend confere o vínculo; esta checagem só organiza a interface.
 */
export default function CoordArea() {
  const { vinculos, instituicaoAtiva, escolherInstituicao } = useAuth();
  if (API_MODE !== 'http') {
    return <ContentState pagina tipo="indisponivel" titulo="Painel indisponível na demonstração" mensagem="O painel da coordenação funciona apenas com a API real (VITE_API_MODE=http)." />;
  }
  const coordenacoes = vinculos.filter((v) => v.papel === 'coordinator').map((v) => v.instituicao);
  if (!coordenacoes.length) {
    return <ContentState pagina tipo="bloqueado" titulo="Acesso restrito" mensagem="Esta área é exclusiva da coordenação pedagógica das instituições." />;
  }
  const atual = coordenacoes.find((i) => i.id === instituicaoAtiva?.id) ?? coordenacoes[0];

  const contexto = coordenacoes.length > 1 ? (
    <label className="adm-top__select">
      <span>Instituição</span>
      <select value={atual.id} onChange={(e) => escolherInstituicao(e.target.value)}>
        {coordenacoes.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
      </select>
    </label>
  ) : <span>{atual.nome}</span>;

  return (
    <AdminShell key={atual.id} title="Coordenação" subtitle={atual.nome} nav={NAV} context={contexto} outletContext={{ instituicao: atual }} />
  );
}
