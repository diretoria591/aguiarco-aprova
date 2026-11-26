'use client';

import Link from 'next/link';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { removeFiles } from '@/lib/upload';
import { MAX_UPLOAD_MB } from '@/lib/constants';
import { COVER_PREFIX } from '@/lib/media';
import { driveRef, isVideoName, type ScanFile } from '@/lib/scanner';
import type { HighlightState, ScanHighlight } from '@/lib/destaques';
import type { Client } from '@/lib/types';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { errMsg } from '@/components/admin/client-form';
import { useMe } from '@/components/admin/me';
import { fromScan, isVideo, storeMedia, Thumb, type Media } from '../shared';

type Item = Omit<ScanHighlight, 'stories' | 'cover'> & { stories: Media[]; cover: Media | null; sel: boolean; edited: boolean };
type Step = 'link' | 'reading' | 'review' | 'importing' | 'done';
type Prog = { state: 'wait' | 'run' | 'ok' | 'err'; text: string };
type Swap = { key: string; target: 'story' | 'add' | 'cover'; idx?: number };

const LABEL: Record<HighlightState, string> = { ok: 'Pronto', raw: 'Sem stories', dup: 'Já está no Aprova' };

export function DestaquesView({ client }: { client: Pick<Client, 'id' | 'name'> }) {
  const me = useMe();
  const { toast } = useUI();
  const [step, setStep] = useState<Step>('link');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [folderTitle, setFolderTitle] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [files, setFiles] = useState<ScanFile[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [snap, setSnap] = useState<Item | null>(null);
  const [swap, setSwap] = useState<Swap | null>(null);
  const [swapLink, setSwapLink] = useState('');
  const [checked, setChecked] = useState(false);
  const [prog, setProg] = useState<Record<string, Prog>>({});

  const update = (key: string, fn: (it: Item) => Item, edited = true) =>
    setItems((cur) => cur.map((it) => (it.key === key ? { ...fn(it), ...(edited ? { edited: true } : {}) } : it)));

  async function read() {
    setError('');
    const ref = driveRef(url);
    if (!ref?.folder) { setError('Cole o link de uma pasta do Google Drive (drive.google.com/drive/folders/…).'); return; }
    setStep('reading');
    try {
      const res = await fetch('/api/scanner/destaques', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: client.id, url }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não consegui ler a pasta.');
      setFolderTitle(data.title || 'Destaques');
      setNotes(data.notes ?? []);
      setFiles(data.files ?? []);
      setItems((data.highlights as ScanHighlight[]).map((h) => ({
        ...h, stories: h.stories.map(fromScan), cover: h.cover ? fromScan(h.cover) : null, sel: h.state === 'ok', edited: false,
      })));
      setOpen(null); setSwap(null); setChecked(false);
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui ler a pasta.');
      setStep('link');
    }
  }

  // ---------- importação ----------
  async function importOne(it: Item) {
    const supabase = createClient();
    const set = (state: Prog['state'], text: string) => setProg((p) => ({ ...p, [it.key]: { state, text } }));
    set('run', 'Criando o destaque…');
    const title = it.title.trim() || `Destaque · ${it.name}`;
    const { data: post, error } = await supabase.from('posts')
      .insert({ client_id: client.id, title, format: 'destaque', caption: '', scheduled_date: null, created_by: me.id })
      .select('id').single();
    if (error) throw error;
    const rows: { post_id: string; file_url: string; storage_path: string | null; file_type: string; file_name: string; order_index: number }[] = [];
    try {
      for (let i = 0; i < it.stories.length; i++) {
        set('run', `Baixando story ${i + 1} de ${it.stories.length}${it.cover ? ' (+ capa)' : ''}…`);
        const r = await storeMedia(post.id, it.stories[i], i);
        rows.push({ post_id: post.id, file_url: r.url, storage_path: r.path, file_type: r.type, file_name: r.name, order_index: i });
      }
      if (it.cover) {
        set('run', 'Baixando a capa…');
        const r = await storeMedia(post.id, it.cover, 999);
        if (!r.type.startsWith('image/')) throw new Error(`A capa “${r.name}” não é uma imagem.`);
        rows.push({ post_id: post.id, file_url: r.url, storage_path: r.path, file_type: `${COVER_PREFIX}${r.type}`, file_name: r.name, order_index: -1 });
      }
      const { error: e2 } = await supabase.from('post_media').insert(rows);
      if (e2) throw e2;
    } catch (e) {
      await removeFiles(rows.map((r) => r.storage_path)).catch(() => {});
      await supabase.from('posts').delete().eq('id', post.id);
      throw e;
    }
    await supabase.from('activity_logs').insert({
      client_id: client.id, post_id: post.id, type: 'enviado', actor: me.name, action_text: `${me.name} enviou ${title} (scanner de destaques)`,
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
      if (target === 'add') return { ...it, stories: [...it.stories, m] };
      const stories = it.stories.slice(); stories[idx ?? 0] = m; return { ...it, stories };
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
  const move = (key: string, k: number, d: number) => update(key, (x) => {
    const a = x.stories.slice(); const j = k + d;
    if (j < 0 || j >= a.length) return x;
    [a[k], a[j]] = [a[j], a[k]]; return { ...x, stories: a };
  });

  const selected = items.filter((it) => it.sel);
  const emptyN = selected.filter((it) => !it.stories.length).length;
  const noCoverN = selected.filter((it) => !it.cover).length;
  const canSend = selected.length > 0 && !emptyN && checked;
  const sendLabel = !selected.length ? 'Marque pelo menos um destaque' : emptyN ? 'Tem destaque sem stories' : !checked ? 'Confirme que conferiu' : `Enviar ${selected.length} para aprovação`;

  function swapPanel() {
    if (!swap) return null;
    const isCover = swap.target === 'cover';
    const choices = files.filter((f) => !isCover || !isVideoName(f.name));
    return (
      <div className="sc-swap">
        <b>{isCover ? 'Trocar a capa' : swap.target === 'add' ? 'Adicionar um story' : 'Trocar este story'}</b>
        {choices.length > 0 && (
          <div className="sc-opt">
            <span>Escolher um arquivo da pasta</span>
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
    return (
      <div className="sc-editor">
        <div className="field">
          <label htmlFor={`t-${it.key}`}>Título no Aprova</label>
          <input className="input" id={`t-${it.key}`} value={it.title} onChange={(e) => update(it.key, (x) => ({ ...x, title: e.target.value }))} />
        </div>

        <div className="sc-block">
          <div className="sc-bhead"><b>Capa</b></div>
          <div className="sc-mitem">
            <Thumb m={it.cover} className="sc-mini hl-round" />
            <div className="sc-mname">{it.cover ? it.cover.name : 'Sem capa'}<small>{it.cover ? 'Ícone redondo do destaque' : 'Escolha a capa do destaque'}</small></div>
            <div className="sc-mtools">
              <button type="button" className="sc-tb" onClick={() => setSwap({ key: it.key, target: 'cover' })}>{it.cover ? 'Trocar capa' : 'Escolher capa'}</button>
              {it.cover && <button type="button" className="sc-tb" onClick={() => update(it.key, (x) => ({ ...x, cover: null }))}>Remover</button>}
            </div>
          </div>
          {it.coverOptions.length > 0 && (
            <div className="sc-pick">
              <span className="small muted">Opções da pasta:</span>
              {it.coverOptions.map((f) => <button type="button" key={f.id} onClick={() => update(it.key, (x) => ({ ...x, cover: fromScan(f), coverOptions: [] }))}>{f.name}</button>)}
            </div>
          )}
          {swap?.key === it.key && swap.target === 'cover' && swapPanel()}
        </div>

        <div className="sc-block">
          <div className="sc-bhead">
            <b>Stories, na ordem</b>
            <button type="button" className="btn line sm" onClick={() => setSwap({ key: it.key, target: 'add' })}><Icon name="plus" />Adicionar</button>
          </div>
          {!it.stories.length && <p className="small muted" style={{ margin: 0 }}>Nenhum story. Adicione as fotos ou os vídeos.</p>}
          {it.stories.map((m, k) => (
            <div key={`${k}-${m.name}`}>
              <div className="sc-mitem">
                <Thumb m={m} className="sc-mini" />
                <div className="sc-mname">{m.name}<small>Story {k + 1} · {isVideo(m) ? 'vídeo' : 'imagem'}{m.src === 'local' ? ' · do seu aparelho' : ''}</small></div>
                <div className="sc-mtools">
                  {it.stories.length > 1 && <>
                    <button type="button" className="sc-tb" aria-label="Subir" disabled={k === 0} onClick={() => move(it.key, k, -1)}>↑</button>
                    <button type="button" className="sc-tb" aria-label="Descer" disabled={k === it.stories.length - 1} onClick={() => move(it.key, k, 1)}>↓</button>
                  </>}
                  <button type="button" className="sc-tb" onClick={() => setSwap({ key: it.key, target: 'story', idx: k })}>Trocar</button>
                  <button type="button" className="sc-tb" onClick={() => update(it.key, (x) => ({ ...x, stories: x.stories.filter((_, j) => j !== k) }))}>Remover</button>
                </div>
              </div>
              {swap?.key === it.key && swap.target === 'story' && swap.idx === k && swapPanel()}
            </div>
          ))}
          {swap?.key === it.key && swap.target === 'add' && swapPanel()}
        </div>

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
      <h1 className="sc-h1">Destaques <b>pelo scanner</b></h1>
      <ol className="sc-steps">
        {['Colar o link', 'Ler a pasta', 'Revisar', 'Importar', 'Pronto'].map((l, i) => (
          <li key={l} className={i + 1 === stepIdx ? 'on' : i + 1 < stepIdx ? 'done' : ''}><i>{i + 1 < stepIdx ? '✓' : i + 1}</i>{l}</li>
        ))}
      </ol>

      {step === 'link' && (
        <section className="card sc-pad">
          <div className="sc-warn"><b>Como organizar a pasta:</b> uma subpasta para cada destaque (o nome da pasta vira o nome do destaque). Dentro dela, os stories numerados na ordem (1, 2, 3…) e a capa com o nome do destaque ou “capa”. Escreva entre parênteses o que estiver pendente, ex.: “2 (aguardando foto).jpg”.</div>
          <div className="field">
            <label htmlFor="hl-url">Link da pasta de destaques no Google Drive</label>
            <input className="input" id="hl-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…"
              onKeyDown={(e) => { if (e.key === 'Enter') read(); }} />
            <span className="hint">A pasta precisa estar aberta para “qualquer pessoa com o link”.</span>
          </div>
          {error && <p className="sc-err">{error}</p>}
          <div className="sc-actions"><button className="btn" onClick={read} disabled={!url.trim()}><Icon name="sparkle" />Ler destaques</button></div>
        </section>
      )}

      {step === 'reading' && (
        <section className="card sc-pad sc-reading"><div className="sc-spin" /><p>Abrindo as pastas e montando os destaques…</p></section>
      )}

      {step === 'review' && (
        <>
          <div className="sc-warn"><b>Confira cada destaque antes de enviar.</b> Veja a capa e a ordem dos stories. O cliente recebe exatamente o que estiver aqui.</div>
          <p className="small muted" style={{ margin: 0 }}>{folderTitle} · {items.length} {items.length === 1 ? 'destaque encontrado' : 'destaques encontrados'}</p>
          {notes.map((n) => <p key={n} className="small muted" style={{ margin: 0 }}>{n}</p>)}
          {!items.length && <div className="card sc-pad"><p className="muted" style={{ margin: 0 }}>Não achei nenhum destaque nessa pasta.</p></div>}
          <div className="sc-list">
            {items.map((it) => {
              const lk = it.state === 'dup';
              return (
                <div key={it.key} className={`sc-row hl-row${it.sel ? ' sel' : ''}${lk ? ' off' : ''}`}>
                  <input type="checkbox" checked={it.sel} disabled={lk} aria-label={`Importar ${it.name}`}
                    onChange={(e) => update(it.key, (x) => ({ ...x, sel: e.target.checked }), false)} />
                  <Thumb m={it.cover} className="sc-thumb hl-round" />
                  <div className="sc-main">
                    <div className="sc-rhead">
                      <b>{it.name}</b>
                      <span className="sc-fmt">{it.stories.length} {it.stories.length === 1 ? 'story' : 'stories'}</span>
                      {!it.cover && <span className="sc-fmt hl-warn">sem capa</span>}
                      {it.edited && <span className="sc-edited">Alterado</span>}
                      <span className={`sc-st ${it.state}`}>{LABEL[it.state]}</span>
                    </div>
                    {it.stories.length > 0 && (
                      <div className="hl-strip">
                        {it.stories.map((m, k) => (
                          <div className="hl-story" key={`${k}-${m.name}`}><Thumb m={m} className="sc-mini" /><span>{k + 1}</span></div>
                        ))}
                      </div>
                    )}
                    {it.flags.length > 0 && <div className="sc-flags">{it.flags.map((f) => <span key={f}>{f}</span>)}</div>}
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
                <span className="small"><b>{selected.length}</b> {selected.length === 1 ? 'destaque marcado' : 'destaques marcados'}{noCoverN ? <> · <span style={{ color: 'var(--wait)' }}>{noCoverN} sem capa</span></> : null}</span>
                <label className="sc-conf"><input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} /> Conferi capa e ordem dos stories</label>
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
            ? <h2>Importando <b>{Object.keys(prog).length} destaques</b></h2>
            : <h2><b>{okN} {okN === 1 ? 'destaque enviado' : 'destaques enviados'}</b> para aprovação{errN ? ` · ${errN} com erro` : ''}</h2>}
          <p className="small muted" style={{ margin: '4px 0 14px' }}>{step === 'importing' ? 'Baixando do Drive e guardando no Aprova. Deixe esta tela aberta até terminar.' : `${client.name} já vê os destaques no link de sempre.`}</p>
          <div className="sc-prog">
            {items.filter((it) => prog[it.key]).map((it) => (
              <div key={it.key} className={`sc-pitem ${prog[it.key].state}`}>
                <b>{it.stories.length}</b>
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
        </section>
      )}
    </div>
  );
}
