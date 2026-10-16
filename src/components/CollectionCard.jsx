import StatusBadge, { ESTADOS, estadoDoCard } from './StatusBadge';

// Card de coleção. O estado (coming_soon | locked | available + progresso) vem calculado da API;
// a arte original da capa é preservada em todos os estados.

const Cadeado = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3z" />
  </svg>
);

export default function CollectionCard({ colecao, onOpen }) {
  const estado = estadoDoCard(colecao);
  const liberada = colecao.status === 'available';
  const pct = colecao.progresso?.percentual ?? 0;
  const rotulo = estado === 'em_andamento' ? `${ESTADOS[estado].texto}, ${pct}% concluído` : ESTADOS[estado].texto;

  return (
    <button type="button" className={`collection-card collection-card--${colecao.status}`} onClick={() => onOpen(colecao)}
      aria-label={`${colecao.titulo} (${rotulo})`}>
      <span className="collection-card__cover">
        <img src={colecao.capa} alt="" />
        {!liberada && <span className="collection-card__lock"><Cadeado /></span>}
        {liberada && colecao.progresso && (
          <span className="collection-card__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
        )}
      </span>
      <span className="collection-card__status" aria-hidden="true">
        <StatusBadge estado={estado} percentual={pct} />
      </span>
    </button>
  );
}

export function CollectionCardSkeleton() {
  return (
    <div className="collection-card collection-card--skeleton" aria-hidden="true">
      <span className="collection-card__cover" />
      <span className="collection-card__status" />
    </div>
  );
}
