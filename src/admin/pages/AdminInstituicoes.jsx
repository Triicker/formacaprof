import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { adminApi } from '../adminApi';
import { carregarMunicipios, NOMES_UF, REGIOES, regiaoDaUf } from '../localidades';
import { Async, Badge, Field, Filters, Modal, PageHeader, Pager, Table, useAsync, useFilters } from '../ui';

/** Região → UF → cidade, sempre a partir das listas oficiais (evita grafias diferentes da mesma cidade). */
function Localidade({ f, setF }) {
  const [municipios, setMunicipios] = useState(null);
  const [erro, setErro] = useState(false);
  useEffect(() => { carregarMunicipios().then(setMunicipios).catch(() => setErro(true)); }, []);
  const cidades = f.state ? municipios?.[f.state] ?? [] : [];
  // Cidade gravada antes das listas (ex.: digitada à mão) continua visível até ser trocada.
  const cidadeFora = f.city && municipios && f.state && !cidades.includes(f.city);

  return (
    <div className="adm-form__row">
      <Field label="Região">
        <select value={f.region} onChange={(e) => setF((x) => ({ ...x, region: e.target.value, state: '', city: '' }))}>
          <option value="">Selecione…</option>
          {Object.keys(REGIOES).map((r) => <option key={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Estado">
        <select value={f.state} disabled={!f.region} onChange={(e) => setF((x) => ({ ...x, state: e.target.value, city: '' }))}>
          <option value="">{f.region ? 'Selecione…' : 'Escolha a região'}</option>
          {(REGIOES[f.region] ?? []).map((uf) => <option key={uf} value={uf}>{NOMES_UF[uf]} ({uf})</option>)}
        </select>
      </Field>
      <Field label="Cidade" error={erro ? 'Não foi possível carregar a lista de cidades.' : undefined}>
        <select value={f.city} disabled={!f.state || !municipios} onChange={(e) => setF((x) => ({ ...x, city: e.target.value }))}>
          <option value="">{!f.state ? 'Escolha o estado' : municipios ? 'Selecione…' : 'Carregando…'}</option>
          {cidadeFora && <option value={f.city}>{f.city} (não encontrada na lista)</option>}
          {cidades.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Field>
    </div>
  );
}

/** Formulário de criação/edição de instituição (usa POST/PATCH /institutions). */
export function InstitutionForm({ inicial, onClose, onSaved }) {
  const toast = useToast();
  const [orgs, setOrgs] = useState([]);
  const [f, setF] = useState({
    name: inicial?.name ?? '', organizationId: inicial?.organizationId ?? '',
    // Região antiga em texto livre é substituída pela região oficial da UF.
    region: REGIOES[inicial?.region] ? inicial.region : regiaoDaUf(inicial?.state),
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
        <Localidade f={f} setF={(fn) => { setF(fn); setErro(''); }} />
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
