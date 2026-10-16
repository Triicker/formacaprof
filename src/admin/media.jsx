import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { adminApi } from './adminApi';
import { Field, Loading, Modal } from './ui';

const ROTULO_IMPACTO = {
  institutionsWithAccess: (n) => `${n} instituição(ões) com acesso`,
  activeEnrollments: (n) => `${n} matrícula(s) ativa(s)`,
  completedEnrollments: (n) => `${n} formação(ões) concluída(s)`,
  certificates: (n) => `${n} certificado(s) emitido(s) — continuam válidos`,
};

/**
 * Diálogo de confirmação de impacto (para usar com comConfirmacaoDeImpacto).
 * Retorna [elemento, pedir]; `pedir(impacto, mensagem)` resolve com a justificativa ou null.
 */
export function useImpactConfirm() {
  const [pedido, setPedido] = useState(null);
  const pedir = (impacto, mensagem) => new Promise((resolve) => setPedido({ impacto, mensagem, resolve }));
  const fechar = (valor) => { pedido?.resolve(valor); setPedido(null); };
  const elemento = pedido && (
    <ImpactDialog impacto={pedido.impacto} mensagem={pedido.mensagem} onConfirm={(j) => fechar(j)} onCancel={() => fechar(null)} />
  );
  return [elemento, pedir];
}

function ImpactDialog({ impacto, mensagem, onConfirm, onCancel }) {
  const [j, setJ] = useState('');
  const [erro, setErro] = useState('');
  const itens = Object.entries(impacto).filter(([, v]) => v > 0);
  function enviar(e) {
    e.preventDefault();
    if (j.trim().length < 10) return setErro('Descreva o motivo (mínimo 10 caracteres).');
    return onConfirm(j.trim());
  }
  return (
    <Modal title="Confirmar alteração com impacto" onClose={onCancel}>
      <form className="adm-form" onSubmit={enviar}>
        <p className="adm-notice" style={{ margin: 0 }}>{mensagem}</p>
        {itens.length > 0 && <ul style={{ margin: 0, paddingLeft: 20 }}>{itens.map(([k, v]) => <li key={k}>{ROTULO_IMPACTO[k]?.(v) ?? `${k}: ${v}`}</li>)}</ul>}
        <p style={{ margin: 0, fontSize: '.88rem' }}>Progresso, matrículas e certificados existentes são preservados.</p>
        <Field label="Justificativa" hint="Registrada na auditoria.">
          <textarea value={j} onChange={(e) => { setJ(e.target.value); setErro(''); }} maxLength={500} autoFocus />
        </Field>
        {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <div className="adm-modal__foot">
          <button type="button" className="adm-btn" onClick={onCancel}>Cancelar</button>
          <button className="adm-btn adm-btn--danger-solid">Confirmar alteração</button>
        </div>
      </form>
    </Modal>
  );
}

const ACEITA = { image: 'image/png,image/jpeg,image/webp', pdf: 'application/pdf', any: 'image/png,image/jpeg,image/webp,application/pdf' };
const TIPOS_TEXTO = { image: 'PNG, JPG ou WEBP', pdf: 'PDF', any: 'PNG, JPG, WEBP ou PDF' };

/** Área de upload (arrastar/soltar ou escolher) com barra de progresso. */
export function UploadArea({ kind = 'any', onUploaded, compact }) {
  const toast = useToast();
  const [arquivo, setArquivo] = useState(null);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [visibilidade, setVisibilidade] = useState('');
  const [progresso, setProgresso] = useState(null);
  const [erro, setErro] = useState('');
  const [sobre, setSobre] = useState(false);
  const escolher = (f) => {
    if (!f) return;
    setArquivo(f);
    setTitulo((t) => t || f.name.replace(/\.[^.]+$/, ''));
    setErro('');
  };

  async function enviar() {
    setErro('');
    setProgresso(0);
    try {
      const r = await adminApi.uploadMedia(arquivo, { title: titulo, description: descricao, visibility: visibilidade }, setProgresso);
      toast('Arquivo enviado.', 'success');
      setArquivo(null);
      setTitulo('');
      setDescricao('');
      setProgresso(null);
      onUploaded?.(r);
    } catch (e) {
      setErro(e.message);
      setProgresso(null);
    }
  }

  return (
    <div className="adm-form">
      <label className={`adm-drop ${sobre ? 'adm-drop--over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setSobre(true); }} onDragLeave={() => setSobre(false)}
        onDrop={(e) => { e.preventDefault(); setSobre(false); escolher(e.dataTransfer.files[0]); }}>
        <b>{arquivo ? arquivo.name : 'Arraste um arquivo ou clique para escolher'}</b>
        <small>{TIPOS_TEXTO[kind]} · para vídeos use “Registrar vídeo externo”</small>
        <input type="file" accept={ACEITA[kind]} className="visually-hidden" onChange={(e) => escolher(e.target.files[0])} />
      </label>
      {arquivo && (
        <>
          <div className="adm-form__row">
            <Field label="Título"><input value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} /></Field>
            {!compact && (
              <Field label="Visibilidade" hint="Padrão: imagens públicas; PDFs protegidos.">
                <select value={visibilidade} onChange={(e) => setVisibilidade(e.target.value)}>
                  <option value="">Padrão</option>
                  <option value="public">Pública</option>
                  <option value="protected">Protegida (só quem tem acesso)</option>
                </select>
              </Field>
            )}
          </div>
          {!compact && <Field label="Descrição"><textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={1000} /></Field>}
          {progresso !== null && (
            <div className="adm-upload-bar" role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso do envio">
              <span style={{ width: `${progresso}%` }} />
            </div>
          )}
          {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
          <div className="adm-header__actions">
            <button type="button" className="adm-btn adm-btn--primary" onClick={enviar} disabled={progresso !== null}>
              {progresso !== null ? `Enviando… ${progresso}%` : 'Enviar arquivo'}
            </button>
            <button type="button" className="adm-btn" onClick={() => { setArquivo(null); setErro(''); }} disabled={progresso !== null}>Cancelar</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Vídeo hospedado fora (caso dos vídeos atuais). O link só chega a quem tem acesso, via /media/:id. */
export function ExternalVideoForm({ onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ externalUrl: '', title: '', durationSeconds: '' });
  const [erro, setErro] = useState('');
  async function enviar(e) {
    e.preventDefault();
    setErro('');
    try {
      const r = await adminApi.registerExternal({
        externalUrl: f.externalUrl, title: f.title, mimeType: 'video/mp4',
        ...(f.durationSeconds ? { durationSeconds: Number(f.durationSeconds) } : {}),
      });
      toast('Vídeo registrado.', 'success');
      setF({ externalUrl: '', title: '', durationSeconds: '' });
      onDone?.(r);
    } catch (err) {
      setErro(err.message);
    }
  }
  return (
    <form className="adm-form" onSubmit={enviar}>
      <div className="adm-form__row">
        <Field label="Endereço do vídeo (https)"><input type="url" value={f.externalUrl} onChange={(e) => setF({ ...f, externalUrl: e.target.value })} placeholder="https://…/video.mp4" required /></Field>
        <Field label="Título"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} /></Field>
        <Field label="Duração (segundos)"><input type="number" min={1} value={f.durationSeconds} onChange={(e) => setF({ ...f, durationSeconds: e.target.value })} /></Field>
      </div>
      {erro && <p className="adm-field__error" role="alert" style={{ margin: 0 }}>{erro}</p>}
      <div><button className="adm-btn adm-btn--primary">Registrar vídeo externo</button></div>
    </form>
  );
}

/** Seleciona uma mídia da biblioteca (ou envia/registra uma nova). `kind`: image | pdf | video. */
export function MediaPicker({ kind, onPick, onClose }) {
  const [q, setQ] = useState('');
  const [lista, setLista] = useState(null);
  useEffect(() => {
    const t = setTimeout(() => {
      adminApi.media({ kind, q: q || undefined, pageSize: 30 }).then((r) => setLista(r.items)).catch(() => setLista([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind]);
  const nome = kind === 'image' ? 'imagem' : kind === 'pdf' ? 'PDF' : 'vídeo';
  return (
    <Modal title={`Escolher ${nome}`} onClose={onClose} wide>
      <Field label="Buscar na biblioteca"><input value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></Field>
      {!lista ? <Loading /> : (
        <ul className="adm-list" style={{ maxHeight: 320, overflow: 'auto' }}>
          {lista.map((m) => (
            <li key={m.id}>
              <span style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                {m.kind === 'image'
                  ? <img className="adm-thumb" src={m.url} alt="" />
                  : <span className="adm-thumb" style={{ display: 'grid', placeItems: 'center' }}>{m.kind === 'pdf' ? 'PDF' : '▶'}</span>}
                <span className="adm-cell-main"><b>{m.title}</b><small>{m.mimeType} · usado {m.usageTotal}×</small></span>
              </span>
              <button type="button" className="adm-btn adm-btn--sm adm-btn--primary" onClick={() => onPick(m)}>Usar</button>
            </li>
          ))}
          {!lista.length && <li>Nenhum arquivo encontrado.</li>}
        </ul>
      )}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{kind === 'video' ? 'Registrar novo vídeo externo' : 'Enviar novo arquivo'}</summary>
        <div style={{ marginTop: 12 }}>
          {kind === 'video' ? <ExternalVideoForm onDone={onPick} /> : <UploadArea kind={kind} compact onUploaded={onPick} />}
        </div>
      </details>
    </Modal>
  );
}
