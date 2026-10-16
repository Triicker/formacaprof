import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { adminApi } from './adminApi';
import { Badge, Field, Loading, Modal } from './ui';

/** Lista de instituições para filtros/seleções (as 100 primeiras por nome). */
export function useInstitutionOptions() {
  const [opts, setOpts] = useState([]);
  useEffect(() => {
    adminApi.institutions({ pageSize: 100, sort: 'name' }).then((r) => setOpts(r.items)).catch(() => setOpts([]));
  }, []);
  return opts;
}

export function InstitutionSelect({ value, onChange, options, allLabel = 'Todas', required }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required}>
      {!required && <option value="">{allLabel}</option>}
      {required && <option value="" disabled>Selecione…</option>}
      {options.map((i) => <option key={i.id} value={i.id}>{i.name}{i.status === 'inactive' ? ' (inativa)' : ''}</option>)}
    </select>
  );
}

/**
 * Convite por e-mail. Com `institutionId` fixo, só pede e-mail/papel; senão mostra o seletor de instituição.
 * `roles` limita os papéis oferecidos (o backend valida de novo).
 */
export function InviteModal({ institutionId, institutions, roles = ['professor', 'coordinator'], onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({ institutionId: institutionId ?? '', email: '', role: roles[0] });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErro(''); };

  async function enviar(e) {
    e.preventDefault();
    if (!form.institutionId) return setErro('Selecione a instituição.');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setErro('Informe um e-mail válido.');
    setEnviando(true);
    try {
      const r = await adminApi.invite(form.institutionId, { email: form.email, role: form.role });
      toast(r.emailSent ? `Convite enviado para ${r.email}.` : 'Convite criado, mas o e-mail não pôde ser enviado. Use "Reenviar".', r.emailSent ? 'success' : 'info');
      onDone?.(r);
      onClose();
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  }

  return (
    <Modal title="Convidar por e-mail" onClose={onClose}>
      <form className="adm-form" onSubmit={enviar}>
        {!institutionId && (
          <Field label="Instituição">
            <InstitutionSelect value={form.institutionId} onChange={(v) => setForm((f) => ({ ...f, institutionId: v }))} options={institutions ?? []} required />
          </Field>
        )}
        <Field label="E-mail"><input type="email" value={form.email} onChange={set('email')} autoFocus autoComplete="off" /></Field>
        {roles.length > 1 && (
          <Field label="Papel">
            <select value={form.role} onChange={set('role')}>
              {roles.map((r) => <option key={r} value={r}>{r === 'coordinator' ? 'Coordenação pedagógica' : 'Professor(a)'}</option>)}
            </select>
          </Field>
        )}
        <p className="adm-notice adm-notice--info" style={{ margin: 0 }}>A pessoa recebe um link pessoal, de uso único, para criar a senha. O link não aparece aqui.</p>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className="adm-btn adm-btn--primary" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar convite'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Busca um usuário já cadastrado (por nome ou e-mail) e devolve a escolha. */
export function UserPickerModal({ title = 'Escolher usuário', onPick, onClose }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    const t = setTimeout(() => adminApi.users({ q: q.trim(), pageSize: 10, status: 'active' }).then((r) => setRes(r.items)).catch(() => setRes([])), 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title={title} onClose={onClose}>
      <Field label="Buscar por nome ou e-mail" hint="Digite ao menos 2 caracteres.">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </Field>
      {q.trim().length >= 2 && !res && <Loading text="Buscando…" />}
      {res && (
        res.length ? (
          <ul className="adm-list">
            {res.map((u) => (
              <li key={u.id}>
                <span className="adm-cell-main"><b>{u.name}</b><small>{u.email}</small></span>
                <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => onPick(u)}>Escolher</button>
              </li>
            ))}
          </ul>
        ) : <p className="adm-empty">Nenhum usuário ativo encontrado. Use “Convidar por e-mail”.</p>
      )}
    </Modal>
  );
}

export function MembershipBadges({ memberships }) {
  if (!memberships?.length) return <span className="adm-badge adm-badge--neutral">Sem vínculo</span>;
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {memberships.map((m) => (
        <Badge key={m.id} tone={m.status === 'active' ? (m.role === 'coordinator' ? 'info' : 'neutral') : 'danger'}>
          {m.institution.name} · {m.role === 'coordinator' ? 'Coord.' : 'Prof.'}{m.status !== 'active' ? ' (inativo)' : ''}
        </Badge>
      ))}
    </span>
  );
}
