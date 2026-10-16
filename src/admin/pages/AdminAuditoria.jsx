import { Fragment, useState } from 'react';
import { ACOES_AUDITORIA, descreverAcao } from '../acoes';
import { adminApi } from '../adminApi';
import { InstitutionSelect, useInstitutionOptions } from '../shared';
import { Async, Field, Filters, fmtDataHora, PageHeader, Pager, useAsync, useFilters } from '../ui';

const GRUPOS = [
  ['', 'Todos os eventos'], ['invitation.', 'Convites'], ['platform_role.', 'Papéis globais'], ['membership.', 'Vínculos'],
  ['user.', 'Contas'], ['institution.', 'Instituições'], ['collection_access.', 'Liberação de coleções'], ['enrollment.', 'Matrículas'],
  ['collection.', 'Coleções'], ['module', 'Módulos'], ['lesson', 'Aulas'], ['media.', 'Mídia'], ['progress.', 'Correções de progresso'],
  ['certificate.', 'Certificados'], ['report.', 'Exportações'], ['auth.', 'Acesso'],
];

/** Trilha de auditoria (somente inclusão no banco). Metadados nunca contêm senhas ou tokens. */
export default function AdminAuditoria() {
  const [f, setF] = useFilters({ page: '1' });
  const [aberto, setAberto] = useState(null);
  const instituicoes = useInstitutionOptions();
  const state = useAsync(() => adminApi.audit({
    actionPrefix: f.grupo || undefined, action: f.action, institutionId: f.institutionId, entityId: f.entityId,
    from: f.from, to: f.to && `${f.to}T23:59:59`, page: f.page, pageSize: 30,
  }), [f.grupo, f.action, f.institutionId, f.entityId, f.from, f.to, f.page]);

  return (
    <>
      <PageHeader title="Auditoria" description="Eventos sensíveis: quem fez, o quê, onde e quando. Os registros não podem ser alterados nem apagados." />
      <Filters>
        <Field label="Tipo de evento">
          <select value={f.grupo ?? ''} onChange={(e) => setF({ grupo: e.target.value, action: '' })}>{GRUPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </Field>
        <Field label="Ação específica">
          <select value={f.action ?? ''} onChange={(e) => setF({ action: e.target.value })}>
            <option value="">Todas</option>
            {ACOES_AUDITORIA.filter((a) => !f.grupo || a.value.startsWith(f.grupo)).map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        <Field label="Instituição"><InstitutionSelect value={f.institutionId} onChange={(v) => setF({ institutionId: v })} options={instituicoes} /></Field>
        <Field label="De"><input type="date" value={f.from ?? ''} onChange={(e) => setF({ from: e.target.value })} /></Field>
        <Field label="Até"><input type="date" value={f.to ?? ''} onChange={(e) => setF({ to: e.target.value })} /></Field>
      </Filters>
      <Async state={state}>
        {(d) => (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <caption className="visually-hidden">Eventos de auditoria</caption>
              <thead><tr><th scope="col">Quando</th><th scope="col">Evento</th><th scope="col">Quem</th><th scope="col">Instituição</th><th scope="col">Detalhes</th></tr></thead>
              <tbody>
                {d.items.map((a) => (
                  <Fragment key={a.id}>
                    <tr>
                      <td data-label="Quando">{fmtDataHora(a.createdAt)}</td>
                      <td data-label="Evento"><span className="adm-cell-main"><b>{descreverAcao(a.action)}</b><small>{a.entityType}{a.entityId ? ` · ${a.entityId.slice(0, 8)}` : ''}</small></span></td>
                      <td data-label="Quem">{a.actor?.name ?? 'Sistema'}</td>
                      <td data-label="Instituição">{a.institution?.name ?? '—'}</td>
                      <td data-label="Detalhes">
                        {a.metadata ? (
                          <button type="button" className="adm-btn adm-btn--sm" aria-expanded={aberto === a.id} onClick={() => setAberto(aberto === a.id ? null : a.id)}>
                            {aberto === a.id ? 'Ocultar' : 'Ver'}
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                    {aberto === a.id && (
                      <tr><td colSpan={5} data-label=""><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '.8rem', textAlign: 'left' }}>{JSON.stringify(a.metadata, null, 2)}</pre></td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {!d.items.length && <p className="adm-empty">Nenhum evento no filtro.</p>}
            <Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />
          </div>
        )}
      </Async>
    </>
  );
}
