// Estado de uma coleção/formação: ícone + texto (nunca só cor ou opacidade).
// em_breve usa texto só para leitores de tela: no card, a capa com cadeado já comunica o estado.

const Cadeado = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3z" />
  </svg>
);
const Play = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>;
const Check = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" /></svg>;

export const ESTADOS = {
  em_breve: { texto: 'Em breve', icone: Cadeado, somenteLeitor: true },
  bloqueado: { texto: 'Acesso bloqueado', icone: Cadeado },
  liberado: { texto: 'Começar', icone: Play },
  em_andamento: { texto: 'Continuar', icone: Play },
  concluido: { texto: 'Concluída', icone: Check },
};

/** Converte o card da API (status + progresso) no estado visual. */
export function estadoDoCard(c) {
  if (c.status === 'coming_soon') return 'em_breve';
  if (c.status !== 'available') return 'bloqueado';
  if (c.progresso?.estado === 'concluida') return 'concluido';
  if (c.progresso?.estado === 'em_andamento') return 'em_andamento';
  return 'liberado';
}

export default function StatusBadge({ estado, percentual }) {
  const e = ESTADOS[estado];
  if (!e) return null;
  const Icone = e.icone;
  const texto = estado === 'em_andamento' && percentual != null ? `${e.texto} · ${percentual}%` : e.texto;
  if (e.somenteLeitor) return <span className="visually-hidden">{texto}</span>;
  return (
    <span className={`status-badge status-badge--${estado}`}>
      <Icone />
      {texto}
    </span>
  );
}
