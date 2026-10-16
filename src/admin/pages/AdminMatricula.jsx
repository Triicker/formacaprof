import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { descreverAcao } from '../acoes';
import { adminApi } from '../adminApi';
import { Async, Badge, Confirm, fmtData, fmtDataHora, PageHeader, Progress, Table, useAsync } from '../ui';

const ORIGEM = { manual: 'Botão', player: 'Fim do vídeo', admin_correction: 'Correção administrativa' };

/** Histórico de matrícula, progresso por aula, certificado e correções (sempre com justificativa). */
export default function AdminMatricula() {
  const { id } = useParams();
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const state = useAsync(() => adminApi.enrollment(id), [id]);

  return (
    <Async state={state}>
      {(e) => (
        <>
          <PageHeader breadcrumb={<Link to="/admin/relatorios">Relatórios</Link>} title={`${e.user.name} · ${e.collection.title}`}
            description={`${e.user.email} · ${e.institution.name} · matriculado(a) em ${fmtData(e.enrolledAt)}${e.assignedBy ? ` por ${e.assignedBy}` : ''}`}
            actions={<Badge status={e.status} />} />
          <section className="adm-stats">
            <div className="adm-stat"><small>Progresso</small><b>{e.summary.percent}%</b><span>{e.summary.requiredCompleted} de {e.summary.requiredTotal} aulas obrigatórias</span></div>
            <div className="adm-stat"><small>Conclusão</small><b>{e.completedAt ? fmtData(e.completedAt) : '—'}</b></div>
            <div className="adm-stat">
              <small>Certificado</small>
              <b style={{ fontSize: '1.1rem' }}>{e.certificate ? e.certificate.verificationCode : '—'}</b>
              <span>{e.certificate ? (e.certificate.revokedAt ? `Revogado em ${fmtData(e.certificate.revokedAt)}` : `Emitido em ${fmtData(e.certificate.issuedAt)}`) : 'Não emitido'}</span>
            </div>
          </section>
          {e.certificate && !e.certificate.revokedAt && (
            <div><button type="button" className="adm-btn adm-btn--danger" onClick={() => setModal({ tipo: 'revogar' })}>Revogar certificado</button></div>
          )}

          <section className="adm-card">
            <h2>Progresso por aula</h2>
            <p className="adm-notice adm-notice--info" style={{ marginTop: 0 }}>Correções valem por aula e exigem justificativa; o percentual é sempre recalculado pelo servidor.</p>
            <Table rowKey={(l) => l.lessonId} rows={e.lessons} columns={[
              { key: 't', label: 'Aula', render: (l) => <span className="adm-cell-main"><b>{l.title}</b><small>{l.moduleSlug} · {l.required ? 'obrigatória' : 'complementar'}</small></span> },
              { key: 's', label: 'Situação', render: (l) => <Badge status={l.status} /> },
              { key: 'o', label: 'Origem', render: (l) => (l.completionSource ? ORIGEM[l.completionSource] : '—') },
              { key: 'd', label: 'Concluída em', render: (l) => fmtDataHora(l.completedAt) },
              { key: 'a', label: '', render: (l) => (
                <div className="adm-table__actions">
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'corrigir', aula: l, concluir: l.status !== 'completed' })}>
                    {l.status === 'completed' ? 'Desfazer conclusão' : 'Marcar como concluída'}
                  </button>
                </div>
              ) },
            ]} />
            <div style={{ marginTop: 12 }}><Progress value={e.summary.percent} /></div>
          </section>

          <section className="adm-card">
            <h2>Histórico</h2>
            <ul className="adm-list adm-activity">
              {e.history.map((h) => (
                <li key={h.id}>
                  <span>{descreverAcao(h.action)}{h.actor ? ` — por ${h.actor.name}` : ''}
                    {h.metadata?.justification && <><br /><small>Justificativa: {h.metadata.justification}</small></>}
                    {h.metadata?.from !== undefined && h.action === 'progress.corrected' && <><br /><small>Antes: {h.metadata.from?.status ?? 'sem registro'} → Depois: {h.metadata.to?.status}</small></>}
                  </span>
                  <time dateTime={h.createdAt}>{fmtDataHora(h.createdAt)}</time>
                </li>
              ))}
              {!e.history.length && <li>Sem eventos.</li>}
            </ul>
          </section>

          {modal?.tipo === 'corrigir' && (
            <Confirm title={modal.concluir ? 'Marcar aula como concluída' : 'Desfazer conclusão da aula'} requireReason
              message={`Aula: ${modal.aula.title}. A alteração fica registrada com os valores anteriores e novos.`}
              onConfirm={async (j) => { await adminApi.correctProgress(id, { lessonId: modal.aula.lessonId, completed: modal.concluir, justification: j }); toast('Progresso corrigido.', 'success'); state.reload(); }}
              onClose={() => setModal(null)} />
          )}
          {modal?.tipo === 'revogar' && (
            <Confirm title="Revogar certificado" danger requireReason confirmLabel="Revogar"
              message="A verificação pública passará a indicar que o certificado não é válido."
              onConfirm={async (j) => { await adminApi.revokeCertificate(e.certificate.id, j); toast('Certificado revogado.', 'success'); state.reload(); }}
              onClose={() => setModal(null)} />
          )}
        </>
      )}
    </Async>
  );
}
