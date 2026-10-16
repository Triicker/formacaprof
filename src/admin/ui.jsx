import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

// Componentes reutilizáveis dos painéis de gestão (administração global e coordenação).

export function PageHeader({ title, description, breadcrumb, actions }) {
  return (
    <header className="adm-header">
      <div>
        {breadcrumb && <div className="adm-breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="adm-header__actions">{actions}</div>}
    </header>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="adm-stat">
      <small>{label}</small>
      <b>{value ?? '—'}</b>
      {hint && <span>{hint}</span>}
    </div>
  );
}

const TONS = {
  active: 'success', published: 'success', accepted: 'success', completed: 'success', concluida: 'success',
  inactive: 'neutral', disabled: 'danger', draft: 'warning', archived: 'neutral', pending: 'info',
  revoked: 'danger', suspended: 'warning', expired: 'neutral', none: 'neutral', in_progress: 'info', not_started: 'neutral',
};
export const ROTULOS = {
  active: 'Ativo', inactive: 'Inativo', disabled: 'Desativado', draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado',
  pending: 'Pendente', accepted: 'Aceito', revoked: 'Revogado', expired: 'Expirado', suspended: 'Suspenso', none: 'Sem acesso',
  completed: 'Concluída', in_progress: 'Em andamento', not_started: 'Não iniciada',
  professor: 'Professor(a)', coordinator: 'Coordenação', platform_admin: 'Administração geral',
  presentation: 'Apresentação', curriculum: 'Formativo', video: 'Vídeo', document: 'Documento', reading: 'Leitura', activity: 'Atividade',
};
export function Badge({ status, children, tone }) {
  return <span className={`adm-badge adm-badge--${tone ?? TONS[status] ?? 'neutral'}`}>{children ?? ROTULOS[status] ?? status}</span>;
}

export function Progress({ value, label }) {
  return (
    <div className="adm-progress" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? `${value}% concluído`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="adm-field">
      <span>{label}</span>
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="adm-field__error" role="alert">{error}</small>}
    </label>
  );
}

export function Loading({ text = 'Carregando…' }) {
  return <div className="adm-loading" role="status"><div className="adm-spinner" aria-hidden="true" />{text}</div>;
}

export function ErrorBlock({ error, onRetry }) {
  return (
    <div className="adm-error" role="alert">
      <p>{error?.message ?? String(error)}</p>
      {onRetry && <button type="button" className="adm-btn adm-btn--sm" onClick={onRetry}>Tentar novamente</button>}
    </div>
  );
}

export function Empty({ children = 'Nenhum registro encontrado.' }) {
  return <div className="adm-empty">{children}</div>;
}

/** Envolve um bloco que depende de dados assíncronos (carregando → erro → vazio → conteúdo). */
export function Async({ state, empty, children }) {
  if (state.error) return <ErrorBlock error={state.error} onRetry={state.reload} />;
  if (!state.data) return <Loading />;
  if (empty && empty(state.data)) return <Empty />;
  return children(state.data);
}

/** Dados assíncronos com recarga. `deps` define quando buscar de novo. */
export function useAsync(fn, deps) {
  const [state, setState] = useState({ data: null, error: null });
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    setState((s) => ({ data: s.data, error: null }));
    fn().then((data) => n === seq.current && setState({ data, error: null }))
      .catch((error) => n === seq.current && setState({ data: null, error }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(load, [load]);
  return { ...state, reload: load };
}

/** Filtros guardados na URL (permite voltar/compartilhar a busca). */
export function useFilters(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const values = { ...defaults, ...Object.fromEntries(params) };
  const set = useCallback((patch) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v == null) next.delete(k); else next.set(k, v);
      }
      if (!('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);
  return [values, set];
}

export function Filters({ children }) {
  return (
    <details className="adm-filters" open>
      <summary>Filtros</summary>
      <div className="adm-filters__body">{children}</div>
    </details>
  );
}

export function Pager({ page, pages, total, onPage }) {
  if (!total) return null;
  return (
    <nav className="adm-pager" aria-label="Paginação">
      <span>{total} registro{total === 1 ? '' : 's'} · página {page} de {pages}</span>
      <div>
        <button type="button" className="adm-btn adm-btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</button>
        <button type="button" className="adm-btn adm-btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Próxima</button>
      </div>
    </nav>
  );
}

/**
 * Tabela responsiva: `columns` = [{ key, label, render(row), num }]. No celular cada linha vira um cartão
 * (o rótulo da coluna aparece via data-label).
 */
export function Table({ columns, rows, rowKey = (r) => r.id, caption, footer }) {
  return (
    <div className="adm-table-wrap">
      <table className="adm-table">
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? 'adm-num' : undefined}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.label} className={c.num ? 'adm-num' : undefined}>{c.render ? c.render(r) : r[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty />}
      {footer}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="adm-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modais abertos (o último é o do topo). Teclado tratado no documento: funciona mesmo se o foco
// cair fora do painel (ex.: botão que fica desabilitado durante o envio).
const pilhaModais = [];

/** Diálogo modal acessível: foco preso dentro, Esc fecha (só o do topo), foco volta para quem abriu. */
export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  const fechar = useRef(onClose);
  fechar.current = onClose;
  const tituloId = useId();
  useEffect(() => {
    const anterior = document.activeElement;
    const painel = ref.current;
    const eu = { painel };
    pilhaModais.push(eu);
    (painel.querySelector('[autofocus]') ?? painel.querySelector(FOCAVEIS))?.focus();
    const onKey = (e) => {
      if (pilhaModais.at(-1) !== eu) return;
      if (e.key === 'Escape') { e.preventDefault(); fechar.current(); return; }
      if (e.key !== 'Tab') return;
      const f = [...painel.querySelectorAll(FOCAVEIS)];
      if (!f.length) return;
      if (!painel.contains(document.activeElement)) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      pilhaModais.splice(pilhaModais.indexOf(eu), 1);
      anterior?.focus?.();
    };
  }, []);
  return (
    <div className="adm-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`adm-modal__panel ${wide ? 'adm-modal__panel--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={tituloId}>
        <div className="adm-modal__head">
          <h2 id={tituloId}>{title}</h2>
          <button type="button" className="adm-btn adm-btn--sm adm-btn--ghost" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        {children}
        {footer && <div className="adm-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Confirmação de ação sensível. Com `requireReason`, exige justificativa (registrada na auditoria).
 * `onConfirm(reason)` pode lançar erro: a mensagem aparece no próprio diálogo.
 */
export function Confirm({ title, message, confirmLabel = 'Confirmar', danger, requireReason, reasonLabel = 'Justificativa', onConfirm, onClose }) {
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function confirmar(e) {
    e.preventDefault();
    if (requireReason && motivo.trim().length < 10) return setErro('Descreva o motivo (mínimo 10 caracteres).');
    setEnviando(true);
    try {
      await onConfirm(motivo.trim());
      onClose();
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form className="adm-form" onSubmit={confirmar}>
        {typeof message === 'string' ? <p style={{ margin: 0 }}>{message}</p> : message}
        {requireReason && (
          <Field label={reasonLabel} hint="Fica registrada na auditoria.">
            <textarea value={motivo} onChange={(e) => { setMotivo(e.target.value); setErro(''); }} maxLength={500} />
          </Field>
        )}
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className={`adm-btn ${danger ? 'adm-btn--danger-solid' : 'adm-btn--primary'}`} disabled={enviando}>{enviando ? 'Aguarde…' : confirmLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
export const fmtDataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
