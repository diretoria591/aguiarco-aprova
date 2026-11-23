'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties,
  type ReactNode,
} from 'react';
import { Icon } from './icon';

/* ------------------------------------------------------------ toasts */
type ToastAction = { label: string; run: () => void };
type ToastItem = { id: number; msg: string; err: boolean; action?: ToastAction };
type ConfirmOpts = { title: ReactNode; text: ReactNode; okLabel?: string; danger?: boolean };
type UICtx = {
  toast: (msg: string, type?: 'err', action?: ToastAction) => void;
  confirm: (o: ConfirmOpts) => Promise<boolean>;
};
const Ctx = createContext<UICtx | null>(null);

export function useUI() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUI fora do UIProvider');
  return c;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [conf, setConf] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const seq = useRef(0);

  const toast = useCallback((msg: string, type?: 'err', action?: ToastAction) => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, err: type === 'err', action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 6000 : 3400);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOpts) => new Promise<boolean>((resolve) => setConf({ ...o, resolve })),
    [],
  );

  const closeConfirm = (v: boolean) => {
    conf?.resolve(v);
    setConf(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      {conf && (
        <Modal
          title={conf.title}
          onClose={() => closeConfirm(false)}
          foot={
            <>
              <button className="btn line" onClick={() => closeConfirm(false)}>Cancelar</button>
              <button className={`btn ${conf.danger ? 'danger' : ''}`} onClick={() => closeConfirm(true)}>
                {conf.okLabel || 'Confirmar'}
              </button>
            </>
          }
        >
          <p className="muted" style={{ margin: '4px 0 0' }}>{conf.text}</p>
        </Modal>
      )}
      {toasts.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast${t.err ? ' err' : ''}`}>
              {!t.err && <Icon name="check" style={{ width: 16, height: 16 }} />}
              <span>{t.msg}</span>
              {t.action && (
                <button className="undo" onClick={() => { t.action!.run(); setToasts((all) => all.filter((x) => x.id !== t.id)); }}>
                  {t.action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}

/* ------------------------------------------------------------ modal */
export function Modal({
  title, children, foot, wide, onClose, bodyStyle,
}: {
  title?: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  wide?: boolean;
  onClose: () => void;
  bodyStyle?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('input:not([type=file]):not([type=checkbox]),textarea');
    const t = setTimeout(() => first?.focus(), 60);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      clearTimeout(t);
    };
  }, []);

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" ref={ref}>
        {title !== undefined && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar"><Icon name="x" /></button>
          </div>
        )}
        <div className="modal-body" style={bodyStyle}>{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ lightbox + visualizador */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="lightbox" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src={src} />
      <button className="icon-btn" aria-label="Fechar"><Icon name="x" /></button>
    </div>
  );
}

export type ViewerFile = { url: string; mime: string; name: string };

/** Visualizador: imagens, vídeos (arquivo ou link), PDFs e carrosséis com swipe. */
export function Viewer({
  files, caption = '', ratio = '4 / 5', maxHeight, cover,
}: { files: ViewerFile[]; caption?: string; ratio?: string; maxHeight?: string; cover?: string | null }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [lb, setLb] = useState<string | null>(null);
  const many = files.length > 1;

  if (!files.length) {
    return (
      <div className="viewer" style={{ aspectRatio: 'auto' }}>
        <div className="textcard">{caption || 'Sem arquivos.'}</div>
      </div>
    );
  }

  const go = (d: number) => {
    const t = track.current;
    if (t) t.scrollBy({ left: d * t.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => {
    const t = track.current;
    if (!t) return;
    const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
    if (i !== index) {
      setIndex(i);
      t.querySelectorAll('video').forEach((v) => { if (!v.paused) v.pause(); });
    }
  };

  return (
    <div className="viewer" style={{ aspectRatio: ratio, maxHeight }}>
      <div className="track" ref={track} onScroll={many ? onScroll : undefined}>
        {files.map((f, i) => (
          <div className="slide" key={f.url + i}>
            {f.mime.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" alt={f.name} src={f.url} onClick={() => setLb(f.url)} />
            ) : f.mime.startsWith('video/') ? (
              <video controls playsInline preload="metadata" poster={cover ?? undefined}
                src={cover ? f.url : `${f.url}#t=0.1`} />
            ) : f.mime.startsWith('embed/') ? (
              <iframe
                className="embed"
                src={f.url}
                title={f.name || 'Vídeo'}
                loading="lazy"
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className="doc">
                <Icon name="doc" />
                <div>{f.name}</div>
                <a className="btn sm line" target="_blank" rel="noopener noreferrer" href={f.url}>Abrir arquivo</a>
              </div>
            )}
          </div>
        ))}
      </div>
      {many && (
        <>
          <button className="nav prev" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); go(-1); }}><Icon name="left" /></button>
          <button className="nav next" aria-label="Próximo" onClick={(e) => { e.stopPropagation(); go(1); }}><Icon name="right" /></button>
          <div className="count">{index + 1}/{files.length}</div>
          <div className="dots">{files.map((_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</div>
        </>
      )}
      {cover && (
        <button type="button" className="cover-btn" onClick={(e) => { e.stopPropagation(); setLb(cover); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" />Ver capa
        </button>
      )}
      {lb && <Lightbox src={lb} onClose={() => setLb(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------ marca */
export function Wordmark({ style, className = 'wm' }: { style?: CSSProperties; className?: string }) {
  return <span className={className} style={style}>Aguiar<b>&amp;co</b></span>;
}

/** Monograma do cliente: logo enviado ou iniciais. */
export function Mono({ name, logo, className = 'mono' }: { name: string; logo?: string | null; className?: string }) {
  const ini = String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div className={`${className}${logo ? ' has-img' : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo ? <img src={logo} alt={name} /> : ini}
    </div>
  );
}

/** Copia texto com fallback para navegadores sem Clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* cai no fallback */ }
  const t = document.createElement('textarea');
  t.value = text;
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove();
  return ok;
}
