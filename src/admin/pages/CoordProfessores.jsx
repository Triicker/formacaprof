import { useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { coordApi } from '../adminApi';
import { InviteModal } from '../shared';
import { Async, Badge, Confirm, Field, Filters, fmtData, fmtDataHora, Loading, Modal, PageHeader, Pager, Progress, Table, useAsync, useFilters } from '../ui';
import { useCoordInstitution } from './CoordArea';

/** Professores da instituição: convites, matrículas, progresso e vínculo. */
export default function CoordProfessores() {
  const inst = useCoordInstitution();
  const toast = useToast();
  const [f, setF] = useFilters({ page: '1' });
  const [modal, setModal] = useState(null);
  const [colecoes, setColecoes] = useState([]);
  const state = useAsync(() => coordApi.teachers(inst.id, { q: f.q, status: f.status, collectionId: f.collectionId, page: f.page, pageSize: 20 }),
    [inst.id, f.q, f.status, f.collectionId, f.page]);
  const convites = useAsync(() => coordApi.invitations(inst.id), [inst.id]);
  useEffect(() => { coordApi.collections(inst.id).then((r) => setColecoes(r.items)).catch(() => setColecoes([])); }, [inst.id]);
  const liberadas = colecoes.filter((c) => c.institutionAccess.state === 'active');
  const recarregar = () => { state.reload(); convites.reload(); };

  async function acao(fn, msg) {
    try { await fn(); toast(msg, 'success'); recarregar(); } catch (e) { toast(e.message); }
  }

  return (
    <>
      <PageHeader title="Professores" description="Convide professores, matricule nas coleções liberadas e acompanhe o progresso."
        actions={<button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal({ tipo: 'convidar' })}>Convidar professor(a)</button>} />
      <Filters>
        <Field label="Buscar"><input type="search" defaultValue={f.q} placeholder="Nome ou e-mail" onKeyDown={(e) => e.key === 'Enter' && setF({ q: e.currentTarget.value })} onBlur={(e) => e.currentTarget.value !== (f.q ?? '') && setF({ q: e.currentTarget.value })} /></Field>
        <Field label="Vínculo">
          <select value={f.status ?? ''} onChange={(e) => setF({ status: e.target.value })}><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
        </Field>
        <Field label="Matriculados em">
          <select value={f.collectionId ?? ''} onChange={(e) => setF({ collectionId: e.target.value })}>
            <option value="">Qualquer coleção</option>{colecoes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
      </Filters>

      <Async state={state}>
        {(d) => (
          <Table caption="Professores da instituição" rowKey={(r) => r.membershipId} rows={d.items} columns={[
            { key: 'n', label: 'Pessoa', render: (r) => <span className="adm-cell-main"><b>{r.user.name}</b><small>{r.user.email}</small></span> },
            { key: 'p', label: 'Papel', render: (r) => <Badge status={r.role} /> },
            { key: 'v', label: 'Vínculo', render: (r) => <Badge status={r.membershipStatus} /> },
            { key: 'm', label: 'Matrículas', render: (r) => (r.enrollments.length ? (
              <span style={{ display: 'grid', gap: 6, minWidth: 180 }}>
                {r.enrollments.map((e) => (
                  <span key={e.id} style={{ display: 'grid', gap: 2 }}>
                    <small><b>{e.collection}</b> · {e.status === 'revoked' ? 'revogada' : `${e.progress?.percent ?? 0}%`}{e.certificate ? ' · certificado' : ''}</small>
                    {e.status === 'active' && <Progress value={e.progress?.percent ?? 0} label={`${e.collection}: ${e.progress?.percent ?? 0}%`} />}
                  </span>
                ))}
              </span>
            ) : <small>Nenhuma</small>) },
            { key: 'u', label: 'Último acesso', render: (r) => fmtDataHora(r.user.lastLoginAt) },
            { key: 'a', label: '', render: (r) => (
              <div className="adm-table__actions">
                {r.membershipStatus === 'active' && <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => setModal({ tipo: 'matricular', pessoa: r })}>Matricular</button>}
                {r.enrollments.length > 0 && <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'matriculas', pessoa: r })}>Progresso</button>}
                {r.role === 'professor' && (r.membershipStatus === 'active'
                  ? <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'desativar', pessoa: r })}>Desativar vínculo</button>
                  : <button type="button" className="adm-btn adm-btn--sm" onClick={() => acao(() => coordApi.updateMember(inst.id, r.membershipId, { status: 'active' }), 'Vínculo reativado.')}>Reativar vínculo</button>)}
              </div>
            ) },
          ]} footer={<>
            {!d.items.length && <p className="adm-empty">Nenhum professor encontrado.</p>}
            <Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />
          </>} />
        )}
      </Async>

      <section className="adm-card">
        <h2>Convites pendentes</h2>
        <Async state={convites}>
          {(lista) => {
            const pendentes = (lista.items ?? lista).filter((c) => c.status === 'pending');
            return pendentes.length ? (
              <ul className="adm-list">
                {pendentes.map((c) => (
                  <li key={c.id}>
                    <span className="adm-cell-main"><b>{c.email}</b><small><Badge status={c.role} /> · expira em {fmtData(c.expiresAt)}</small></span>
                    <span className="adm-table__actions">
                      <button type="button" className="adm-btn adm-btn--sm" onClick={() => acao(() => coordApi.resendInvitation(inst.id, c.id), 'Convite reenviado.')}>Reenviar</button>
                      <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'revogarConvite', convite: c })}>Revogar</button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="adm-empty">Nenhum convite pendente.</p>;
          }}
        </Async>
      </section>

      {modal?.tipo === 'convidar' && <InviteModal institutionId={inst.id} roles={['professor']} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.tipo === 'matricular' && <MatricularModal inst={inst} pessoa={modal.pessoa} colecoes={liberadas} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.tipo === 'matriculas' && <MatriculasModal inst={inst} pessoa={modal.pessoa} onClose={() => setModal(null)} onChange={recarregar} />}
      {modal?.tipo === 'desativar' && (
        <Confirm title="Desativar vínculo" danger confirmLabel="Desativar"
          message={`${modal.pessoa.user.name} deixará de acessar os conteúdos da instituição. O histórico e os certificados são mantidos.`}
          onConfirm={async () => { await coordApi.updateMember(inst.id, modal.pessoa.membershipId, { status: 'inactive' }); toast('Vínculo desativado.', 'success'); recarregar(); }}
          onClose={() => setModal(null)} />
      )}
      {modal?.tipo === 'revogarConvite' && (
        <Confirm title="Revogar convite" danger confirmLabel="Revogar" message={`O link enviado para ${modal.convite.email} deixará de funcionar.`}
          onConfirm={async () => { await coordApi.revokeInvitation(inst.id, modal.convite.id); toast('Convite revogado.', 'success'); recarregar(); }}
          onClose={() => setModal(null)} />
      )}
    </>
  );
}

function MatricularModal({ inst, pessoa, colecoes, onClose, onDone }) {
  const toast = useToast();
  const ja = new Set(pessoa.enrollments.filter((e) => e.status === 'active').map((e) => e.collectionId));
  const opcoes = colecoes.filter((c) => !ja.has(c.id));
  const [colecao, setColecao] = useState(opcoes[0]?.id ?? '');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      await coordApi.enroll(inst.id, { userId: pessoa.user.id, collectionId: colecao });
      toast('Matrícula realizada.', 'success');
      onDone();
      onClose();
    } catch (err) { setErro(err.message); setEnviando(false); }
  }

  return (
    <Modal title={`Matricular ${pessoa.user.name}`} onClose={onClose}>
      {opcoes.length ? (
        <form className="adm-form" onSubmit={enviar}>
          <Field label="Coleção" hint="Somente coleções liberadas para a instituição.">
            <select value={colecao} onChange={(e) => setColecao(e.target.value)} autoFocus>
              {opcoes.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
          {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
          <div className="adm-modal__foot">
            <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
            <button className="adm-btn adm-btn--primary" disabled={enviando}>{enviando ? 'Matriculando…' : 'Matricular'}</button>
          </div>
        </form>
      ) : (
        <p className="adm-empty">{colecoes.length ? 'Esta pessoa já está matriculada em todas as coleções liberadas.' : 'A instituição ainda não tem coleções liberadas. Solicite a liberação em “Coleções”.'}</p>
      )}
    </Modal>
  );
}

function MatriculasModal({ inst, pessoa, onClose, onChange }) {
  const toast = useToast();
  const [sel, setSel] = useState(pessoa.enrollments[0]?.id);
  const [status, setStatus] = useState(() => Object.fromEntries(pessoa.enrollments.map((e) => [e.id, e.status])));
  const [det, setDet] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  useEffect(() => {
    setDet(null);
    if (sel) coordApi.enrollmentProgress(inst.id, sel).then(setDet).catch((e) => setDet({ erro: e.message }));
  }, [inst.id, sel]);
  const atual = pessoa.enrollments.find((e) => e.id === sel);

  async function alterar(novo) {
    await coordApi.setEnrollment(inst.id, sel, novo);
    setStatus((s) => ({ ...s, [sel]: novo }));
    toast(novo === 'revoked' ? 'Matrícula revogada.' : 'Matrícula reativada.', 'success');
    onChange();
  }

  return (
    <Modal title={`Progresso de ${pessoa.user.name}`} onClose={onClose} wide>
      {pessoa.enrollments.length > 1 && (
        <Field label="Coleção">
          <select value={sel} onChange={(e) => setSel(e.target.value)}>{pessoa.enrollments.map((e) => <option key={e.id} value={e.id}>{e.collection}</option>)}</select>
        </Field>
      )}
      {!det && <Loading />}
      {det?.erro && <p className="adm-field__error" role="alert">{det.erro}</p>}
      {det && !det.erro && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{det.collection.title}</b><Badge status={status[sel]} />
            {det.enrollment.completedAt && <Badge tone="success">Concluída em {fmtData(det.enrollment.completedAt)}</Badge>}
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            <small>{det.summary.requiredCompleted} de {det.summary.requiredTotal} aulas obrigatórias · {det.summary.percent}%</small>
            <Progress value={det.summary.percent} />
          </div>
          <div>
            <h3 style={{ fontSize: '1rem', margin: '0 0 6px' }}>Aulas pendentes</h3>
            {det.pendingLessons.length ? (
              <ul className="adm-list">{det.pendingLessons.map((l) => <li key={l.lessonId}><span>{l.title}</span><small>{l.moduleSlug}</small></li>)}</ul>
            ) : <p className="adm-empty">Nenhuma aula obrigatória pendente.</p>}
          </div>
        </div>
      )}
      <div className="adm-modal__foot">
        {atual && (status[sel] === 'active'
          ? <button type="button" className="adm-btn adm-btn--danger" onClick={() => setConfirmar('revoked')}>Revogar matrícula</button>
          : <button type="button" className="adm-btn" onClick={() => setConfirmar('active')}>Reativar matrícula</button>)}
        <button type="button" className="adm-btn adm-btn--primary" onClick={onClose}>Fechar</button>
      </div>
      {confirmar && (
        <Confirm title={confirmar === 'revoked' ? 'Revogar matrícula' : 'Reativar matrícula'} danger={confirmar === 'revoked'}
          message={confirmar === 'revoked' ? 'A pessoa perde o acesso à coleção. O progresso e o certificado já emitido são preservados.' : 'A pessoa volta a acessar a coleção com o progresso anterior.'}
          onConfirm={() => alterar(confirmar)} onClose={() => setConfirmar(null)} />
      )}
    </Modal>
  );
}
