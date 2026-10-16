import { Link } from 'react-router-dom';

// Estados de página para conteúdos: carregando, erro, sem permissão, inexistente, indisponível.
const TIPOS = {
  carregando: { titulo: 'Carregando…', icone: null },
  erro: { titulo: 'Não foi possível carregar', icone: '!' },
  bloqueado: { titulo: 'Acesso bloqueado', icone: 'lock' },
  indisponivel: { titulo: 'Coleção indisponível', icone: 'lock' },
  inexistente: { titulo: 'Conteúdo não encontrado', icone: '?' },
};

const Cadeado = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3z" />
  </svg>
);

export default function ContentState({ tipo, titulo, mensagem, onTentarNovamente, voltarPara = '/inicio', voltarTexto = 'Voltar às coleções', pagina = false }) {
  const t = TIPOS[tipo] ?? TIPOS.erro;
  const corpo = (
    <div className={`content-state content-state--${tipo}`} role={tipo === 'carregando' ? 'status' : 'alert'} aria-live="polite">
      {tipo === 'carregando' ? (
        <span className="content-state__spinner" aria-hidden="true" />
      ) : (
        <span className="content-state__icon" aria-hidden="true">{t.icone === 'lock' ? <Cadeado /> : t.icone}</span>
      )}
      <h1 className="content-state__title">{titulo ?? t.titulo}</h1>
      {mensagem && <p className="content-state__text">{mensagem}</p>}
      {tipo !== 'carregando' && (
        <div className="content-state__actions">
          {onTentarNovamente && <button type="button" className="btn btn--orange btn--sm" onClick={onTentarNovamente}>Tentar novamente</button>}
          <Link to={voltarPara} className="link link--orange">{voltarTexto}</Link>
        </div>
      )}
    </div>
  );
  return pagina ? <div className="content-state-page">{corpo}</div> : corpo;
}
