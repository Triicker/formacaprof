import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { adminApi } from '../adminApi';
import { InstitutionSelect, InviteModal, UserPickerModal, useInstitutionOptions } from '../shared';
import { Async, Badge, Confirm, Field, Filters, fmtData, fmtDataHora, Modal, PageHeader, Pager, Table, useAsync, useFilters } from '../ui';

/** Escolhe a instituição e depois a pessoa (usuário existente) a designar. */
function Designar({ instituicoes, fixa, substituir, onClose, onDone }) {
  const toast = useToast();
  const [inst, setInst] = useState(fixa ?? '');
  const [etapa, setEtapa] = useState(fixa ? 'usuario' : 'instituicao');
  async function escolher(u) {
    try {
      await adminApi.assignCoordinator(inst, u.id);
      // Substituição: só depois de designar o novo, o vínculo anterior é desativado (nunca a conta).
      if (substituir) await adminApi.updateMember(inst, substituir.id, { status: 'inactive' });
      toast(substituir ? `${u.name} substituiu ${substituir.user.name} na coordenação.` : `${u.name} agora coordena a instituição.`, 'success');
      onDone();
      onClose();
    } catch (e) {
      toast(e.message);
    }
  }
  if (etapa === 'usuario') return <UserPickerModal title={substituir ? `Substituir ${substituir.user.name}` : 'Designar coordenador'} onPick={escolher} onClose={onClose} />;
  return (
    <Modal title="Designar coordenador" onClose={onClose} footer={(
      <><button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
        <button type="button" className="adm-btn adm-btn--primary" disabled={!inst} onClick={() => setEtapa('usuario')}>Continuar</button></>
    )}>
      <Field label="Instituição"><InstitutionSelect value={inst} onChange={setInst} options={instituicoes.filter((i) => i.status === 'active')} required /></Field>
    </Modal>
  );
}

export default function AdminCoordenadores() {
  const toast = useToast();
  const [f, setF] = useFilters({ page: '1' });
  const [modal, setModal] = useState(null);
  const instituicoes = useInstitutionOptions();
  const lista = useAsync(() => adminApi.coordinators({ q: f.q, institutionId: f.institutionId, status: f.status, page: f.page, pageSize: 20 }), [f.q, f.institutionId, f.status, f.page]);
  const convites = useAsync(() => adminApi.allInvitations({ role: 'coordinator', status: 'pending', institutionId: f.institutionId, pageSize: 50 }), [f.institutionId]);
  const recarregar = () => { lista.reload(); convites.reload(); };

  return (
    <>
      <PageHeader title="Coordenadores" description="Quem coordena cada instituição. Remover um vínculo não apaga a conta nem os outros vínculos."
        actions={(
          <>
            <button type="button" className="adm-btn" onClick={() => setModal({ tipo: 'convidar' })}>Convidar por e-mail</button>
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal({ tipo: 'designar' })}>Designar usuário existente</button>
          </>
        )} />
      <Filters>
        <Field label="Buscar"><input type="search" defaultValue={f.q} placeholder="Nome ou e-mail" onKeyDown={(e) => e.key === 'Enter' && setF({ q: e.currentTarget.value })} onBlur={(e) => e.currentTarget.value !== (f.q ?? '') && setF({ q: e.currentTarget.value })} /></Field>
        <Field label="Instituição"><InstitutionSelect value={f.institutionId} onChange={(v) => setF({ institutionId: v })} options={instituicoes} /></Field>
        <Field label="Vínculo">
          <select value={f.status ?? ''} onChange={(e) => setF({ status: e.target.value })}>
            <option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Revogados</option>
          </select>
        </Field>
      </Filters>
      <Async state={lista}>
        {(d) => (
          <Table
            caption="Coordenadores"
            rows={d.items}
            columns={[
              { key: 'n', label: 'Coordenador(a)', render: (m) => <span className="adm-cell-main"><b>{m.user.name}</b><small>{m.user.email}</small></span> },
              { key: 'i', label: 'Instituição', render: (m) => <Link to={`/admin/instituicoes/${m.institution.id}`}>{m.institution.name}</Link> },
              { key: 's', label: 'Vínculo', render: (m) => <Badge status={m.status} /> },
              { key: 'l', label: 'Último acesso', render: (m) => fmtDataHora(m.user.lastLoginAt) },
              { key: 'a', label: '', render: (m) => (m.status === 'active' ? (
                <div className="adm-table__actions">
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'substituir', m })}>Substituir</button>
                  <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'revogar', m })}>Revogar</button>
                </div>
              ) : null) },
            ]}
            footer={<Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />}
          />
        )}
      </Async>

      <section className="adm-card">
        <h2>Convites de coordenação pendentes</h2>
        <Async state={convites}>
          {(d) => (
            <Table
              rows={d.items}
              columns={[
                { key: 'e', label: 'E-mail', render: (i) => <b>{i.email}</b> },
                { key: 'i', label: 'Instituição', render: (i) => i.institution.name },
                { key: 'x', label: 'Validade', render: (i) => fmtData(i.expiresAt) },
                { key: 'a', label: '', render: (i) => (
                  <div className="adm-table__actions">
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => adminApi.resendInvitation(i.institutionId, i.id).then(() => { toast('Convite reenviado com um novo link.', 'success'); convites.reload(); }).catch((e) => toast(e.message))}>Reenviar</button>
                    <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => adminApi.revokeInvitation(i.institutionId, i.id).then(() => { toast('Convite revogado.', 'success'); convites.reload(); }).catch((e) => toast(e.message))}>Revogar</button>
                  </div>
                ) },
              ]}
            />
          )}
        </Async>
      </section>

      {modal?.tipo === 'convidar' && <InviteModal institutions={instituicoes.filter((i) => i.status === 'active')} roles={['coordinator']} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.tipo === 'designar' && <Designar instituicoes={instituicoes} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.tipo === 'substituir' && <Designar instituicoes={instituicoes} fixa={modal.m.institution.id} substituir={modal.m} onClose={() => setModal(null)} onDone={recarregar} />}
      {modal?.tipo === 'revogar' && (
        <Confirm title="Revogar coordenação" danger confirmLabel="Revogar"
          message={`${modal.m.user.name} deixa de coordenar ${modal.m.institution.name}. A conta e os vínculos com outras instituições continuam válidos.`}
          onConfirm={async () => { await adminApi.updateMember(modal.m.institution.id, modal.m.id, { status: 'inactive' }); toast('Vínculo revogado.', 'success'); recarregar(); }}
          onClose={() => setModal(null)} />
      )}
    </>
  );
}
