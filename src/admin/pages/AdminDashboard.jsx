import { adminApi } from '../adminApi';
import { InstitutionSelect, useInstitutionOptions } from '../shared';
import { Async, Field, Filters, fmtDataHora, PageHeader, Stat, useAsync, useFilters } from '../ui';
import { descreverAcao } from '../acoes';

export default function AdminDashboard() {
  const [f, setF] = useFilters();
  const instituicoes = useInstitutionOptions();
  const params = { institutionId: f.institutionId, from: f.from, to: f.to && `${f.to}T23:59:59` };
  const state = useAsync(() => adminApi.dashboard(params), [f.institutionId, f.from, f.to]);

  return (
    <>
      <PageHeader title="Visão geral" description="Indicadores calculados em tempo real a partir do banco de dados." />
      <Filters>
        <Field label="Instituição"><InstitutionSelect value={f.institutionId} onChange={(v) => setF({ institutionId: v })} options={instituicoes} /></Field>
        <Field label="De"><input type="date" value={f.from ?? ''} onChange={(e) => setF({ from: e.target.value })} /></Field>
        <Field label="Até"><input type="date" value={f.to ?? ''} onChange={(e) => setF({ to: e.target.value })} /></Field>
      </Filters>
      <Async state={state}>
        {(d) => (
          <>
            <section className="adm-stats" aria-label="Indicadores">
              <Stat label="Instituições" value={d.institutions.total} hint={`${d.institutions.active} ativas · ${d.institutions.inactive} inativas`} />
              <Stat label="Professores ativos" value={d.professors} />
              <Stat label="Coordenadores ativos" value={d.coordinators} />
              <Stat label="Coleções publicadas" value={d.collections.published} hint={`${d.collections.inPreparation} em preparação`} />
              <Stat label="Matrículas ativas" value={d.enrollments.active} hint={f.from || f.to ? 'feitas no período' : undefined} />
              <Stat label="Formações concluídas" value={d.enrollments.completed} hint={f.from || f.to ? 'concluídas no período' : undefined} />
              <Stat label="Certificados emitidos" value={d.certificates} />
            </section>
            <section className="adm-card">
              <h2>Atividade recente</h2>
              {d.recentActivity.length ? (
                <ul className="adm-list adm-activity">
                  {d.recentActivity.map((a) => (
                    <li key={a.id}>
                      <span>{descreverAcao(a.action)}{a.institution ? ` · ${a.institution.name}` : ''}{a.actor ? ` — por ${a.actor.name}` : ''}</span>
                      <time dateTime={a.createdAt}>{fmtDataHora(a.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              ) : <p className="adm-empty">Sem atividade no período.</p>}
            </section>
          </>
        )}
      </Async>
    </>
  );
}
