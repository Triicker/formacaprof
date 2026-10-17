import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';

/*
 * Tutorial guiado (coach marks): escurece a tela, destaca um elemento e explica o que ele faz.
 * Aparece uma vez por pessoa e por tela (registro no navegador). "Ver tutorial novamente", no menu,
 * dispara o evento REINICIAR e a tela aberta mostra o tutorial de novo.
 *
 * steps: [{ alvo: '.seletor' | ['.desktop', '.mobile'], titulo, texto }] — o primeiro alvo VISÍVEL é usado;
 * passos sem alvo visível são pulados (ex.: botão "Continuar" quando ainda não há progresso).
 */
export const REINICIAR_TUTORIAL = 'formacaprof:tutorial-reiniciar';
const PREFIXO = 'formacaprof:tutorial:';
const MARGEM = 16;

const chave = (id, userId) => `${PREFIXO}${id}:${userId}`;
const jaViu = (id, userId) => { try { return localStorage.getItem(chave(id, userId)) === '1'; } catch { return true; } };
const marcarVisto = (id, userId) => { try { localStorage.setItem(chave(id, userId), '1'); } catch { /* sem armazenamento: só não lembra */ } };

/** Esquece os tutoriais vistos por esta pessoa e avisa a tela atual. Devolve false se a tela não tem tutorial. */
export function reiniciarTutoriais(userId) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(PREFIXO) && k.endsWith(`:${userId}`)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignora */ }
  const evento = new CustomEvent(REINICIAR_TUTORIAL, { detail: { atendido: false } });
  window.dispatchEvent(evento);
  return evento.detail.atendido;
}

function visivel(el) {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
}
function acharAlvo(alvo) {
  for (const sel of [].concat(alvo)) {
    const el = [...document.querySelectorAll(sel)].find(visivel);
    if (el) return el;
  }
  return null;
}

export default function Tour({ id, steps, pronto = true }) {
  const { user } = useAuth();
  const [ativo, setAtivo] = useState(false);
  const [passos, setPassos] = useState([]);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState(null);
  const balao = useRef(null);
  const anterior = useRef(null);

  const iniciar = useCallback(() => {
    // Só os passos cujo alvo está na tela agora (desktop e celular mostram elementos diferentes).
    const validos = steps.filter((s) => acharAlvo(s.alvo));
    if (!validos.length) return;
    anterior.current = document.activeElement;
    setPassos(validos);
    setI(0);
    setAtivo(true);
  }, [steps]);

  // Primeira visita: espera o conteúdo carregar e a tela assentar.
  useEffect(() => {
    if (!pronto || !user || !user.viuBoasVindas || jaViu(id, user.id)) return undefined;
    const t = setTimeout(iniciar, 700);
    return () => clearTimeout(t);
  }, [pronto, user, id, iniciar]);

  useEffect(() => {
    const reiniciar = (e) => { e.detail.atendido = true; setTimeout(iniciar, 200); };
    window.addEventListener(REINICIAR_TUTORIAL, reiniciar);
    return () => window.removeEventListener(REINICIAR_TUTORIAL, reiniciar);
  }, [iniciar]);

  const encerrar = useCallback(() => {
    setAtivo(false);
    if (user) marcarVisto(id, user.id);
    anterior.current?.focus?.();
  }, [id, user]);

  const passo = ativo ? passos[i] : null;

  // Mede o alvo (e acompanha rolagem e redimensionamento).
  useLayoutEffect(() => {
    if (!passo) return undefined;
    const el = acharAlvo(passo.alvo);
    if (!el) { setRect(null); return undefined; }
    // Alvo mais alto que meia tela (ex.: a grade de coleções no celular): mostra o começo dele e
    // deixa a outra metade da tela para o balão.
    const grande = () => el.getBoundingClientRect().height > window.innerHeight * 0.5;
    el.scrollIntoView({ block: grande() ? 'start' : 'center', behavior: 'smooth' });
    const medir = () => {
      const r = el.getBoundingClientRect();
      if (!grande()) return setRect(r);
      const y0 = Math.max(r.top, MARGEM);
      return setRect({ left: r.left, top: y0, width: r.width, height: Math.min(r.bottom, y0 + window.innerHeight * 0.42) - y0, bottom: Math.min(r.bottom, y0 + window.innerHeight * 0.42) });
    };
    medir();
    const t = setTimeout(medir, 350);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => { clearTimeout(t); window.removeEventListener('resize', medir); window.removeEventListener('scroll', medir, true); };
  }, [passo]);

  // Posiciona o balão abaixo do alvo; sem espaço, acima.
  useLayoutEffect(() => {
    if (!rect || !balao.current) return;
    const b = balao.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const abaixo = rect.bottom + 12 + b.height + MARGEM <= vh || rect.top - 12 - b.height < MARGEM;
    const y = abaixo ? Math.min(rect.bottom + 12, vh - b.height - MARGEM) : rect.top - 12 - b.height;
    const x = Math.min(Math.max(rect.left + rect.width / 2 - b.width / 2, MARGEM), vw - b.width - MARGEM);
    setPos({ x, y: Math.max(MARGEM, y), abaixo });
  }, [rect, i]);

  useEffect(() => { if (passo) balao.current?.querySelector('.tour__next')?.focus(); }, [passo]);

  useEffect(() => {
    if (!ativo) return undefined;
    const tecla = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); encerrar(); }
      else if (e.key === 'ArrowRight') setI((n) => (n < passos.length - 1 ? n + 1 : n));
      else if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
      else if (e.key === 'Tab') {
        // Mantém o foco dentro do balão.
        const f = [...(balao.current?.querySelectorAll('button') ?? [])];
        if (!f.length) return;
        const idx = f.indexOf(document.activeElement);
        e.preventDefault();
        f.at((idx + (e.shiftKey ? -1 : 1) + f.length) % f.length).focus();
      }
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [ativo, passos.length, encerrar]);

  if (!passo) return null;
  const ultimo = i === passos.length - 1;
  const pad = 8;

  return createPortal(
    <div className="tour" aria-live="polite">
      <div className="tour__blocker" onClick={(e) => e.stopPropagation()} />
      {rect && (
        <div className="tour__spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      )}
      <div ref={balao} className="tour__balao" role="dialog" aria-modal="true" aria-labelledby="tour-titulo" aria-describedby="tour-texto"
        style={pos ? { left: pos.x, top: pos.y } : { visibility: 'hidden' }}>
        <button type="button" className="tour__fechar" onClick={encerrar} aria-label="Fechar tutorial">×</button>
        <p className="tour__passo">
          <svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: pos && !pos.abaixo ? 'rotate(180deg)' : undefined }}><path d="M12 4l7 7-1.4 1.4L13 7.8V20h-2V7.8l-4.6 4.6L5 11z" /></svg>
          Passo {i + 1} de {passos.length}
        </p>
        <h2 className="tour__titulo" id="tour-titulo">{passo.titulo}</h2>
        <p className="tour__texto" id="tour-texto">{passo.texto}</p>
        <div className="tour__acoes">
          <button type="button" className="tour__pular" onClick={encerrar}>Pular tutorial</button>
          <span>
            {i > 0 && <button type="button" className="tour__voltar" onClick={() => setI(i - 1)}>Voltar</button>}
            <button type="button" className="tour__next" onClick={() => (ultimo ? encerrar() : setI(i + 1))}>{ultimo ? 'Concluir' : 'Próximo'}</button>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
