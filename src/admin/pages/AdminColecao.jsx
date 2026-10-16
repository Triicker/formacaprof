import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { adminApi, comConfirmacaoDeImpacto } from '../adminApi';
import { MediaPicker, useImpactConfirm } from '../media';
import { Async, Badge, Confirm, Field, Modal, PageHeader, Tabs, useAsync } from '../ui';

const STATUS_OPCOES = [['draft', 'Rascunho'], ['published', 'Publicado'], ['archived', 'Arquivado']];
const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '—');
const tipoMidia = (t) => (t === 'video' ? 'video' : t === 'document' ? 'pdf' : null);

/** Campo de escolha de mídia com pré-visualização. */
function CampoMidia({ label, kind, valor, titulo, url, onChange }) {
  const [abrir, setAbrir] = useState(false);
  return (
    <div className="adm-field">
      <span>{label}</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {valor && kind === 'image' && url && <img className="adm-thumb" src={url} alt="" />}
        <span style={{ flex: '1 1 160px', fontSize: '.88rem' }}>{valor ? (titulo || 'Arquivo selecionado') : 'Nenhum arquivo'}</span>
        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setAbrir(true)}>{valor ? 'Trocar' : 'Escolher'}</button>
        {valor && <button type="button" className="adm-btn adm-btn--sm" onClick={() => onChange(null)}>Remover</button>}
      </div>
      {abrir && <MediaPicker kind={kind} onClose={() => setAbrir(false)} onPick={(m) => { onChange(m); setAbrir(false); }} />}
    </div>
  );
}

function DadosColecao({ col, onSaved, confirmar }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: col.title, slug: col.slug, subtitle: col.subtitle ?? '', description: col.description ?? '', displayOrder: col.displayOrder,
    layout: col.theme.layout ?? 'padrao', institutoUrl: col.theme.institutoUrl ?? '',
    cover: col.coverAssetId ? { id: col.coverAssetId, url: col.coverUrl, title: 'Capa atual' } : null,
    thumb: col.thumbnailAssetId ? { id: col.thumbnailAssetId, url: col.thumbnailUrl, title: 'Miniatura atual' } : null,
  });
  const [erro, setErro] = useState('');
  async function salvar(e) {
    e.preventDefault();
    setErro('');
    const dados = {
      title: f.title, subtitle: f.subtitle, description: f.description, displayOrder: Number(f.displayOrder), layout: f.layout,
      institutoUrl: f.institutoUrl || null, coverAssetId: f.cover?.id ?? null, thumbnailAssetId: f.thumb?.id ?? null,
      ...(f.slug !== col.slug ? { slug: f.slug } : {}),
    };
    try {
      const r = await comConfirmacaoDeImpacto((extra) => adminApi.updateCollection(col.id, { ...dados, ...extra }), confirmar);
      if (!r) return;
      toast('Coleção salva.', 'success');
      onSaved();
    } catch (err) { setErro(err.message); }
  }
  const publicada = col.status !== 'draft';
  return (
    <form className="adm-card adm-form" onSubmit={salvar}>
      <div className="adm-form__row">
        <Field label="Título"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} /></Field>
        <Field label="Slug (endereço)" hint={publicada ? 'Não muda depois de publicada (links compartilhados).' : 'Ex.: paz-nas-escolas'}>
          <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} disabled={publicada} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
        </Field>
      </div>
      <div className="adm-form__row">
        <Field label="Subtítulo"><input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} maxLength={200} /></Field>
        <Field label="Ordem de exibição" hint="Menor aparece primeiro."><input type="number" min={0} value={f.displayOrder} onChange={(e) => setF({ ...f, displayOrder: e.target.value })} /></Field>
        <Field label="Tema visual">
          <select value={f.layout} onChange={(e) => setF({ ...f, layout: e.target.value })}><option value="padrao">Padrão (em preparação)</option><option value="basta">BASTA!</option></select>
        </Field>
      </div>
      <Field label="Descrição"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={4000} /></Field>
      <Field label="Link do instituto/parceiro (opcional, https)"><input type="url" value={f.institutoUrl} onChange={(e) => setF({ ...f, institutoUrl: e.target.value })} /></Field>
      <div className="adm-form__row">
        <CampoMidia label="Capa (card da coleção)" kind="image" valor={f.cover?.id} titulo={f.cover?.title} url={f.cover?.url} onChange={(m) => setF({ ...f, cover: m })} />
        <CampoMidia label="Miniatura" kind="image" valor={f.thumb?.id} titulo={f.thumb?.title} url={f.thumb?.url} onChange={(m) => setF({ ...f, thumb: m })} />
      </div>
      {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
      <div><button className="adm-btn adm-btn--primary">Salvar dados</button></div>
    </form>
  );
}

function ModuloForm({ col, modulo, onClose, onSaved, confirmar }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: modulo?.title ?? '', slug: modulo?.slug ?? '', subtitle: modulo?.subtitle ?? '', description: modulo?.description ?? '',
    kind: modulo?.kind ?? 'curriculum', status: modulo?.status ?? 'draft',
    cover: modulo?.coverAssetId ? { id: modulo.coverAssetId, url: modulo.coverUrl, title: 'Capa atual' } : null,
  });
  const [erro, setErro] = useState('');
  async function salvar(e) {
    e.preventDefault();
    const d = { title: f.title, subtitle: f.subtitle, description: f.description, kind: f.kind, status: f.status, coverAssetId: f.cover?.id ?? null, ...(f.slug && f.slug !== modulo?.slug ? { slug: f.slug } : {}) };
    try {
      const r = await comConfirmacaoDeImpacto((x) => (modulo ? adminApi.updateModule(modulo.id, { ...d, ...x }) : adminApi.createModule(col.id, { ...d, ...x })), confirmar);
      if (!r) return;
      toast('Módulo salvo.', 'success');
      onSaved();
      onClose();
    } catch (err) { setErro(err.message); }
  }
  return (
    <Modal title={modulo ? 'Editar módulo' : 'Novo módulo'} onClose={onClose}>
      <form className="adm-form" onSubmit={salvar}>
        <Field label="Título"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} autoFocus /></Field>
        <div className="adm-form__row">
          <Field label="Slug" hint="Opcional; usado no endereço."><input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} pattern="[a-z0-9]+(-[a-z0-9]+)*" /></Field>
          <Field label="Tipo">
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="curriculum">Formativo (materiais)</option><option value="presentation">Apresentação (conheça o projeto)</option></select>
          </Field>
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUS_OPCOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        </div>
        <Field label="Subtítulo"><input value={f.subtitle} onChange={(e) => setF({ ...f, subtitle: e.target.value })} maxLength={200} /></Field>
        <Field label="Descrição"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <CampoMidia label="Capa do módulo (livro)" kind="image" valor={f.cover?.id} titulo={f.cover?.title} url={f.cover?.url} onChange={(m) => setF({ ...f, cover: m })} />
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className="adm-btn adm-btn--primary">Salvar</button>
        </div>
      </form>
    </Modal>
  );
}

function AulaForm({ col, modulo, aula, onClose, onSaved, confirmar }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: aula?.title ?? '', slug: aula?.slug ?? '', description: aula?.description ?? '', lessonType: aula?.lessonType ?? 'video',
    media: aula?.mediaAssetId ? { id: aula.mediaAssetId, title: aula.mediaTitle } : null,
    thumb: aula?.thumbnailAssetId ? { id: aula.thumbnailAssetId, url: aula.thumbnailUrl, title: 'Miniatura atual' } : null,
    durationSeconds: aula?.durationSeconds ?? '', requiredForCompletion: aula?.requiredForCompletion ?? true,
    provisional: aula?.provisional ?? false, status: aula?.status ?? 'draft', moduleId: modulo.id,
  });
  const [erro, setErro] = useState('');
  async function salvar(e) {
    e.preventDefault();
    const d = {
      title: f.title, description: f.description, lessonType: f.lessonType, mediaAssetId: f.media?.id ?? null, thumbnailAssetId: f.thumb?.id ?? null,
      durationSeconds: f.durationSeconds ? Number(f.durationSeconds) : null, requiredForCompletion: f.requiredForCompletion,
      provisional: f.provisional, status: f.status,
      ...(f.slug && f.slug !== aula?.slug ? { slug: f.slug } : {}),
      ...(aula && f.moduleId !== modulo.id ? { moduleId: f.moduleId } : {}),
    };
    try {
      const r = await comConfirmacaoDeImpacto((x) => (aula ? adminApi.updateLesson(aula.id, { ...d, ...x }) : adminApi.createLesson(modulo.id, { ...d, ...x })), confirmar);
      if (!r) return;
      toast('Aula salva.', 'success');
      onSaved();
      onClose();
    } catch (err) { setErro(err.message); }
  }
  const km = tipoMidia(f.lessonType);
  return (
    <Modal title={aula ? 'Editar aula' : `Nova aula em “${modulo.title}”`} onClose={onClose} wide>
      <form className="adm-form" onSubmit={salvar}>
        <div className="adm-form__row">
          <Field label="Título"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} autoFocus /></Field>
          <Field label="Slug" hint={aula?.status === 'published' ? 'Não muda depois de publicada.' : 'Opcional; único na coleção.'}>
            <input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} disabled={aula?.status === 'published'} pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </Field>
        </div>
        <div className="adm-form__row">
          <Field label="Tipo de conteúdo">
            <select value={f.lessonType} onChange={(e) => setF({ ...f, lessonType: e.target.value, media: null })}>
              <option value="video">Vídeo</option><option value="document">Documento (PDF)</option><option value="reading">Leitura</option><option value="activity">Atividade</option>
            </select>
          </Field>
          <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUS_OPCOES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          <Field label="Duração (segundos)"><input type="number" min={1} value={f.durationSeconds} onChange={(e) => setF({ ...f, durationSeconds: e.target.value })} /></Field>
          {aula && (
            <Field label="Módulo">
              <select value={f.moduleId} onChange={(e) => setF({ ...f, moduleId: e.target.value })}>{col.modules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
            </Field>
          )}
        </div>
        <Field label="Descrição"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="adm-form__row">
          {km && <CampoMidia label={km === 'video' ? 'Vídeo' : 'Documento (PDF)'} kind={km} valor={f.media?.id} titulo={f.media?.title} onChange={(m) => setF({ ...f, media: m, durationSeconds: f.durationSeconds || '' })} />}
          <CampoMidia label="Miniatura" kind="image" valor={f.thumb?.id} titulo={f.thumb?.title} url={f.thumb?.url} onChange={(m) => setF({ ...f, thumb: m })} />
        </div>
        <div className="adm-form__row">
          <label className="adm-check"><input type="checkbox" checked={f.requiredForCompletion} onChange={(e) => setF({ ...f, requiredForCompletion: e.target.checked })} /> Obrigatória para a conclusão</label>
          <label className="adm-check"><input type="checkbox" checked={f.provisional} onChange={(e) => setF({ ...f, provisional: e.target.checked })} /> Conteúdo provisório (sem validação editorial)</label>
        </div>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onClose}>Cancelar</button>
          <button className="adm-btn adm-btn--primary">Salvar aula</button>
        </div>
      </form>
    </Modal>
  );
}

const mover = (lista, i, d) => {
  const ids = lista.map((x) => x.id);
  [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
  return ids;
};

function Conteudo({ col, recarregar, confirmar }) {
  const toast = useToast();
  const [modal, setModal] = useState(null);
  const acao = (fn, msg) => fn().then(() => { toast(msg, 'success'); recarregar(); }).catch((e) => toast(e.message));
  return (
    <section className="adm-card">
      <div className="adm-card__head">
        <h2>Módulos e aulas</h2>
        <button type="button" className="adm-btn adm-btn--primary" onClick={() => setModal({ tipo: 'modulo' })}>+ Novo módulo</button>
      </div>
      {!col.modules.length && <p className="adm-empty">Nenhum módulo ainda.</p>}
      {col.modules.map((m, mi) => (
        <div className="adm-module" key={m.id}>
          <div className="adm-module__head">
            <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="adm-order">
                <button type="button" aria-label={`Subir módulo ${m.title}`} disabled={mi === 0} onClick={() => acao(() => adminApi.reorderModules(col.id, mover(col.modules, mi, -1)), 'Ordem atualizada.')}>↑</button>
                <button type="button" aria-label={`Descer módulo ${m.title}`} disabled={mi === col.modules.length - 1} onClick={() => acao(() => adminApi.reorderModules(col.id, mover(col.modules, mi, 1)), 'Ordem atualizada.')}>↓</button>
              </span>
              <b>{m.title}</b>
              <Badge status={m.kind} tone="neutral" />
              <Badge status={m.status} />
            </span>
            <span className="adm-header__actions">
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'aula', modulo: m })}>+ Aula</button>
              <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'modulo', modulo: m })}>Editar</button>
              {!m.lessons.length && <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'excluirModulo', modulo: m })}>Excluir</button>}
            </span>
          </div>
          <ul className="adm-lessons">
            {m.lessons.map((l, li) => (
              <li key={l.id}>
                <span className="adm-order">
                  <button type="button" aria-label={`Subir aula ${l.title}`} disabled={li === 0} onClick={() => acao(() => adminApi.reorderLessons(m.id, mover(m.lessons, li, -1)), 'Ordem atualizada.')}>↑</button>
                  <button type="button" aria-label={`Descer aula ${l.title}`} disabled={li === m.lessons.length - 1} onClick={() => acao(() => adminApi.reorderLessons(m.id, mover(m.lessons, li, 1)), 'Ordem atualizada.')}>↓</button>
                </span>
                <span className="adm-lessons__title adm-cell-main">
                  <b>{l.title}</b>
                  <small>/{l.slug} · {fmtDur(l.durationSeconds)} · {l.mediaTitle ?? (l.mediaUrl ? 'mídia vinculada' : 'sem mídia')}</small>
                </span>
                <Badge status={l.lessonType} tone="neutral" />
                <Badge tone={l.requiredForCompletion ? 'info' : 'neutral'}>{l.requiredForCompletion ? 'Obrigatória' : 'Complementar'}</Badge>
                {l.provisional && <Badge tone="warning">Provisório</Badge>}
                <Badge status={l.status} />
                <span className="adm-header__actions">
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => setModal({ tipo: 'aula', modulo: m, aula: l })}>Editar</button>
                  {l.progressRecords === 0
                    ? <button type="button" className="adm-btn adm-btn--sm adm-btn--danger" onClick={() => setModal({ tipo: 'excluirAula', aula: l })}>Excluir</button>
                    : l.status !== 'archived' && <button type="button" className="adm-btn adm-btn--sm" title="Tem histórico de progresso: arquivar em vez de excluir"
                      onClick={() => comConfirmacaoDeImpacto((x) => adminApi.updateLesson(l.id, { status: 'archived', ...x }), confirmar).then((r) => { if (r) { toast('Aula arquivada (histórico preservado).', 'success'); recarregar(); } }).catch((e) => toast(e.message))}>Arquivar</button>}
                </span>
              </li>
            ))}
            {!m.lessons.length && <li><span className="adm-empty" style={{ padding: 0 }}>Sem aulas.</span></li>}
          </ul>
        </div>
      ))}
      {modal?.tipo === 'modulo' && <ModuloForm col={col} modulo={modal.modulo} onClose={() => setModal(null)} onSaved={recarregar} confirmar={confirmar} />}
      {modal?.tipo === 'aula' && <AulaForm col={col} modulo={modal.modulo} aula={modal.aula} onClose={() => setModal(null)} onSaved={recarregar} confirmar={confirmar} />}
      {modal?.tipo === 'excluirModulo' && <Confirm title="Excluir módulo" message={`O módulo “${modal.modulo.title}” está vazio e será excluído.`} danger confirmLabel="Excluir" onConfirm={() => adminApi.deleteModule(modal.modulo.id).then(recarregar)} onClose={() => setModal(null)} />}
      {modal?.tipo === 'excluirAula' && <Confirm title="Excluir aula" message={`A aula “${modal.aula.title}” não tem histórico de progresso e será excluída.`} danger confirmLabel="Excluir" onConfirm={() => adminApi.deleteLesson(modal.aula.id).then(recarregar)} onClose={() => setModal(null)} />}
    </section>
  );
}

export default function AdminColecao() {
  const { id } = useParams();
  const toast = useToast();
  const [aba, setAba] = useState('conteudo');
  const [dialogo, confirmar] = useImpactConfirm();
  const state = useAsync(() => adminApi.collection(id), [id]);

  async function mudarStatus(status) {
    try {
      const r = await comConfirmacaoDeImpacto((x) => adminApi.updateCollection(id, { status, ...x }), confirmar);
      if (r) { toast(status === 'published' ? 'Coleção publicada.' : 'Status atualizado.', 'success'); state.reload(); }
    } catch (e) { toast(e.message); }
  }

  return (
    <Async state={state}>
      {(col) => (
        <>
          <PageHeader
            breadcrumb={<Link to="/admin/colecoes">Coleções</Link>}
            title={col.title}
            description={`/${col.slug} · ${col.impact.institutionsWithAccess} instituição(ões) liberada(s) · ${col.impact.activeEnrollments} matrícula(s) ativa(s) · ${col.impact.certificates} certificado(s)`}
            actions={(
              <>
                <Badge status={col.status} />
                <Link className="adm-btn" to={`/admin/colecoes/${id}/previa`}>Visualizar prévia</Link>
                {col.status !== 'published' && <button type="button" className="adm-btn adm-btn--primary" onClick={() => mudarStatus('published')}>Publicar</button>}
                {col.status === 'published' && <button type="button" className="adm-btn" onClick={() => mudarStatus('draft')}>Despublicar</button>}
                {col.status !== 'archived' && <button type="button" className="adm-btn adm-btn--danger" onClick={() => mudarStatus('archived')}>Arquivar</button>}
              </>
            )}
          />
          <Tabs value={aba} onChange={setAba} tabs={[{ value: 'conteudo', label: 'Módulos e aulas' }, { value: 'dados', label: 'Dados e tema' }]} />
          {aba === 'conteudo' ? <Conteudo col={col} recarregar={state.reload} confirmar={confirmar} /> : <DadosColecao col={col} onSaved={state.reload} confirmar={confirmar} />}
          {dialogo}
        </>
      )}
    </Async>
  );
}
