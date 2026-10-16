import { Link } from 'react-router-dom';
import { descreverAcao } from '../acoes';
import { coordApi } from '../adminApi';
import { Async, fmtDataHora, PageHeader, Progress, Stat, useAsync } from '../ui';
import { useCoordInstitution } from './CoordArea';

export default function CoordDashboard() {
  const inst = useCoordInstitution();
  const state = useAsync(() => coordApi.dashboard(inst.id), [inst.id]);
  return (
    <>
      <PageHeader title="Visão geral" description={`Acompanhamento da formação em ${inst.nome}.`}
        actions={<Link className="adm-btn adm-btn--primary" to="/coordenacao/professores">Gerenciar professores</Link>} />
      <Async state={state}>
        {(d) => (
          <>
            <section className="adm-stats" aria-label="Indicadores">
              <Stat label="Professores ativos" value={d.activeProfessors} />
              <Stat label="Convites pendentes" value={d.pendingInvitations} />
              <Stat label="Coleções liberadas" value={d.collectionsWithAccess} />
              <Stat label="Professores matriculados" value={d.enrolledTeachers} />
              <Stat label="Formações em andamento" value={d.inProgress} />
              <Stat label="Formações concluídas" value={d.completed} />
              <Stat label="Certificados" value={d.certificates} />
            </section>
            <section className="adm-card">
              <h2>Conclusão por coleção</h2>
              {d.completionByCollection.length ? (
                <ul className="adm-list">
                  {d.completionByCollection.map((c) => (
                    <li key={c.collection.id} style={{ display: 'grid', gap: 6 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <b>{c.collection.title}</b>
                        <small>{c.completed} de {c.activeEnrollments} concluíram · {c.completionRate}%</small>
                      </span>
                      <Progress value={c.completionRate} label={`${c.collection.title}: ${c.completionRate}% de conclusão`} />
                    </li>
                  ))}
                </ul>
              ) : <p className="adm-empty">Nenhuma coleção liberada para a instituição ainda. Veja <Link to="/coordenacao/colecoes">Coleções</Link>.</p>}
            </section>
            <section className="adm-card">
              <h2>Atividade recente</h2>
              {d.recentActivity.length ? (
                <ul className="adm-list adm-activity">
                  {d.recentActivity.map((a) => (
                    <li key={a.id}>
                      <span>{descreverAcao(a.action)}{a.actor ? ` — por ${a.actor.name}` : ''}</span>
                      <time dateTime={a.createdAt}>{fmtDataHora(a.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              ) : <p className="adm-empty">Sem atividade registrada.</p>}
            </section>
          </>
        )}
      </Async>
    </>
  );
}
