import { ESTADOS, estadoDoCard } from './StatusBadge';

// Card de coleção. O estado (coming_soon | locked | available + progresso) vem calculado da API;
// a arte original da capa é preservada. O estado aparece no selo do canto (cadeado aberto verde =
// liberada; cadeado escuro = em breve/bloqueada) e por extenso no nome acessível do botão.

const CADEADO = 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3z';
const CADEADO_ABERTO = 'M12 2a5 5 0 0 0-5 5h2a3 3 0 1 1 6 0v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5z';

export default function CollectionCard({ colecao, onOpen }) {
  const estado = estadoDoCard(colecao);
  const liberada = colecao.status === 'available';
  const pct = colecao.progresso?.percentual ?? 0;
  const rotulo = estado === 'em_andamento' ? `${ESTADOS[estado].texto}, ${pct}% concluído` : ESTADOS[estado].texto;

  return (
    <button type="button" className={`collection-card collection-card--${colecao.status}`} onClick={() => onOpen(colecao)}
      aria-label={`${colecao.titulo} (${rotulo})`} title={rotulo}>
      <span className="collection-card__cover">
        <img src={colecao.capa} alt="" />
        <span className={`collection-card__lock ${liberada ? 'collection-card__lock--open' : ''}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={liberada ? CADEADO_ABERTO : CADEADO} /></svg>
        </span>
        {liberada && colecao.progresso && (
          <span className="collection-card__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
        )}
      </span>
    </button>
  );
}

export function CollectionCardSkeleton() {
  return (
    <div className="collection-card collection-card--skeleton" aria-hidden="true">
      <span className="collection-card__cover" />
    </div>
  );
}
