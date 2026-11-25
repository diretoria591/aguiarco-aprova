'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { removeFiles, safePath, uploadFile } from '@/lib/upload';
import { MAX_UPLOAD_MB, TYPES } from '@/lib/constants';
import { COVER_PREFIX } from '@/lib/media';
import { driveRef, isVideoName, type ScanFile, type ScanPost, type ScanState } from '@/lib/scanner';
import type { Client, PostFormat } from '@/lib/types';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { errMsg, normalizeIg } from '@/components/admin/client-form';
import { useMe } from '@/components/admin/me';

type Media = { src: 'drive'; id: string; name: string } | { src: 'local'; file: File; name: string };
type Item = Omit<ScanPost, 'media' | 'cover'> & {
  media: Media[]; cover: Media | null; sel: boolean; keepLate: boolean; edited: boolean; pro: string;
};
type Step = 'link' | 'reading' | 'review' | 'importing' | 'done';
type Prog = { state: 'wait' | 'run' | 'ok' | 'err'; text: string };
type Swap = { key: string; target: 'media' | 'add' | 'cover'; idx?: number };

const LABEL: Record<ScanState, string> = { ok: 'Pronto', raw: 'Material bruto', fix: 'Em alteração', gone: 'Já foi', dup: 'Já está no Aprova' };
const COVER_FORMATS: PostFormat[] = ['reels', 'video'];
const MULTI: PostFormat[] = ['carrossel', 'stories'];
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** Mantém o começo do título ("Reels 04/12 · …") de acordo com a data e o formato. */
function retitle(it: Item, date: string, format: PostFormat): string {
  const old = `${TYPES[it.format].label} ${dm(it.date)}`;
  return it.title.startsWith(old) ? `${TYPES[format].label} ${dm(date)}${it.title.slice(old.length)}` : it.title;
}
const locked = (it: Item) => it.state === 'gone' || it.state === 'dup';
const fromScan = (f: ScanFile): Media => ({ src: 'drive', id: f.id, name: f.name });
const isVideo = (m: Media) => (m.src === 'local' ? m.file.type.startsWith('video/') : isVideoName(m.name));

function Thumb({ m, className = 'sc-thumb' }: { m: Media | null; className?: string }) {
  const local = m?.src === 'local' && m.file.type.startsWith('image/') ? m.file : null;
  const url = useMemo(() => (local ? URL.createObjectURL(local) : null), [local]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const [broken, setBroken] = useState(false);
  const src = url ?? (m?.src === 'drive' ? `https://drive.google.com/thumbnail?id=${m.id}&sz=w320` : null);
  return (
    <div className={className}>
      <Icon name={!m ? 'text' : isVideo(m) ? 'video' : 'image'} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src && !broken && <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />}
    </div>
  );
}

export function ScannerView({ client }: { client: Pick<Client, 'id' | 'name' | 'segment'> }) {
  const me = useMe();
  const { toast } = useUI();
  const [step, setStep] = useState<Step>('link');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [docTitle, setDocTitle] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [files, setFiles] = useState<ScanFile[]>([]);
  const [filter, setFilter] = useState<'all' | 'ok' | 'raw' | 'gone'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [snap, setSnap] = useState<Item | null>(null);
  const [swap, setSwap] = useState<Swap | null>(null);
  const [swapLink, setSwapLink] = useState('');
  const [checked, setChecked] = useState(false);
  const [prog, setProg] = useState<Record<string, Prog>>({});
  const today = todayIso();
  const beauty = client.segment === 'beleza';

  const isLate = (it: Item) => it.sel && it.date < today && !it.keepLate;
  const update = (key: string, fn: (it: Item) => Item, edited = true) =>
    setItems((cur) => cur.map((it) => (it.key === key ? { ...fn(it), ...(edited ? { edited: true } : {}) } : it)));

  async function read() {
    setError('');
    if (!/docs\.google\.com\/document\//.test(url)) { setError('Cole o link de um documento do Google Docs (docs.google.com/document/…).'); return; }
    setStep('reading');
    try {
      const res = await fetch('/api/scanner/ler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id, url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não consegui ler o calendário.');
      setDocTitle(data.title || 'Calendário');
      setFiles(data.files ?? []);
      setItems((data.posts as ScanPost[]).map((p) => ({
        ...p, media: p.media.map(fromScan), cover: p.cover ? fromScan(p.cover) : null,
        sel: p.state === 'ok', keepLate: false, edited: false, pro: '',
      })));
      setFilter('all'); setOpen(null); setSwap(null); setChecked(false);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui ler o calendário.');
      setStep('link');
    }
  }

  // ---------- importação ----------
  async function importOne(it: Item) {
    const supabase = createClient();
    const set = (state: Prog['state'], text: string) => setProg((p) => ({ ...p, [it.key]: { state, text } }));
    set('run', 'Criando o material…');
    const pro = normalizeIg(it.pro).slice(0, 80);
    const { data: post, error } = await supabase.from('posts')
      .insert({ client_id: client.id, title: it.title.trim() || `${TYPES[it.format].label} ${dm(it.date)}`, format: it.format, caption: it.caption, scheduled_date: it.date, created_by: me.id, ...(pro ? { featured_professional: pro } : {}) })
      .select('id').single();
    if (error) throw error;
    const rows: { post_id: string; file_url: string; storage_path: string | null; file_type: string; file_name: string; order_index: number }[] = [];
    const put = async (m: Media, index: number) => {
      if (m.src === 'local') {
        const path = safePath(`posts/${post.id}`, m.file, index);
        const fileUrl = await uploadFile(path, m.file);
        return { url: fileUrl, path, type: m.file.type, name: m.file.name };
      }
      const res = await fetch('/api/scanner/arquivo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId: post.id, driveId: m.id, index }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${m.name}: ${data.error || 'falha ao baixar do Drive.'}`);
      return data as { url: string; path: string; type: string; name: string };
    };
    try {
      for (let i = 0; i < it.media.length; i++) {
        set('run', `Baixando ${i + 1} de ${it.media.length}${it.cover ? ' (+ capa)' : ''}…`);
        const r = await put(it.media[i], i);
        rows.push({ post_id: post.id, file_url: r.url, storage_path: r.path, file_type: r.type, file_name: r.name, order_index: i });
      }
      if (it.cover && COVER_FORMATS.includes(it.format)) {
        set('run', 'Baixando a capa…');
        const r = await put(it.cover, 999);
        rows.push({ post_id: post.id, file_url: r.url, storage_path: r.path, file_type: `${COVER_PREFIX}${r.type}`, file_name: r.name, order_index: -1 });
      }
      if (rows.length) {
        const { error: e2 } = await supabase.from('post_media').insert(rows);
        if (e2) throw e2;
      }
    } catch (e) {
      await removeFiles(rows.map((r) => r.storage_path)).catch(() => {});
      await supabase.from('posts').delete().eq('id', post.id);
      throw e;
    }
    await supabase.from('activity_logs').insert({
      client_id: client.id, post_id: post.id, type: 'enviado', actor: me.name, action_text: `${me.name} enviou ${it.title} (scanner)`,
    });
    set('ok', 'Enviado para aprovação');
  }

  async function runImport() {
    const list = items.filter((it) => it.sel);
    setOpen(null); setSwap(null);
    setProg(Object.fromEntries(list.map((it) => [it.key, { state: 'wait', text: 'Na fila' } as Prog])));
    setStep('importing');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    for (const it of list) {
      try { await importOne(it); } catch (e) {
        setProg((p) => ({ ...p, [it.key]: { state: 'err', text: errMsg(e) } }));
      }
    }
    setStep('done');
  }

  // ---------- edição ----------
  function startEdit(it: Item) {
    if (open === it.key) { setOpen(null); setSnap(null); } else { setOpen(it.key); setSnap(it); }
    setSwap(null);
  }
  function applySwap(m: Media) {
    if (!swap) return;
    const { key, target, idx } = swap;
    update(key, (it) => {
      if (target === 'cover') return { ...it, cover: m, coverOptions: [] };
      if (target === 'add') return { ...it, media: [...it.media, m] };
      const media = it.media.slice(); media[idx ?? 0] = m; return { ...it, media };
    });
    setSwap(null); setSwapLink('');
  }
  function swapFromLink() {
    const r = driveRef(swapLink);
    if (!r || r.folder) { toast('Cole o link de um arquivo do Drive (não de uma pasta).', 'err'); return; }
    applySwap({ src: 'drive', id: r.id, name: 'Arquivo do Drive (link colado)' });
  }
  function swapFromFile(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (!/^(image|video)\//.test(f.type)) { toast(`“${f.name}” não é foto nem vídeo.`, 'err'); return; }
    if (swap?.target === 'cover' && !f.type.startsWith('image/')) { toast('A capa precisa ser uma imagem.', 'err'); return; }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) { toast(`“${f.name}” passa de ${MAX_UPLOAD_MB} MB.`, 'err'); return; }
    applySwap({ src: 'local', file: f, name: f.name });
  }

  const counts = useMemo(() => {
    const c = { ok: 0, raw: 0, gone: 0 };
    items.forEach((it) => { if (it.state === 'ok') c.ok++; else if (it.state === 'raw' || it.state === 'fix') c.raw++; else c.gone++; });
    return c;
  }, [items]);
  const shown = items.filter((it) => filter === 'all' || (filter === 'ok' ? it.state === 'ok' : filter === 'raw' ? (it.state === 'raw' || it.state === 'fix') : locked(it)));
  const selected = items.filter((it) => it.sel);
  const lateN = selected.filter(isLate).length;
  const emptyN = selected.filter((it) => !it.media.length && !it.caption.trim()).length;
  const canSend = selected.length > 0 && !lateN && !emptyN && checked;
  const sendLabel = !selected.length ? 'Marque pelo menos um post' : lateN ? 'Resolva as datas' : emptyN ? 'Tem post sem arquivo e sem texto' : !checked ? 'Confirme que conferiu' : `Enviar ${selected.length} para aprovação`;

  function swapPanel() {
    if (!swap) return null;
    const isCover = swap.target === 'cover';
    const choices = files.filter((f) => !isCover || !isVideoName(f.name));
    return (
      <div className="sc-swap">
        <b>{isCover ? 'Trocar a capa' : swap.target === 'add' ? 'Adicionar um arquivo' : 'Trocar este arquivo'}</b>
        {choices.length > 0 && (
          <div className="sc-opt">
            <span>Escolher um arquivo que está no calendário</span>
            <div className="sc-pick">
              {choices.map((f) => <button type="button" key={f.id} onClick={() => applySwap(fromScan(f))}>{f.name}</button>)}
            </div>
          </div>
        )}
        <div className="sc-opt">
          <span>Colar o link de um arquivo do Drive</span>
          <div className="linkrow" style={{ marginTop: 0 }}>
            <input className="input" value={swapLink} onChange={(e) => setSwapLink(e.target.value)} placeholder="https://drive.google.com/file/d/…" />
            <button type="button" className="btn line sm" onClick={swapFromLink} disabled={!swapLink.trim()}>Usar</button>
          </div>
        </div>
        <div className="sc-opt">
          <span>Enviar do computador ou do celular</span>
          <input type="file" accept={isCover ? 'image/*' : 'image/*,video/*'} onChange={(e) => { swapFromFile(e.target.files); e.target.value = ''; }} />
        </div>
        <div><button type="button" className="btn ghost sm" onClick={() => setSwap(null)}>Cancelar</button></div>
      </div>
    );
  }

  function editor(it: Item) {
    const multi = MULTI.includes(it.format);
    const hasCover = COVER_FORMATS.includes(it.format);
    return (
      <div className="sc-editor">
        <div className="sc-egrid">
          <div className="field">
            <label htmlFor={`d-${it.key}`}>Data de postagem</label>
            <input className="input" type="date" id={`d-${it.key}`} value={it.date}
              onChange={(e) => e.target.value && update(it.key, (x) => ({ ...x, date: e.target.value, title: retitle(x, e.target.value, x.format), keepLate: false }))} />
          </div>
          <div className="field">
            <label htmlFor={`f-${it.key}`}>Formato</label>
            <select className="input" id={`f-${it.key}`} value={it.format}
              onChange={(e) => update(it.key, (x) => {
                const format = e.target.value as PostFormat;
                return { ...x, format, title: retitle(x, x.date, format), media: MULTI.includes(format) ? x.media : x.media.slice(0, 1), cover: COVER_FORMATS.includes(format) ? x.cover : null };
              })}>
              {(Object.keys(TYPES) as PostFormat[]).map((k) => <option key={k} value={k}>{TYPES[k].label}</option>)}
            </select>
          </div>
          <div className="field sc-full">
            <label htmlFor={`t-${it.key}`}>Título no Aprova</label>
            <input className="input" id={`t-${it.key}`} value={it.title} onChange={(e) => update(it.key, (x) => ({ ...x, title: e.target.value }))} />
          </div>
        </div>

        <div className="sc-block">
          <div className="sc-bhead">
            <b>{it.format === 'carrossel' ? 'Cards do carrossel' : it.format === 'reels' || it.format === 'video' ? 'Vídeo' : multi ? 'Arquivos' : 'Arte'}</b>
            {(multi || !it.media.length) && <button type="button" className="btn line sm" onClick={() => setSwap({ key: it.key, target: 'add' })}><Icon name="plus" />Adicionar</button>}
          </div>
          {!it.media.length && <p className="small muted" style={{ margin: 0 }}>Nenhum arquivo. Adicione a arte ou o vídeo final.</p>}
          {it.media.map((m, k) => (
            <div key={`${k}-${m.name}`}>
              <div className="sc-mitem">
                <Thumb m={m} className="sc-mini" />
                <div className="sc-mname">{m.name}<small>{multi ? `Card ${k + 1}` : isVideo(m) ? 'Vídeo' : 'Imagem'}{m.src === 'local' ? ' · do seu aparelho' : ''}</small></div>
                <div className="sc-mtools">
                  {multi && it.media.length > 1 && <>
                    <button type="button" className="sc-tb" aria-label="Subir" disabled={k === 0}
                      onClick={() => update(it.key, (x) => { const a = x.media.slice(); [a[k - 1], a[k]] = [a[k], a[k - 1]]; return { ...x, media: a }; })}>↑</button>
                    <button type="button" className="sc-tb" aria-label="Descer" disabled={k === it.media.length - 1}
                      onClick={() => update(it.key, (x) => { const a = x.media.slice(); [a[k + 1], a[k]] = [a[k], a[k + 1]]; return { ...x, media: a }; })}>↓</button>
                  </>}
                  <button type="button" className="sc-tb" onClick={() => setSwap({ key: it.key, target: 'media', idx: k })}>Trocar</button>
                  <button type="button" className="sc-tb" onClick={() => update(it.key, (x) => ({ ...x, media: x.media.filter((_, j) => j !== k) }))}>Remover</button>
                </div>
              </div>
              {swap?.key === it.key && swap.target === 'media' && swap.idx === k && swapPanel()}
            </div>
          ))}
          {swap?.key === it.key && swap.target === 'add' && swapPanel()}
        </div>

        {hasCover && (
          <div className="sc-block">
            <div className="sc-bhead"><b>Capa</b></div>
            <div className="sc-mitem">
              <Thumb m={it.cover} className="sc-mini" />
              <div className="sc-mname">{it.cover ? it.cover.name : 'Sem capa'}<small>{it.cover ? 'Imagem de capa' : 'O feed usa o primeiro quadro do vídeo'}</small></div>
              <div className="sc-mtools">
                <button type="button" className="sc-tb" onClick={() => setSwap({ key: it.key, target: 'cover' })}>{it.cover ? 'Trocar capa' : 'Escolher capa'}</button>
                {it.cover && <button type="button" className="sc-tb" onClick={() => update(it.key, (x) => ({ ...x, cover: null }))}>Remover</button>}
              </div>
            </div>
            {it.coverOptions.length > 0 && (
              <div className="sc-pick">
                <span className="small muted">Opções do doc:</span>
                {it.coverOptions.map((f) => <button type="button" key={f.id} onClick={() => update(it.key, (x) => ({ ...x, cover: fromScan(f), coverOptions: [] }))}>{f.name}</button>)}
              </div>
            )}
            {swap?.key === it.key && swap.target === 'cover' && swapPanel()}
          </div>
        )}

        <div className="field">
          <label htmlFor={`c-${it.key}`}>Legenda</label>
          <textarea className="textarea" id={`c-${it.key}`} rows={7} value={it.caption} onChange={(e) => update(it.key, (x) => ({ ...x, caption: e.target.value }))} />
          <span className={`sc-count${it.caption.length > 2200 ? ' over' : ''}`}>{it.caption.length} / 2.200 caracteres</span>
        </div>
        {beauty && (
          <div className="field">
            <label htmlFor={`p-${it.key}`}>Profissional que aparece <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
            <input className="input" id={`p-${it.key}`} value={it.pro} placeholder="@ da profissional" onChange={(e) => update(it.key, (x) => ({ ...x, pro: e.target.value }))} />
          </div>
        )}
        <div className="sc-eactions">
          <button type="button" className="btn line sm" onClick={() => { if (snap) setItems((cur) => cur.map((x) => (x.key === it.key ? snap : x))); setSwap(null); }}>Desfazer alterações</button>
          <button type="button" className="btn sm" onClick={() => { setOpen(null); setSnap(null); setSwap(null); }}>Salvar</button>
        </div>
      </div>
    );
  }

  const stepIdx = { link: 1, reading: 2, review: 3, importing: 4, done: 5 }[step];
  const okN = Object.values(prog).filter((p) => p.state === 'ok').length;
  const errN = Object.values(prog).filter((p) => p.state === 'err').length;

  return (
    <div className="sc">
      <Link className="back" href={`/dashboard/clientes/${client.id}`}><Icon name="left" />{client.name}</Link>
      <h1 className="sc-h1">Cadastrar <b>pelo scanner</b></h1>
      <ol className="sc-steps">
        {['Colar o link', 'Ler o doc', 'Revisar', 'Importar', 'Pronto'].map((l, i) => (
          <li key={l} className={i + 1 === stepIdx ? 'on' : i + 1 < stepIdx ? 'done' : ''}><i>{i + 1 < stepIdx ? '✓' : i + 1}</i>{l}</li>
        ))}
      </ol>

      {step === 'link' && (
        <section className="card sc-pad">
          <div className="sc-warn"><b>O scanner exige mais atenção.</b> O Aprova lê o calendário sozinho e pode errar uma data, um arquivo ou uma legenda. Na revisão, confira post por post antes de enviar.</div>
          <div className="field">
            <label htmlFor="sc-url">Link do calendário no Google Docs</label>
            <input className="input" id="sc-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…"
              onKeyDown={(e) => { if (e.key === 'Enter') read(); }} />
            <span className="hint">O doc e os arquivos do Drive precisam estar abertos para “qualquer pessoa com o link”.</span>
          </div>
          {error && <p className="sc-err">{error}</p>}
          <div className="sc-actions"><button className="btn" onClick={read} disabled={!url.trim()}><Icon name="doc" />Ler calendário</button></div>
        </section>
      )}

      {step === 'reading' && (
        <section className="card sc-pad sc-reading"><div className="sc-spin" /><p>Lendo o calendário e comparando com o que já está no Aprova…</p></section>
      )}

      {step === 'review' && (
        <>
          <div className="sc-warn"><b>Confira cada post antes de enviar.</b> Abra em Editar e veja data, arquivos, capa e legenda. O cliente recebe exatamente o que estiver aqui.</div>
          <p className="small muted" style={{ margin: 0 }}>{docTitle} · {items.length} posts encontrados</p>
          <div className="sc-sum">
            {([['all', 'Todos', items.length], ['ok', 'Prontos, já marcados', counts.ok], ['raw', 'Material bruto ou em alteração', counts.raw], ['gone', 'Já foram ou já estão no Aprova', counts.gone]] as const).map(([k, l, n]) => (
              <button key={k} className={`sc-sumb ${k} ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}><span className="n">{n}</span><span className="l">{l}</span></button>
            ))}
          </div>
          {!items.length && <div className="card sc-pad"><p className="muted" style={{ margin: 0 }}>Não achei nenhum post. Cada post precisa começar por uma data (ex.: 04/12) e ter os campos Formato, Material e Legenda.</p></div>}
          <div className="sc-list">
            {shown.map((it) => {
              const lk = locked(it);
              const late = !lk && it.sel && it.date < today;
              return (
                <div key={it.key} className={`sc-row${it.sel ? ' sel' : ''}${lk ? ' off' : ''}`}>
                  <input type="checkbox" checked={it.sel} disabled={lk} aria-label={`Importar post de ${dm(it.date)}`}
                    onChange={(e) => update(it.key, (x) => ({ ...x, sel: e.target.checked }), false)} />
                  <Thumb m={it.cover ?? it.media[0] ?? null} />
                  <div className="sc-main">
                    <div className="sc-rhead">
                      <b>{dm(it.date)}</b><span className="sc-fmt">{TYPES[it.format].label}</span>
                      {it.media.length > 1 && <span className="sc-fmt">{it.media.length} arquivos</span>}
                      {it.edited && <span className="sc-edited">Alterado</span>}
                      <span className={`sc-st ${it.state}`}>{LABEL[it.state]}</span>
                    </div>
                    {it.caption && <div className="sc-cap">{it.caption.replace(/\s+/g, ' ')}</div>}
                    <div className="sc-why">{it.why}</div>
                    {it.flags.length > 0 && <div className="sc-flags">{it.flags.map((f) => <span key={f}>{f}</span>)}</div>}
                    {late && !it.keepLate && (
                      <div className="sc-late" role="alert">
                        <span><b>Atenção:</b> esse post era para {dm(it.date)} e essa data já passou. Altere a data antes de enviar.</span>
                        <div className="sc-actions">
                          <button className="btn line sm" onClick={() => update(it.key, (x) => ({ ...x, date: addDays(today, 1), title: retitle(x, addDays(today, 1), x.format) }))}>Mudar para amanhã ({dm(addDays(today, 1))})</button>
                          <button className="btn line sm" onClick={() => { if (open !== it.key) startEdit(it); setTimeout(() => document.getElementById(`d-${it.key}`)?.focus(), 50); }}>Escolher outra data</button>
                          <button className="btn line sm" onClick={() => update(it.key, (x) => ({ ...x, keepLate: true }), false)}>Manter {dm(it.date)}</button>
                        </div>
                      </div>
                    )}
                    {late && it.keepLate && <div className="sc-late kept">Data mantida em {dm(it.date)}, mesmo já tendo passado.</div>}
                    {!lk && <div><button className="btn line sm" onClick={() => startEdit(it)}><Icon name="edit" />{open === it.key ? 'Fechar edição' : 'Editar'}</button></div>}
                    {open === it.key && editor(it)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="sc-bar">
            <div className="sc-bar-in">
              <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <span className="small">{lateN ? <span style={{ color: 'var(--late)' }}><b>{lateN}</b> {lateN === 1 ? 'post marcado tem data que já passou' : 'posts marcados têm data que já passou'}.</span> : <><b>{selected.length}</b> {selected.length === 1 ? 'post marcado' : 'posts marcados'} · {items.length - selected.length} ficam de fora</>}</span>
                <label className="sc-conf"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> Conferi todos os posts marcados</label>
              </div>
              <div className="sc-actions">
                <button className="btn line sm" onClick={() => setStep('link')}>Voltar</button>
                <button className="btn" disabled={!canSend} onClick={runImport}><Icon name="send" />{sendLabel}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {(step === 'importing' || step === 'done') && (
        <section className="card sc-pad">
          {step === 'importing'
            ? <h2>Importando <b>{Object.keys(prog).length} posts</b></h2>
            : <h2><b>{okN} {okN === 1 ? 'material enviado' : 'materiais enviados'}</b> para aprovação{errN ? ` · ${errN} com erro` : ''}</h2>}
          <p className="small muted" style={{ margin: '4px 0 14px' }}>{step === 'importing' ? 'Baixando do Drive e guardando no Aprova. Deixe esta tela aberta até terminar.' : `${client.name} já vê os materiais no link de sempre.`}</p>
          <div className="sc-prog">
            {items.filter((it) => prog[it.key]).map((it) => (
              <div key={it.key} className={`sc-pitem ${prog[it.key].state}`}>
                <b>{dm(it.date)}</b>
                <div style={{ minWidth: 0 }}><div className="sc-ptitle">{it.title}</div><div className="small">{prog[it.key].text}</div></div>
                <span className="sc-pdot" aria-hidden />
              </div>
            ))}
          </div>
          {step === 'done' && (
            <div className="sc-actions" style={{ marginTop: 16 }}>
              <Link className="btn" href={`/dashboard/clientes/${client.id}?avisar=1`}><Icon name="bell" />Voltar e avisar o cliente</Link>
              <Link className="btn line" href={`/dashboard/clientes/${client.id}`}>Voltar para {client.name}</Link>
              {errN > 0 && <button className="btn line" onClick={() => { setItems((cur) => cur.map((it) => ({ ...it, sel: prog[it.key]?.state === 'err' }))); setChecked(false); setStep('review'); }}>Revisar os que deram erro</button>}
            </div>
          )}
          {step === 'done' && items.some((it) => !prog[it.key]) && (
            <p className="small muted" style={{ marginTop: 14 }}>Ficaram de fora {items.filter((it) => !prog[it.key]).length} posts (material bruto, já foram ou não marcados). Quando estiverem prontos, é só colar o mesmo link de novo: o Aprova pula o que já importou.</p>
          )}
        </section>
      )}
    </div>
  );
}
