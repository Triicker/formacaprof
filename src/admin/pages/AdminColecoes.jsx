import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { adminApi } from '../adminApi';
import { Async, Badge, Field, fmtData, Modal, PageHeader, Table, useAsync } from '../ui';

function NovaColecao({ onClose }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: '', slug: '', subtitle: '', layout: 'padrao' });
  const [erro, setErro] = useState('');
  async function salvar(e) {
    e.preventDefault();
    try {
      const c = await adminApi.createCollection({ title: f.title, subtitle: f.subtitle || undefined, slug: f.slug || undefined, layout: f.layout });
      toast('Coleção criada como rascunho.', 'success');
      navigate(`/admin/colecoes/${c.id}`);
    } catch (err) { setErro(err.message); }
  }
  return (
    <Modal title="Nova coleção" onClose={onClose}>
      <form className="adm-form" onSubmit={salvar}>
        <Field label="Título"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} maxLength={200} autoFocus /></Field>
        <Field label="Slug (endereço)" hint="Opcional: gerado a partir do título. Ex.: paz-nas-escolas"><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></Field>
        <Field label="Subtítulo"><input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} maxLength={200} /></Field>
        <Field label="Tema visual" hint="“Padrão” fica em preparação para professores até ganhar layout próprio.">
          <select value={f.layout} onChange={(e) => setF({ ...f, layout: e.target.value })}><option value="padrao">Padrão</option><option value="basta">BASTA!</option></select>
        </Field>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className="adm-btn adm-btn--primary">Criar rascunho</button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminColecoes() {
  const [nova, setNova] = useState(false);
  const state = useAsync(() => adminApi.collections(), []);
  return (
    <>
      <PageHeader title="Coleções" description="Conteúdo oficial da plataforma. Só a administração geral edita; coordenadores apenas matriculam."
        actions={<button type="button" className="adm-btn adm-btn--primary" onClick={() => setNova(true)}>+ Nova coleção</button>} />
      <Async state={state}>
        {(lista) => (
          <Table
            caption="Coleções"
            rows={lista}
            columns={[
              { key: 'c', label: 'Coleção', render: (c) => (
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {c.coverUrl && <img className="adm-thumb" style={{ width: 80, height: 46 }} src={c.coverUrl} alt="" />}
                  <span className="adm-cell-main"><Link to={`/admin/colecoes/${c.id}`}><b>{c.title}</b></Link><small>/{c.slug}</small></span>
                </span>
              ) },
              { key: 's', label: 'Status', render: (c) => <Badge status={c.status} /> },
              { key: 'm', label: 'Módulos', num: true, render: (c) => c.modules },
              { key: 'i', label: 'Instituições liberadas', num: true, render: (c) => c.institutionsWithAccess },
              { key: 'e', label: 'Matrículas ativas', num: true, render: (c) => c.activeEnrollments },
              { key: 'u', label: 'Atualizada', render: (c) => fmtData(c.updatedAt) },
            ]}
          />
        )}
      </Async>
      {nova && <NovaColecao onClose={() => setNova(false)} />}
    </>
  );
}
