import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { descreverAcao } from '../acoes';
import { adminApi } from '../adminApi';
import { InstitutionSelect, InviteModal, MembershipBadges, useInstitutionOptions, VincularModal } from '../shared';
import {
  Async, Badge, Confirm, Field, Filters, fmtData, fmtDataHora, Modal, PageHeader, Pager, Table, Tabs, useAsync, useFilters,
} from '../ui';

function PapelGlobal({ usuario, onDone, onClose }) {
  const conceder = !usuario.platformRoles.includes('platform_admin');
  const toast = useToast();
  const [f, setF] = useState({ justification: '', currentPassword: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  async function enviar(e) {
    e.preventDefault();
    if (f.justification.trim().length < 10) return setErro('Descreva o motivo (mínimo 10 caracteres).');
    if (!f.currentPassword) return setErro('Confirme com a sua senha.');
    setEnviando(true);
    try {
      await adminApi.setPlatformRole(usuario.id, { grant: conceder, justification: f.justification.trim(), currentPassword: f.currentPassword });
      toast(conceder ? 'Papel de administrador concedido.' : 'Papel de administrador removido.', 'success');
      onDone();
      onClose();
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  }
  return (
    <Modal title={conceder ? 'Conceder administração geral' : 'Remover administração geral'} onClose={onClose}>
      <form className="adm-form" onSubmit={enviar}>
        <p className="adm-notice" style={{ margin: 0 }}>
          {conceder
            ? `${usuario.name} passará a gerenciar TODAS as instituições, usuários, coleções e relatórios. Conceda apenas a quem realmente precisa (menor privilégio).`
            : `${usuario.name} perderá imediatamente o acesso ao painel administrativo.`}
        </p>
        <Field label="Justificativa" hint="Registrada na auditoria."><textarea value={f.justification} onChange={(e) => { setF({ ...f, justification: e.target.value }); setErro(''); }} maxLength={500} /></Field>
        <Field label="Sua senha (confirmação)"><input type="password" autoComplete="current-password" value={f.currentPassword} onChange={(e) => { setF({ ...f, currentPassword: e.target.value }); setErro(''); }} /></Field>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className={`adm-btn ${conceder ? 'adm-btn--primary' : 'adm-btn--danger-solid'}`} disabled={enviando}>{enviando ? 'Aguarde…' : 'Confirmar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Painel de detalhe do usuário (abre sobre a lista; `?id=` na URL). */
function UsuarioModal({ id, institutions, onClose, onChanged }) {
  const toast = useToast();
  const { user: eu } = useAuth();
  const [aba, setAba] = useState('dados');
  const [modal, setModal] = useState(null);
  const [nome, setNome] = useState(null);
  const state = useAsync(() => adminApi.user(id), [id]);
  const hist = useAsync(() => (aba === 'historico' ? adminApi.audit({ subjectUserId: id, pageSize: 50 }) : Promise.resolve(null)), [id, aba]);
  const recarregar = () => { state.reload(); onChanged(); };
  const acao = async (fn, msg) => { await fn(); toast(msg, 'success'); recarregar(); };

  return (
    <Modal title="Usuário" onClose={onClose} wide>
      <Async state={state}>
        {(u) => (
          <>
            <div className="adm-card__head" style={{ margin: 0 }}>
              <div className="adm-cell-main"><b style={{ fontSize: '1.1rem' }}>{u.name}</b><small>{u.email}</small></div>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Badge status={u.status} />
                {u.platformRoles.includes('platform_admin') && <Badge status="platform_admin" tone="info" />}
              </span>
            </div>
            <Tabs value={aba} onChange={setAba} tabs={[{ value: 'dados', label: 'Dados e acesso' }, { value: 'vinculos', label: 'Vínculos' }, { value: 'historico', label: 'Histórico' }]} />

            {aba === 'dados' && (
              <div className="adm-grid">
                <dl className="adm-dl">
                  <dt>Cadastro</dt><dd>{fmtData(u.createdAt)}</dd>
                  <dt>Último acesso</dt><dd>{fmtDataHora(u.lastLoginAt)}</dd>
                  <dt>E-mail verificado</dt><dd>{u.emailVerifiedAt ? fmtData(u.emailVerifiedAt) : 'Não'}</dd>
                  <dt>Sessões ativas</dt><dd>{u.activeSessions}</dd>
                  <dt>Matrículas</dt><dd>{u.enrollments}</dd>
                  <dt>Convites pendentes</dt><dd>{u.pendingInvitations.length ? u.pendingInvitations.map((i) => i.institution.name).join(', ') : 'Nenhum'}</dd>
                </dl>
                <form className="adm-form" onSubmit={(e) => { e.preventDefault(); acao(() => adminApi.updateUser(id, { name: nome.trim() }), 'Nome atualizado.').then(() => setNome(null)).catch((err) => toast(err.message)); }}>
                  <Field label="Nome" hint="O e-mail é a identidade de acesso e não é alterado por aqui. Senhas nunca são exibidas.">
                    <input value={nome ?? u.name} onChange={(e) => setNome(e.target.value)} minLength={3} maxLength={160} />
                  </Field>
                  <div className="adm-header__actions">
                    <button className="adm-btn adm-btn--primary" disabled={nome === null || nome.trim() === u.name || nome.trim().length < 3}>Salvar nome</button>
                    <button type="button" className="adm-btn" disabled={!u.activeSessions} onClick={() => setModal('sessoes')}>Encerrar sessões</button>
                    {u.id !== eu.id && (u.status === 'active'
                      ? <button type="button" className="adm-btn adm-btn--danger" onClick={() => setModal('desativar')}>Desativar conta</button>
                      : <button type="button" className="adm-btn" onClick={() => setModal('reativar')}>Reativar conta</button>)}
                    <button type="button" className="adm-btn" onClick={() => setModal('papel')}>
                      {u.platformRoles.includes('platform_admin') ? 'Remover administração geral' : 'Tornar administrador geral'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {aba === 'vinculos' && (
              <div className="adm-grid">
              <div><button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal('vincular')}>Vincular a uma instituição</button></div>
              <Table
                rows={u.memberships}
                columns={[
                  { key: 'i', label: 'Instituição', render: (m) => <b>{m.institution.name}</b> },
                  { key: 'r', label: 'Papel', render: (m) => (
                    <select aria-label={`Papel em ${m.institution.name}`} value={m.role}
                      onChange={(e) => acao(() => adminApi.updateMember(m.institution.id, m.id, { role: e.target.value }), 'Papel atualizado.').catch((err) => toast(err.message))}>
                      <option value="professor">Professor(a)</option><option value="coordinator">Coordenação</option>
                    </select>
                  ) },
                  { key: 's', label: 'Vínculo', render: (m) => <Badge status={m.status} /> },
                  { key: 'a', label: '', render: (m) => (
                    <div className="adm-table__actions">
                      <button type="button" className="adm-btn adm-btn--sm" onClick={() => acao(() => adminApi.updateMember(m.institution.id, m.id, { status: m.status === 'active' ? 'inactive' : 'active' }), 'Vínculo atualizado.').catch((err) => toast(err.message))}>
                        {m.status === 'active' ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  ) },
                ]}
              />
              {!u.memberships.length && <p className="adm-empty">Sem vínculo com instituições: a pessoa não acessa conteúdos até ser vinculada e matriculada.</p>}
              </div>
            )}

            {aba === 'historico' && (
              <Async state={hist}>
                {(h) => (
                  <ul className="adm-list adm-activity">
                    {h.items.map((a) => (
                      <li key={a.id}>
                        <span>{descreverAcao(a.action)}{a.institution ? ` · ${a.institution.name}` : ''}{a.actor ? ` — por ${a.actor.name}` : ''}
                          {a.metadata?.justification && <><br /><small>Justificativa: {a.metadata.justification}</small></>}</span>
                        <time dateTime={a.createdAt}>{fmtDataHora(a.createdAt)}</time>
                      </li>
                    ))}
                    {!h.items.length && <li>Sem registros.</li>}
                  </ul>
                )}
              </Async>
            )}

            {modal === 'sessoes' && <Confirm title="Encerrar sessões" message={`${u.name} precisará entrar novamente em todos os dispositivos.`} onConfirm={() => acao(() => adminApi.revokeSessions(id), 'Sessões encerradas.')} onClose={() => setModal(null)} />}
            {modal === 'desativar' && <Confirm title="Desativar conta" message="A pessoa perde o acesso imediatamente (todas as sessões são encerradas). Matrículas, progresso e certificados são preservados." danger confirmLabel="Desativar" onConfirm={() => acao(() => adminApi.updateUser(id, { status: 'disabled' }), 'Conta desativada.')} onClose={() => setModal(null)} />}
            {modal === 'reativar' && <Confirm title="Reativar conta" message="A pessoa poderá entrar novamente." onConfirm={() => acao(() => adminApi.updateUser(id, { status: 'active' }), 'Conta reativada.')} onClose={() => setModal(null)} />}
            {modal === 'vincular' && <VincularModal user={u} institutions={institutions} onClose={() => setModal(null)} onDone={recarregar} />}
            {modal === 'papel' && <PapelGlobal usuario={u} onDone={recarregar} onClose={() => setModal(null)} />}
          </>
        )}
      </Async>
    </Modal>
  );
}

export default function AdminUsuarios() {
  const [f, setF] = useFilters({ page: '1' });
  const [convidar, setConvidar] = useState(false);
  const instituicoes = useInstitutionOptions();
  const state = useAsync(() => adminApi.users({ q: f.q, role: f.role, status: f.status, institutionId: f.institutionId, sort: f.sort, page: f.page, pageSize: 20 }),
    [f.q, f.role, f.status, f.institutionId, f.sort, f.page]);

  return (
    <>
      <PageHeader title="Usuários" description="Contas de professores, coordenadores e administradores."
        actions={<button type="button" className="adm-btn adm-btn--primary" onClick={() => setConvidar(true)}>+ Convidar</button>} />
      <Filters>
        <Field label="Buscar"><input type="search" defaultValue={f.q} placeholder="Nome ou e-mail" onKeyDown={(e) => e.key === 'Enter' && setF({ q: e.currentTarget.value })} onBlur={(e) => e.currentTarget.value !== (f.q ?? '') && setF({ q: e.currentTarget.value })} /></Field>
        <Field label="Papel">
          <select value={f.role ?? ''} onChange={(e) => setF({ role: e.target.value })}>
            <option value="">Todos</option><option value="professor">Professor(a)</option><option value="coordinator">Coordenação</option><option value="platform_admin">Administração geral</option>
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status ?? ''} onChange={(e) => setF({ status: e.target.value })}>
            <option value="">Todos</option><option value="active">Ativos</option><option value="disabled">Desativados</option>
          </select>
        </Field>
        <Field label="Instituição"><InstitutionSelect value={f.institutionId} onChange={(v) => setF({ institutionId: v })} options={instituicoes} /></Field>
        <Field label="Ordenar por">
          <select value={f.sort ?? ''} onChange={(e) => setF({ sort: e.target.value })}>
            <option value="">Cadastro mais recente</option><option value="name">Nome</option><option value="lastLoginAt">Último acesso</option>
          </select>
        </Field>
      </Filters>
      <Async state={state}>
        {(d) => (
          <Table
            caption="Usuários"
            rows={d.items}
            columns={[
              { key: 'n', label: 'Nome', render: (u) => <span className="adm-cell-main"><button type="button" className="adm-link-btn" onClick={() => setF({ id: u.id, page: f.page })}>{u.name}</button><small>{u.email}</small></span> },
              { key: 'v', label: 'Instituições', render: (u) => <MembershipBadges memberships={u.memberships} /> },
              { key: 'p', label: 'Papel global', render: (u) => (u.platformRoles.includes('platform_admin') ? <Badge status="platform_admin" tone="info" /> : '—') },
              { key: 's', label: 'Status', render: (u) => <Badge status={u.status} /> },
              { key: 'l', label: 'Último acesso', render: (u) => fmtDataHora(u.lastLoginAt) },
              { key: 'c', label: 'Cadastro', render: (u) => fmtData(u.createdAt) },
            ]}
            footer={<Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />}
          />
        )}
      </Async>
      {f.id && <UsuarioModal id={f.id} institutions={instituicoes} onClose={() => setF({ id: '', page: f.page })} onChanged={state.reload} />}
      {convidar && <InviteModal institutions={instituicoes} onClose={() => setConvidar(false)} />}
    </>
  );
}
