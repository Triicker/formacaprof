import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { adminApi } from '../adminApi';
import { Badge, Field, fmtData, Modal, Table } from '../ui';

const ESTADO = { active: 'Liberado', suspended: 'Suspenso', revoked: 'Revogado', expired: 'Expirado', none: 'Bloqueado' };
const ACAO = { active: 'Liberar', suspended: 'Suspender', revoked: 'Revogar' };

/** Alteração do direito: confirmação explícita, justificativa e aviso de impacto sobre matriculados. */
function AlterarAcesso({ institution, linha, status, onClose, onDone }) {
  const toast = useToast();
  const [expira, setExpira] = useState(linha.access?.expiresAt?.slice(0, 10) ?? '');
  const [just, setJust] = useState('');
  const [erro, setErro] = useState('');
  const afeta = status !== 'active' && linha.activeEnrollments > 0;
  async function enviar(e) {
    e.preventDefault();
    if (afeta && just.trim().length < 10) return setErro('Descreva o motivo (mínimo 10 caracteres).');
    try {
      await adminApi.setAccess(institution.id, linha.collection.id, {
        status,
        ...(status === 'active' ? { expiresAt: expira ? `${expira}T23:59:59` : null } : {}),
        ...(just.trim() ? { justification: just.trim() } : {}),
        ...(afeta ? { confirmImpact: true } : {}),
      });
      toast(`${ACAO[status]}: ${linha.collection.title}.`, 'success');
      onDone();
      onClose();
    } catch (err) { setErro(err.message); }
    return undefined;
  }
  return (
    <Modal title={`${ACAO[status]} “${linha.collection.title}”`} onClose={onClose}>
      <form className="adm-form" onSubmit={enviar}>
        <p style={{ margin: 0 }}>Instituição: <b>{institution.name}</b></p>
        {afeta && (
          <p className="adm-notice" style={{ margin: 0 }}>
            {linha.activeEnrollments} professor(es) matriculado(s) perderão o acesso imediatamente. Matrículas, progresso e certificados são preservados.
          </p>
        )}
        {status === 'active' && (
          <Field label="Válido até (opcional)" hint="Sem data: o direito vale até ser suspenso ou revogado.">
            <input type="date" value={expira} onChange={(e) => setExpira(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
          </Field>
        )}
        <Field label={afeta ? 'Justificativa (obrigatória)' : 'Justificativa (opcional)'} hint="Registrada na auditoria.">
          <textarea value={just} onChange={(e) => { setJust(e.target.value); setErro(''); }} maxLength={500} />
        </Field>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className={`adm-btn ${status === 'active' ? 'adm-btn--primary' : 'adm-btn--danger-solid'}`}>{ACAO[status]}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Direitos de uso de cada coleção pela instituição (somente o administrador geral altera). */
export function AcessosColecoes({ institution, onChanged }) {
  const [alterar, setAlterar] = useState(null);
  return (
    <section className="adm-card">
      <h2>Coleções da instituição</h2>
      <Table
        rowKey={(r) => r.collection.id}
        rows={institution.collectionAccess}
        columns={[
          { key: 'c', label: 'Coleção', render: (r) => <span className="adm-cell-main"><b>{r.collection.title}</b><small>{r.collection.status === 'published' ? 'Publicada' : 'Em preparação'}</small></span> },
          { key: 's', label: 'Direito', render: (r) => <Badge status={r.state}>{ESTADO[r.state]}</Badge> },
          { key: 'x', label: 'Validade', render: (r) => (r.access?.expiresAt ? `até ${fmtData(r.access.expiresAt)}` : '—') },
          { key: 'm', label: 'Matrículas ativas', num: true, render: (r) => r.activeEnrollments },
          { key: 'a', label: '', render: (r) => (
            <div className="adm-table__actions">
              {r.state !== 'active' && r.collection.status === 'published' && <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => setAlterar({ linha: r, status: 'active' })}>Liberar</button>}
              {r.state === 'active' && <button type="button" className="adm-btn adm-btn--sm" onClick={() => setAlterar({ linha: r, status: 'active' })}>Validade</button>}
              {r.state === 'active' && <button type="button" className="adm-btn adm-btn--sm" onClick={() => setAlterar({ linha: r, status: 'suspended' })}>Suspender</button>}
              {(r.state === 'active' || r.state === 'suspended' || r.state === 'expired') && <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setAlterar({ linha: r, status: 'revoked' })}>Revogar</button>}
            </div>
          ) },
        ]}
      />
      {alterar && <AlterarAcesso institution={institution} linha={alterar.linha} status={alterar.status} onClose={() => setAlterar(null)} onDone={onChanged} />}
    </section>
  );
}
