import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { coordApi } from '../adminApi';
import { Async, Badge, Field, fmtData, Modal, PageHeader, Progress, Table, useAsync } from '../ui';
import { useCoordInstitution } from './CoordArea';

const ESTADO = { active: 'Liberada', none: 'Não liberada', suspended: 'Suspensa', revoked: 'Revogada', expired: 'Expirada' };

/** Coleções: liberadas (com números), não liberadas (pedido ao administrador) e em preparação. */
export default function CoordColecoes() {
  const inst = useCoordInstitution();
  const [modal, setModal] = useState(null);
  const state = useAsync(async () => {
    const [r, catalogo] = await Promise.all([coordApi.collections(inst.id), coordApi.catalog().catch(() => [])]);
    return { publicadas: r.items, preparo: catalogo.filter((c) => c.status === 'draft') };
  }, [inst.id]);

  return (
    <>
      <PageHeader title="Coleções" description="A liberação é feita pela Ética Editora. Com a coleção liberada, matricule professores em “Professores”." />
      <Async state={state}>
        {(d) => (
          <>
            <div className="adm-grid-cards">
              {d.publicadas.map((c) => {
                const st = c.institutionAccess.state;
                return (
                  <article key={c.id} className="adm-card" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                    {c.thumbnailUrl && <img src={c.thumbnailUrl} alt="" style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 8, filter: st === 'active' ? 'none' : 'grayscale(.6)' }} />}
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{c.title}</h2>
                      <Badge status={st}>{ESTADO[st] ?? st}</Badge>
                    </div>
                    {st === 'active' ? (
                      <>
                        <small>{c.enrollments.active} matrícula(s) ativa(s) · {c.enrollments.completed} conclusão(ões){c.institutionAccess.expiresAt ? ` · acesso até ${fmtData(c.institutionAccess.expiresAt)}` : ''}</small>
                        <Progress value={c.enrollments.active ? Math.round((c.enrollments.completed / c.enrollments.active) * 100) : 0} label={`Conclusão em ${c.title}`} />
                        <div><button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'matriculas', colecao: c })}>Ver matrículas</button></div>
                      </>
                    ) : (
                      <>
                        <small>{st === 'none' ? 'Sua instituição ainda não tem acesso a esta coleção.' : 'O acesso da instituição não está ativo. Matrículas existentes ficam preservadas.'}</small>
                        <div><button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => setModal({ tipo: 'pedir', colecao: c })}>Solicitar liberação</button></div>
                      </>
                    )}
                  </article>
                );
              })}
              {d.preparo.map((c) => (
                <article key={c.id} className="adm-card" style={{ display: 'grid', gap: 10, alignContent: 'start', opacity: 0.85 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{c.title}</h2>
                    <Badge tone="neutral">Em preparação</Badge>
                  </div>
                  <small>Coleção em produção pela Ética Editora.</small>
                </article>
              ))}
            </div>
            {!d.publicadas.length && !d.preparo.length && <p className="adm-empty">Nenhuma coleção disponível.</p>}
          </>
        )}
      </Async>
      {modal?.tipo === 'pedir' && <PedidoModal inst={inst} colecao={modal.colecao} onClose={() => setModal(null)} />}
      {modal?.tipo === 'matriculas' && <MatriculasColecao inst={inst} colecao={modal.colecao} onClose={() => setModal(null)} />}
    </>
  );
}

function PedidoModal({ inst, colecao, onClose }) {
  const toast = useToast();
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const r = await coordApi.requestAccess(inst.id, colecao.id, msg.trim());
      toast(r?.message ?? 'Pedido registrado.', 'success');
      onClose();
    } catch (err) { setErro(err.message); setEnviando(false); }
  }
  return (
    <Modal title={`Solicitar liberação: ${colecao.title}`} onClose={onClose}>
      <form className="adm-form" onSubmit={enviar}>
        <Field label="Mensagem (opcional)" hint="Ex.: quantidade de professores, prazo desejado.">
          <textarea rows={4} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} autoFocus />
        </Field>
        <p className="adm-notice adm-notice--info" style={{ margin: 0 }}>O pedido é enviado à administração da Ética Editora. Ele não libera o acesso automaticamente.</p>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className="adm-btn adm-btn--primary" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar pedido'}</button>
        </div>
      </form>
    </Modal>
  );
}

function MatriculasColecao({ inst, colecao, onClose }) {
  const state = useAsync(() => coordApi.collectionEnrollments(inst.id, colecao.id), [inst.id, colecao.id]);
  return (
    <Modal title={`Matrículas: ${colecao.title}`} onClose={onClose} wide>
      <Async state={state}>
        {(d) => (
          <div style={{ display: 'grid', gap: 12 }}>
            <p style={{ margin: 0 }}>{d.consolidated.activeEnrollments} ativa(s) · {d.consolidated.completed} concluída(s) · média {d.consolidated.averagePercent}%</p>
            <Table caption="Matrículas da coleção" rows={d.items} columns={[
              { key: 'n', label: 'Pessoa', render: (e) => <span className="adm-cell-main"><b>{e.user.name}</b><small>{e.user.email}</small></span> },
              { key: 'p', label: 'Progresso', render: (e) => <span style={{ display: 'grid', gap: 4, minWidth: 110 }}><small>{e.progress.percent}% · {e.progress.pending} pendente(s)</small><Progress value={e.progress.percent} /></span> },
              { key: 's', label: 'Matrícula', render: (e) => <Badge status={e.status} /> },
              { key: 'd', label: 'Desde', render: (e) => fmtData(e.enrolledAt) },
            ]} />
            {!d.items.length && <p className="adm-empty">Nenhuma matrícula nesta coleção.</p>}
          </div>
        )}
      </Async>
    </Modal>
  );
}
