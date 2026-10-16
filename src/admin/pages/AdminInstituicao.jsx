import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { adminApi } from '../adminApi';
import { InviteModal, UserPickerModal, VincularModal } from '../shared';
import { Async, Badge, Confirm, fmtData, fmtDataHora, PageHeader, Table, Tabs, useAsync } from '../ui';
import { InstitutionForm } from './AdminInstituicoes';
import { AcessosColecoes } from './AdminAcessos';

export default function AdminInstituicao() {
  const { id } = useParams();
  const toast = useToast();
  const [aba, setAba] = useState('resumo');
  const [modal, setModal] = useState(null);
  const state = useAsync(() => adminApi.institution(id), [id]);
  const membros = useAsync(() => (aba === 'membros' ? adminApi.members(id, { limit: 200 }) : Promise.resolve(null)), [id, aba]);
  const convites = useAsync(() => (aba === 'convites' ? adminApi.invitations(id) : Promise.resolve(null)), [id, aba]);

  const recarregar = () => { state.reload(); membros.reload(); convites.reload(); };
  const acao = async (fn, msg) => { await fn(); toast(msg, 'success'); recarregar(); };

  return (
    <Async state={state}>
      {(inst) => (
        <>
          <PageHeader
            breadcrumb={<Link to="/admin/instituicoes">Instituições</Link>}
            title={inst.name}
            description={[inst.organization?.name, [inst.city, inst.state].filter(Boolean).join('/'), inst.region].filter(Boolean).join(' · ') || 'Sem localização cadastrada'}
            actions={(
              <>
                <Badge status={inst.status} />
                <button type="button" className="adm-btn" onClick={() => setModal({ tipo: 'editar' })}>Editar dados</button>
                {inst.status === 'active' ? (
                  <button type="button" className="adm-btn adm-btn--danger" onClick={() => setModal({ tipo: 'status', valor: 'inactive' })}>Desativar</button>
                ) : (
                  <button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal({ tipo: 'status', valor: 'active' })}>Reativar</button>
                )}
              </>
            )}
          />
          <Tabs value={aba} onChange={setAba} tabs={[
            { value: 'resumo', label: 'Resumo' }, { value: 'coordenacao', label: 'Coordenação' }, { value: 'membros', label: 'Membros' },
            { value: 'convites', label: 'Convites' }, { value: 'colecoes', label: 'Coleções' },
          ]} />

          {aba === 'resumo' && (
            <section className="adm-stats">
              <div className="adm-stat"><small>Coordenadores ativos</small><b>{inst.coordinators.filter((c) => c.status === 'active').length}</b></div>
              <div className="adm-stat"><small>Professores ativos</small><b>{inst.counts.professors}</b></div>
              <div className="adm-stat"><small>Convites pendentes</small><b>{inst.counts.pendingInvitations}</b></div>
              <div className="adm-stat"><small>Matrículas ativas</small><b>{inst.counts.activeEnrollments}</b></div>
              <div className="adm-stat"><small>Certificados</small><b>{inst.counts.certificates}</b></div>
              <div className="adm-stat"><small>Coleções liberadas</small><b>{inst.collectionAccess.filter((c) => c.state === 'active').length}</b></div>
            </section>
          )}

          {aba === 'coordenacao' && (
            <section className="adm-card">
              <div className="adm-card__head">
                <h2>Coordenação pedagógica</h2>
                <div className="adm-header__actions">
                  <button type="button" className="adm-btn" onClick={() => setModal({ tipo: 'designar' })}>Designar usuário existente</button>
                  <button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal({ tipo: 'convidar', roles: ['coordinator'] })}>Convidar coordenador</button>
                </div>
              </div>
              <Table
                rows={inst.coordinators}
                columns={[
                  { key: 'n', label: 'Nome', render: (c) => <span className="adm-cell-main"><b>{c.user.name}</b><small>{c.user.email}</small></span> },
                  { key: 's', label: 'Vínculo', render: (c) => <Badge status={c.status} /> },
                  { key: 'l', label: 'Último acesso', render: (c) => fmtDataHora(c.user.lastLoginAt) },
                  { key: 'a', label: '', render: (c) => (
                    <div className="adm-table__actions">
                      {c.status === 'active'
                        ? <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'vinculo', m: c, valor: 'inactive' })}>Revogar vínculo</button>
                        : <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'vinculo', m: c, valor: 'active' })}>Reativar</button>}
                    </div>
                  ) },
                ]}
              />
              <p className="adm-notice adm-notice--info">Revogar o vínculo tira os poderes de coordenação só nesta instituição: a conta e os demais vínculos continuam válidos. Para substituir, designe a nova pessoa e depois revogue o vínculo anterior.</p>
            </section>
          )}

          {aba === 'membros' && (
            <Async state={membros}>
              {(d) => (
                <section className="adm-card">
                <div className="adm-card__head">
                  <h2>Membros</h2>
                  <div className="adm-header__actions">
                    <button type="button" className="adm-btn" onClick={() => setModal({ tipo: 'vincular' })}>Vincular usuário existente</button>
                    <button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal({ tipo: 'convidar', roles: ['professor', 'coordinator'] })}>Convidar por e-mail</button>
                  </div>
                </div>
                <Table
                  caption="Membros"
                  rows={d.items}
                  columns={[
                    { key: 'n', label: 'Nome', render: (m) => <span className="adm-cell-main"><b>{m.user.name}</b><small>{m.user.email}</small></span> },
                    { key: 'r', label: 'Papel', render: (m) => <Badge status={m.role} tone={m.role === 'coordinator' ? 'info' : 'neutral'} /> },
                    { key: 's', label: 'Vínculo', render: (m) => <Badge status={m.status} /> },
                    { key: 'c', label: 'Conta', render: (m) => <Badge status={m.user.status} /> },
                    { key: 'l', label: 'Último acesso', render: (m) => fmtDataHora(m.user.lastLoginAt) },
                    { key: 'a', label: '', render: (m) => (
                      <div className="adm-table__actions">
                        <Link className="adm-btn adm-btn--sm" to={`/admin/usuarios?id=${m.user.id}`}>Abrir usuário</Link>
                        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'vinculo', m, valor: m.status === 'active' ? 'inactive' : 'active' })}>
                          {m.status === 'active' ? 'Desativar vínculo' : 'Reativar vínculo'}
                        </button>
                      </div>
                    ) },
                  ]}
                />
                {!d.items.length && <p className="adm-empty">Nenhum membro ainda. Vincule uma pessoa já cadastrada ou envie um convite.</p>}
                </section>
              )}
            </Async>
          )}

          {aba === 'convites' && (
            <section className="adm-card">
              <div className="adm-card__head">
                <h2>Convites</h2>
                <button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal({ tipo: 'convidar', roles: ['professor', 'coordinator'] })}>Convidar</button>
              </div>
              <Async state={convites}>
                {(d) => (
                  <Table
                    rows={d.items}
                    columns={[
                      { key: 'e', label: 'E-mail', render: (i) => <b>{i.email}</b> },
                      { key: 'r', label: 'Papel', render: (i) => <Badge status={i.role} tone="neutral" /> },
                      { key: 's', label: 'Situação', render: (i) => <Badge status={i.status} /> },
                      { key: 'x', label: 'Validade', render: (i) => fmtData(i.expiresAt) },
                      { key: 'b', label: 'Enviado por', render: (i) => i.createdBy?.name ?? '—' },
                      { key: 'a', label: '', render: (i) => (
                        <div className="adm-table__actions">
                          {i.status !== 'accepted' && <button type="button" className="adm-btn adm-btn--sm" onClick={() => acao(() => adminApi.resendInvitation(id, i.id), 'Convite reenviado com um novo link.').catch((e) => toast(e.message))}>Reenviar</button>}
                          {i.status === 'pending' && <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'revogarConvite', i })}>Revogar</button>}
                        </div>
                      ) },
                    ]}
                  />
                )}
              </Async>
            </section>
          )}

          {aba === 'colecoes' && <AcessosColecoes institution={inst} onChanged={state.reload} />}

          {modal?.tipo === 'editar' && <InstitutionForm inicial={inst} onClose={() => setModal(null)} onSaved={state.reload} />}
          {modal?.tipo === 'status' && (
            <Confirm
              title={modal.valor === 'inactive' ? 'Desativar instituição' : 'Reativar instituição'}
              message={modal.valor === 'inactive'
                ? 'Membros desta instituição perdem o acesso aos conteúdos enquanto ela estiver inativa. Nada é apagado: matrículas, progresso e certificados ficam preservados.'
                : 'Os vínculos ativos voltam a dar acesso aos conteúdos liberados.'}
              danger={modal.valor === 'inactive'}
              confirmLabel={modal.valor === 'inactive' ? 'Desativar' : 'Reativar'}
              onConfirm={() => acao(() => adminApi.updateInstitution(id, { status: modal.valor }), 'Status atualizado.')}
              onClose={() => setModal(null)}
            />
          )}
          {modal?.tipo === 'vinculo' && (
            <Confirm
              title={modal.valor === 'inactive' ? 'Desativar vínculo' : 'Reativar vínculo'}
              message={`${modal.m.user.name} ${modal.valor === 'inactive' ? 'deixará de ter acesso por esta instituição' : 'voltará a ter acesso por esta instituição'}. A conta e os outros vínculos não são alterados.`}
              danger={modal.valor === 'inactive'}
              onConfirm={() => acao(() => adminApi.updateMember(id, modal.m.id, { status: modal.valor }), 'Vínculo atualizado.')}
              onClose={() => setModal(null)}
            />
          )}
          {modal?.tipo === 'revogarConvite' && (
            <Confirm title="Revogar convite" message={`O link enviado para ${modal.i.email} deixará de funcionar.`} danger confirmLabel="Revogar"
              onConfirm={() => acao(() => adminApi.revokeInvitation(id, modal.i.id), 'Convite revogado.')} onClose={() => setModal(null)} />
          )}
          {modal?.tipo === 'vincular' && <VincularModal institutionId={id} onClose={() => setModal(null)} onDone={recarregar} />}
          {modal?.tipo === 'convidar' && <InviteModal institutionId={id} roles={modal.roles} onClose={() => setModal(null)} onDone={recarregar} />}
          {modal?.tipo === 'designar' && (
            <UserPickerModal
              title="Designar coordenador"
              onClose={() => setModal(null)}
              onPick={(u) => acao(() => adminApi.assignCoordinator(id, u.id), `${u.name} agora coordena esta instituição.`).then(() => setModal(null)).catch((e) => toast(e.message))}
            />
          )}
        </>
      )}
    </Async>
  );
}
