import { useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { adminApi } from '../adminApi';
import { ExternalVideoForm, UploadArea } from '../media';
import { Async, Badge, Confirm, Field, Filters, fmtData, Modal, PageHeader, Pager, Table, useAsync, useFilters } from '../ui';

const kb = (b) => (b == null ? '—' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const TIPO = { image: 'Imagem', pdf: 'PDF', video: 'Vídeo' };

function EditarMidia({ m, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({ title: m.title, description: m.description ?? '', visibility: m.visibility });
  const [erro, setErro] = useState('');
  async function salvar(e) {
    e.preventDefault();
    try {
      await adminApi.updateMedia(m.id, f);
      toast('Mídia atualizada.', 'success');
      onSaved();
      onClose();
    } catch (err) { setErro(err.message); }
  }
  return (
    <Modal title="Editar mídia" onClose={onClose}>
      <form className="adm-form" onSubmit={salvar}>
        <Field label="Título"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} /></Field>
        <Field label="Descrição"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
        <Field label="Visibilidade" hint="Protegida: entregue só a quem pode ver uma aula que use o arquivo.">
          <select value={f.visibility} onChange={(e) => setF({ ...f, visibility: e.target.value })} disabled={m.storageProvider === 'static'}>
            <option value="public">Pública</option><option value="protected">Protegida</option>
          </select>
        </Field>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className="adm-btn adm-btn--primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

/** Substituição controlada: escolhe o novo arquivo (mesmo tipo) e envia com progresso. */
function Substituir({ m, onDone }) {
  const toast = useToast();
  const input = useRef(null);
  const [pct, setPct] = useState(null);
  async function enviar(file) {
    if (!file) return;
    setPct(0);
    try {
      await adminApi.replaceMedia(m.id, file, setPct);
      toast('Arquivo substituído (o anterior fica no histórico).', 'success');
      onDone();
    } catch (e) { toast(e.message); }
    setPct(null);
  }
  return (
    <>
      <button type="button" className="adm-btn adm-btn--sm" disabled={pct !== null} onClick={() => input.current.click()}>{pct !== null ? `${pct}%` : 'Substituir'}</button>
      <input ref={input} type="file" className="visually-hidden" tabIndex={-1} aria-hidden="true" onChange={(e) => enviar(e.target.files[0])}
        accept={m.kind === 'image' ? 'image/png,image/jpeg,image/webp' : m.kind === 'pdf' ? 'application/pdf' : 'video/mp4,video/webm'} />
    </>
  );
}

export default function AdminMidias() {
  const [f, setF] = useFilters({ page: '1' });
  const [modal, setModal] = useState(null);
  const state = useAsync(() => adminApi.media({ kind: f.kind, unused: f.unused, q: f.q, page: f.page, pageSize: 20 }), [f.kind, f.unused, f.q, f.page]);

  return (
    <>
      <PageHeader title="Biblioteca de mídia" description="Imagens, PDFs e vídeos usados nas coleções. O banco guarda só referências; os arquivos ficam no armazenamento." />
      <div className="adm-grid adm-grid--2">
        <section className="adm-card">
          <h2>Enviar imagem ou PDF</h2>
          <UploadArea onUploaded={state.reload} />
        </section>
        <section className="adm-card">
          <h2>Registrar vídeo externo</h2>
          <p className="adm-notice adm-notice--info" style={{ marginTop: 0 }}>
            Vídeos grandes não passam pela API. Use o link do arquivo hospedado (como os vídeos atuais) ou, futuramente, o upload direto ao armazenamento (R2).
          </p>
          <ExternalVideoForm onDone={state.reload} />
        </section>
      </div>
      <Filters>
        <Field label="Buscar"><input type="search" defaultValue={f.q} placeholder="Título ou nome do arquivo" onKeyDown={(e) => e.key === 'Enter' && setF({ q: e.currentTarget.value })} onBlur={(e) => e.currentTarget.value !== (f.q ?? '') && setF({ q: e.currentTarget.value })} /></Field>
        <Field label="Tipo">
          <select value={f.kind ?? ''} onChange={(e) => setF({ kind: e.target.value })}><option value="">Todos</option><option value="image">Imagens</option><option value="pdf">PDFs</option><option value="video">Vídeos</option></select>
        </Field>
        <Field label="Uso">
          <select value={f.unused ?? ''} onChange={(e) => setF({ unused: e.target.value })}><option value="">Todos</option><option value="true">Somente não utilizados</option></select>
        </Field>
      </Filters>
      <Async state={state}>
        {(d) => (
          <Table
            caption="Arquivos"
            rows={d.items}
            columns={[
              { key: 'p', label: 'Arquivo', render: (m) => (
                <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  {m.kind === 'image' ? <img className="adm-thumb" src={m.url} alt="" loading="lazy" /> : <span className="adm-thumb" style={{ display: 'grid', placeItems: 'center', fontWeight: 700 }}>{m.kind === 'pdf' ? 'PDF' : '▶'}</span>}
                  <span className="adm-cell-main"><b>{m.title}</b><small>{m.key ?? m.mimeType}</small></span>
                </span>
              ) },
              { key: 't', label: 'Tipo', render: (m) => TIPO[m.kind] },
              { key: 'v', label: 'Acesso', render: (m) => <Badge tone={m.visibility === 'public' ? 'neutral' : 'info'}>{m.visibility === 'public' ? 'Pública' : 'Protegida'}</Badge> },
              { key: 's', label: 'Tamanho', num: true, render: (m) => kb(m.fileSize) },
              { key: 'u', label: 'Em uso', num: true, render: (m) => (m.usageTotal ? `${m.usageTotal}×` : <Badge tone="warning">Não utilizado</Badge>) },
              { key: 'd', label: 'Enviado', render: (m) => fmtData(m.createdAt) },
              { key: 'a', label: '', render: (m) => (
                <div className="adm-table__actions">
                  <a className="adm-btn adm-btn--sm" href={m.url} target="_blank" rel="noreferrer">Abrir</a>
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'editar', m })}>Editar</button>
                  {m.storageProvider === 'local' && <Substituir m={m} onDone={state.reload} />}
                  {!m.usageTotal && <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'remover', m })}>Remover</button>}
                </div>
              ) },
            ]}
            footer={<Pager page={d.page} pages={d.pages} total={d.total} onPage={(p) => setF({ page: String(p) })} />}
          />
        )}
      </Async>
      {modal?.tipo === 'editar' && <EditarMidia m={modal.m} onClose={() => setModal(null)} onSaved={state.reload} />}
      {modal?.tipo === 'remover' && <Confirm title="Remover arquivo" message={`“${modal.m.title}” não está em uso e sairá da biblioteca.`} danger confirmLabel="Remover" onConfirm={() => adminApi.deleteMedia(modal.m.id).then(state.reload)} onClose={() => setModal(null)} />}
    </>
  );
}
