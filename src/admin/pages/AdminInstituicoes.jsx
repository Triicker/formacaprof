import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { adminApi } from '../adminApi';
import { Async, Badge, Field, Filters, Modal, PageHeader, Pager, Table, useAsync, useFilters } from '../ui';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

/** Formulário de criação/edição de instituição (usa POST/PATCH /institutions). */
export function InstitutionForm({ inicial, onClose, onSaved }) {
  const toast = useToast();
  const [orgs, setOrgs] = useState([]);
  const [f, setF] = useState({
    name: inicial?.name ?? '', organizationId: inicial?.organizationId ?? '', region: inicial?.region ?? '',
    city: inicial?.city ?? '', state: inicial?.state ?? '', externalId: inicial?.externalId ?? '',
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { adminApi.organizations().then(setOrgs).catch(() => {}); }, []);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setErro(''); };

  async function salvar(e) {
    e.preventDefault();
    if (f.name.trim().length < 3) return setErro('Informe o nome da instituição.');
    const dados = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim?.() ?? v]).filter(([, v]) => v !== ''));
    setSalvando(true);
    try {
      const r = inicial ? await adminApi.updateInstitution(inicial.id, dados) : await adminApi.createInstitution(dados);
      toast(inicial ? 'Instituição atualizada.' : 'Instituição criada.', 'success');
      onSaved(r);
      onClose();
    } catch (err) {
      setErro(err.message);
      setSalvando(false);
    }
  }

  return (
    <Modal title={inicial ? 'Editar instituição' : 'Nova instituição'} onClose={onClose}>
      <form className="adm-form" onSubmit={salvar}>
        <Field label="Nome"><input value={f.name} onChange={set('name')} autoFocus maxLength={160} /></Field>
        <Field label="Organização / rede" hint="Secretaria, rede de ensino ou mantenedora (opcional).">
          <select value={f.organizationId} onChange={set('organizationId')}>
            <option value="">Sem organização</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
        <div className="adm-form__row">
          <Field label="Região"><input value={f.region} onChange={set('region')} maxLength={80} /></Field>
          <Field label="Cidade"><input value={f.city} onChange={set('city')} maxLength={80} /></Field>
          <Field label="UF">
            <select value={f.state} onChange={set('state')}>
              <option value="">—</option>
              {UFS.map((u) => <option key={u}>{u}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Código externo" hint="Ex.: código INEP (opcional, único)."><input value={f.externalId} onChange={set('externalId')} maxLength={60} /></Field>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className="adm-btn adm-btn--primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminInstituicoes() {
  const [f, setF] = useFilters({ page: '1' });
  const [novo, setNovo] = useState(false);
  const [orgs, setOrgs] = useState([]);
  useEffect(() => { adminApi.organizations().then(setOrgs).catch(() => {}); }, []);
  const state = useAsync(() => adminApi.institutions({ q: f.q, status: f.status, organizationId: f.organizationId, page: f.page, pageSize: 20 }),
    [f.q, f.status, f.organizationId, f.page]);

  return (
    <>
      <PageHeader title="Instituições" description="Escolas e instituições atendidas pela plataforma."
        actions={<button type="button" className="adm-btn adm-btn--primary" onClick={() => setNovo(true)}>+ Nova instituição</button>} />
      <Filters>
        <Field label="Buscar"><input type="search" defaultValue={f.q} placeholder="Nome ou cidade" onKeyDown={(e) => e.key === 'Enter' && setF({ q: e.currentTarget.value })} onBlur={(e) => e.currentTarget.value !== (f.q ?? '') && setF({ q: e.currentTarget.value })} /></Field>
        <Field label="Status">
          <select value={f.status ?? ''} onChange={(e) => setF({ status: e.target.value })}>
            <option value="">Todos</option><option value="active">Ativas</option><option value="inactive">Inativas</option>
          </select>
        </Field>
        <Field label="Organização">
          <select value={f.organizationId ?? ''} onChange={(e) => setF({ organizationId: e.target.value })}>
            <option value="">Todas</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      </Filters>
      <Async state={state}>
        {(d) => (
          <Table
            caption="Instituições"
            rows={d.items}
            columns={[
              { key: 'name', label: 'Instituição', render: (i) => <span className="adm-cell-main"><Link to={`/admin/instituicoes/${i.id}`}><b>{i.name}</b></Link><small>{i.organization?.name ?? 'Sem organização'}</small></span> },
              { key: 'local', label: 'Local', render: (i) => [i.city, i.state].filter(Boolean).join('/') || '—' },
              { key: 'status', label: 'Status', render: (i) => <Badge status={i.status} /> },
              { key: 'coord', label: 'Coordenadores', num: true, render: (i) => i.counts.coordinators },
              { key: 'prof', label: 'Professores', num: true, render: (i) => i.counts.professors },
              { key: 'col', label: 'Coleções liberadas', num: true, render: (i) => i.counts.authorizedCollections },
            ]}
            footer={<Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />}
          />
        )}
      </Async>
      {novo && <InstitutionForm onClose={() => setNovo(false)} onSaved={state.reload} />}
    </>
  );
}
