'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { removeFiles, safePath, uploadFile } from '@/lib/upload';
import { MAX_UPLOAD_MB, TYPES } from '@/lib/constants';
import { COVER_PREFIX, EMBED_PREFIX, embedLabel, embedThumb, isEmbed, parseVideoLink, splitMedia, type Embed } from '@/lib/media';
import type { Client, Post, PostFormat, PostMedia } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, useUI } from '@/components/ui';
import { errMsg, normalizeIg } from './client-form';
import { useMe } from './me';

const ACCEPT = /^(image|video)\/|application\/pdf/;
/** Formatos que aceitam capa personalizada. */
const COVER_FORMATS: PostFormat[] = ['reels', 'video', 'destaque'];

/**
 * Item da lista de arquivos. Em "nova versão" a lista já começa com os
 * arquivos atuais (`keep`); trocar um deles vira `file`/`link` com `was`
 * apontando para o original (dá para desfazer).
 */
type Item =
  | { kind: 'keep'; media: PostMedia }
  | { kind: 'file'; file: File; was?: PostMedia }
  | { kind: 'link'; embed: Embed; was?: PostMedia };
type MediaRow = { post_id: string; file_url: string; storage_path: string | null; file_type: string; file_name: string; order_index: number };
const itemKey = (it: Item, i: number) =>
  it.kind === 'keep' ? it.media.id
    : it.kind === 'file' ? `${it.file.name}-${it.file.size}-${it.file.lastModified}-${i}` : `${it.embed.src}-${i}`;

/** Miniatura de um arquivo que já está no post. */
function MediaThumb({ m }: { m: PostMedia }) {
  if (m.file_type.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={m.file_url} alt="" />;
  }
  if (m.file_type.startsWith('video/')) return <video src={`${m.file_url}#t=0.1`} muted preload="metadata" />;
  if (isEmbed(m)) {
    const thumb = embedThumb(m.file_url);
    return (
      <div className="emb" style={thumb ? { backgroundImage: `linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)),url("${thumb}")` } : undefined}>
        <Icon name="video" /><span>{embedLabel(m.file_type)}</span>
      </div>
    );
  }
  return <span>{m.file_name}</span>;
}

/** Como chamar a posição N do post no recado ("tela 2", "o vídeo"…). */
function slotName(format: PostFormat, olds: PostMedia[], m: PostMedia) {
  const i = olds.indexOf(m);
  if (olds.length > 1) return format === 'carrossel' ? `a tela ${i + 1}` : format === 'destaque' ? `o story ${i + 1}` : `o item ${i + 1}`;
  if (m.file_type.startsWith('image/')) return 'a imagem';
  if (m.file_type.startsWith('video/') || isEmbed(m)) return 'o vídeo';
  return 'o arquivo';
}

function joinPt(list: string[]) {
  return list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}

function Preview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (file.type.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" />;
  }
  if (file.type.startsWith('video/')) return <video src={`${url}#t=0.1`} muted />;
  return <span>{file.name}</span>;
}

export function UploadForm({
  client, material, onClose, onDone,
}: { client: Client; material?: Post; onClose: () => void; onDone?: () => void }) {
  const isVersion = !!material;
  const router = useRouter();
  const me = useMe();
  const { toast } = useUI();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const oldItems = useMemo(
    () => (material ? splitMedia([...material.post_media].sort((a, b) => a.order_index - b.order_index)).items : []),
    [material],
  );
  const [itemsState, setItems] = useState<Item[]>(() => oldItems.map((media) => ({ kind: 'keep' as const, media })));
  const items = itemsState;
  const [link, setLink] = useState('');
  /** posição que está sendo trocada (mostra a barra "trocar por arquivo ou link") */
  const [replacing, setReplacing] = useState<number | null>(null);
  const [replaceLink, setReplaceLink] = useState('');
  const oldCover = material ? splitMedia(material.post_media).cover : null;
  const lastAsk = material ? [...material.comments].reverse().find((c) => c.author_role === 'client' && c.kind === 'adjustment') : undefined;
  const [cover, setCover] = useState<File | null>(null);
  const [dropOldCover, setDropOldCover] = useState(false);
  const [type, setType] = useState<PostFormat>(material?.format ?? 'carrossel');
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  function validFiles(list: FileList | null) {
    const ok: File[] = [];
    Array.from(list ?? []).forEach((f) => {
      if (!ACCEPT.test(f.type)) return toast(`“${f.name}” não é foto, vídeo ou PDF.`, 'err');
      if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return toast(`“${f.name}” passa de ${MAX_UPLOAD_MB} MB.`, 'err');
      ok.push(f);
    });
    return ok;
  }
  function add(list: FileList | null) {
    const ok = validFiles(list);
    setItems((cur) => cur.concat(ok.map((file) => ({ kind: 'file' as const, file }))));
  }
  /** original da posição i (se ela era/é um arquivo que já estava no post) */
  const origOf = (it: Item) => (it.kind === 'keep' ? it.media : it.was);
  function replaceWith(i: number, next: { kind: 'file'; file: File } | { kind: 'link'; embed: Embed }) {
    setItems((cur) => cur.map((it, k) => (k === i ? { ...next, was: origOf(it) } : it)));
    setReplacing(null);
    setReplaceLink('');
  }
  function replaceFile(list: FileList | null) {
    const f = validFiles(list)[0];
    if (f && replacing !== null) replaceWith(replacing, { kind: 'file', file: f });
  }
  function replaceByLink() {
    if (replacing === null || !replaceLink.trim()) return;
    const embed = parseVideoLink(replaceLink);
    if (!embed) return toast('Não reconheci esse link. Cole o endereço do vídeo (YouTube, Vimeo, Drive, Instagram, TikTok, Loom…).', 'err');
    replaceWith(replacing, { kind: 'link', embed });
  }
  function undoReplace(i: number) {
    setItems((cur) => cur.map((it, k) => (k === i && it.kind !== 'keep' && it.was ? { kind: 'keep', media: it.was } : it)));
  }
  function addLink() {
    if (!link.trim()) return;
    const embed = parseVideoLink(link);
    if (!embed) return toast('Não reconheci esse link. Cole o endereço do vídeo (YouTube, Vimeo, Drive, Instagram, TikTok, Loom…).', 'err');
    setItems((cur) => cur.concat({ kind: 'link', embed }));
    setLink('');
  }
  function pickCover(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('A capa precisa ser uma imagem (JPG ou PNG).', 'err');
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return toast(`A capa passa de ${MAX_UPLOAD_MB} MB.`, 'err');
    setCover(f);
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    setItems((cur) => { const n = cur.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
  }

  /** Envia arquivos (itens + capa) e devolve as linhas de post_media. */
  async function uploadAll(postId: string, withItems: boolean, items: Item[]) {
    const sendCover = !!cover && COVER_FORMATS.includes(type);
    const files = (withItems ? items : []).flatMap((it) => (it.kind === 'file' ? [it.file] : []));
    if (sendCover) files.push(cover!);
    const total = files.reduce((a, f) => a + f.size, 0) || 1;
    let done = 0;
    const rows: MediaRow[] = [];
    const up = async (f: File, i: number) => {
      const path = safePath(`posts/${postId}`, f, i);
      const url = await uploadFile(path, f, (loaded) => setProgress((done + loaded) / total));
      done += f.size;
      setProgress(done / total);
      return { url, path };
    };
    try {
      if (withItems) {
        for (let i = 0; i < items.length; i++) {
          const it = items[i];
          if (it.kind === 'keep') continue;
          if (it.kind === 'link') {
            rows.push({ post_id: postId, file_url: it.embed.src, storage_path: null, file_type: `${EMBED_PREFIX}${it.embed.provider}`, file_name: it.embed.original.slice(0, 500), order_index: i });
          } else {
            const { url, path } = await up(it.file, i);
            rows.push({ post_id: postId, file_url: url, storage_path: path, file_type: it.file.type, file_name: it.file.name, order_index: i });
          }
        }
      }
      if (sendCover) {
        const { url, path } = await up(cover!, 999);
        rows.push({ post_id: postId, file_url: url, storage_path: path, file_type: `${COVER_PREFIX}${cover!.type}`, file_name: cover!.name, order_index: -1 });
      }
    } catch (e) {
      await removeFiles(rows.map((r) => r.storage_path)).catch(() => {});
      throw e;
    }
    return rows;
  }

  /** Resumo do que mudou na versão, para o cliente saber onde olhar. */
  function changeSummary(caption: string) {
    if (!material) return '';
    const name = (m: PostMedia) => slotName(material.format, oldItems, m);
    const swapped = items.flatMap((it) => (it.kind !== 'keep' && it.was ? [name(it.was)] : []));
    const present = new Set(items.flatMap((it) => { const o = origOf(it); return o ? [o.id] : []; }));
    const removed = oldItems.filter((m) => !present.has(m.id)).map(name);
    const added = items.filter((it) => it.kind !== 'keep' && !it.was).length;
    const parts: string[] = [];
    if (swapped.length) parts.push(`trocamos ${joinPt(swapped)}`);
    if (cover && COVER_FORMATS.includes(type)) parts.push(oldCover ? 'trocamos a capa' : 'incluímos a capa');
    else if (dropOldCover && oldCover) parts.push('tiramos a capa');
    if (removed.length) parts.push(`tiramos ${joinPt(removed)}`);
    if (added) parts.push(added === 1 ? 'incluímos 1 arquivo novo' : `incluímos ${added} arquivos novos`);
    const moved = items.some((it, i) => it.kind === 'keep' && oldItems.indexOf(it.media) !== i);
    if (moved && !removed.length && !added) parts.push('mudamos a ordem');
    if (caption !== material.caption) parts.push('ajustamos a legenda');
    if (!parts.length) return '';
    const txt = joinPt(parts);
    return `O que mudou: ${txt.charAt(0).toUpperCase()}${txt.slice(1)}.`;
  }

  async function submit() {
    const form = formRef.current!;
    const fd = new FormData(form);
    const title = String(fd.get('title') ?? '').trim();
    const caption = String(fd.get('caption') ?? '');
    if (!isVersion && !title) return toast('Dê um título para o material.', 'err');
    // link colado no campo sem clicar em "Adicionar" também entra no material
    let items = itemsState;
    if (link.trim()) {
      const embed = parseVideoLink(link);
      if (!embed) return toast('Não reconheci o link do vídeo. Confira o endereço ou apague o campo antes de enviar.', 'err');
      items = itemsState.concat({ kind: 'link', embed });
      setItems(items);
      setLink('');
    }
    if (!items.length && !caption.trim()) return toast('Envie pelo menos um arquivo, um link ou um texto.', 'err');

    const supabase = createClient();
    setProgress(0);
    try {
      if (!isVersion) {
        const scheduled = String(fd.get('scheduled_date') ?? '') || null;
        const pro = normalizeIg(String(fd.get('featured_professional') ?? '')).slice(0, 80);
        const { data: post, error } = await supabase
          .from('posts')
          .insert({ client_id: client.id, title, format: type, caption, scheduled_date: scheduled, created_by: me.id, ...(pro ? { featured_professional: pro } : {}) })
          .select('id')
          .single();
        if (error) throw error;
        try {
          const rows = await uploadAll(post.id, true, items);
          if (rows.length) {
            const { error: e2 } = await supabase.from('post_media').insert(rows);
            if (e2) { await removeFiles(rows.map((r) => r.storage_path)); throw e2; }
          }
        } catch (e) {
          await supabase.from('posts').delete().eq('id', post.id);
          throw e;
        }
        await supabase.from('activity_logs').insert({
          client_id: client.id, post_id: post.id, type: 'enviado', actor: me.name, action_text: `${me.name} enviou ${title}`,
        });
        toast('Material enviado para aprovação');
      } else {
        const v = material.version + 1;
        const rows = await uploadAll(material.id, true, items);
        if (rows.length) {
          const { error: e2 } = await supabase.from('post_media').insert(rows);
          if (e2) { await removeFiles(rows.map((r) => r.storage_path)); throw e2; }
        }
        // os que ficaram: só atualiza a posição se mudou de lugar
        await Promise.all(items.map((it, i) => (it.kind === 'keep' && it.media.order_index !== i
          ? supabase.from('post_media').update({ order_index: i }).eq('id', it.media.id)
          : null)));
        // remove o que saiu: itens trocados/removidos e a capa antiga (se trocou/removeu)
        const newCover = rows.some((r) => r.file_type.startsWith(COVER_PREFIX));
        const keptIds = new Set(items.flatMap((it) => (it.kind === 'keep' ? [it.media.id] : [])));
        const gone = [
          ...oldItems.filter((m) => !keptIds.has(m.id)),
          ...(oldCover && (newCover || dropOldCover) ? [oldCover] : []),
        ];
        if (gone.length) {
          await supabase.from('post_media').delete().in('id', gone.map((m) => m.id));
          await removeFiles(gone.map((m) => m.storage_path)).catch(() => {});
        }
        const { error } = await supabase.from('posts').update({
          version: v, caption, status: 'pending', sent_at: new Date().toISOString(),
          first_viewed_at: null, decided_at: null, decided_by: null,
        }).eq('id', material.id);
        if (error) throw error;
        const note = String(fd.get('note') ?? '').trim();
        const summary = changeSummary(caption);
        await supabase.from('comments').insert({
          post_id: material.id, author_name: me.name, author_role: 'agency', kind: 'version',
          content: [note || `Nova versão enviada (v${v}).`, summary].filter(Boolean).join('\n'), version: v,
        });
        await supabase.from('activity_logs').insert({
          client_id: client.id, post_id: material.id, type: 'nova_versao', actor: me.name, meta: `v${v}`,
          action_text: `${me.name} enviou nova versão de ${material.title} (v${v})`,
        });
        toast('Nova versão enviada');
      }
      router.refresh();
      onClose();
      onDone?.();
    } catch (e) {
      setProgress(null);
      toast(errMsg(e), 'err');
    }
  }

  const busy = progress !== null;

  function renderPreviews() {
    return (
      <>
        <div className={`previews${isVersion ? ' big' : ''}`}>
          {items.map((it, i) => (
            <div className={`pv${replacing === i ? ' sel' : ''}`} key={itemKey(it, i)}>
              {it.kind === 'keep' ? <MediaThumb m={it.media} /> : it.kind === 'file' ? <Preview file={it.file} /> : (
                <div className="emb" style={it.embed.thumb ? { backgroundImage: `linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)),url("${it.embed.thumb}")` } : undefined}>
                  <Icon name="video" /><span>{it.embed.label}</span>
                </div>
              )}
              <span className="n">{i + 1}</span>
              {isVersion && it.kind !== 'keep' && <span className="tag">{it.was ? 'trocado' : 'novo'}</span>}
              <button type="button" aria-label="Remover" title="Remover" onClick={() => { setReplacing(null); setItems((cur) => cur.filter((_, k) => k !== i)); }}><Icon name="x" /></button>
              {isVersion && (it.kind === 'keep' || it.was) && (
                it.kind === 'keep'
                  ? <button type="button" className="swap" onClick={() => setReplacing(replacing === i ? null : i)}>Trocar</button>
                  : <button type="button" className="swap" onClick={() => undoReplace(i)}>Desfazer</button>
              )}
              {items.length > 1 && (
                <div className="mv">
                  <button type="button" aria-label="Mover para trás" onClick={() => move(i, -1)}><Icon name="left" /></button>
                  <button type="button" aria-label="Mover para frente" onClick={() => move(i, 1)}><Icon name="right" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
        {replacing !== null && items[replacing] && (
          <div className="swap-bar">
            <b>Trocar {(() => { const o = origOf(items[replacing]); return o && material ? slotName(material.format, oldItems, o) : `o item ${replacing + 1}`; })()} por:</b>
            <div className="linkrow wrap" style={{ marginTop: 6 }}>
              <button type="button" className="btn sm" onClick={() => replaceRef.current?.click()}><Icon name="upload" />Escolher arquivo</button>
              <input className="input" value={replaceLink} onChange={(e) => setReplaceLink(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); replaceByLink(); } }}
                placeholder="ou cole o link do vídeo" />
              <button type="button" className="btn line sm" onClick={replaceByLink} disabled={!replaceLink.trim()}><Icon name="link" />Usar link</button>
              <button type="button" className="btn line sm" onClick={() => { setReplacing(null); setReplaceLink(''); }}>Cancelar</button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <Modal
      title={isVersion ? <>Nova <b>versão</b></> : <>Enviar para <b>{client.name}</b></>}
      onClose={() => { if (!busy) onClose(); }}
      foot={
        <>
          <button className="btn line" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn" onClick={submit} disabled={busy}>
            <Icon name="send" />{isVersion ? 'Enviar nova versão' : 'Enviar para aprovação'}
          </button>
        </>
      }
    >
      <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
        {isVersion ? (
          <>
            <p className="muted small" style={{ margin: '0 0 14px' }}>
              “{material.title}” volta para <b>aguardando aprovação</b> e o cliente vê a versão nova.
              Troque só o que o cliente pediu: o resto continua como está.
            </p>
            {lastAsk && (
              <div className="ask-box">
                <span className="eyebrow">O que o cliente pediu</span>
                <p>{lastAsk.content}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="field">
              <label>Título</label>
              <input className="input" name="title" required placeholder="Ex.: Carrossel — 5 sinais de que…" />
            </div>
            <div className="field">
              <label>Formato</label>
              <div className="chips">
                {(Object.keys(TYPES) as PostFormat[]).map((k) => (
                  <button type="button" key={k} className={`chip-opt ${k === type ? 'on' : ''}`} onClick={() => setType(k)}>
                    {TYPES[k].label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="field">
          {isVersion && oldItems.length > 0 ? (
            <label>Arquivos <span className="muted" style={{ fontWeight: 400 }}>— clique em <b>Trocar</b> só no que vai mudar; para incluir mais, use o campo abaixo</span></label>
          ) : (
            <label>Arquivos <span className="muted" style={{ fontWeight: 400 }}>— fotos, vídeos ou PDF (pode misturar foto e vídeo no carrossel); a ordem é a do carrossel</span></label>
          )}
          {isVersion && items.length > 0 && renderPreviews()}
          <div
            className={`drop${over ? ' over' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          >
            <Icon name="upload" />
            <div style={{ marginTop: 6 }}><b style={{ fontWeight: 500 }}>Clique para escolher</b> ou arraste aqui</div>
            <div className="small muted">até {MAX_UPLOAD_MB} MB por arquivo</div>
          </div>
          <input ref={fileRef} type="file" multiple accept="image/*,video/*,application/pdf" hidden
            onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <div className="linkrow">
            <input className="input" value={link} onChange={(e) => setLink(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
              placeholder="Ou cole o link de um vídeo (YouTube, Vimeo, Drive, Instagram, TikTok, Loom…)" />
            <button type="button" className="btn line" onClick={addLink} disabled={!link.trim()}><Icon name="link" />Adicionar</button>
          </div>
          {!isVersion && items.length > 0 && renderPreviews()}
          <input ref={replaceRef} type="file" accept="image/*,video/*,application/pdf" hidden
            onChange={(e) => { replaceFile(e.target.files); e.target.value = ''; }} />
        </div>

        {COVER_FORMATS.includes(type) && (
          <div className="field">
            {type === 'destaque'
              ? <label>Capa do destaque <span className="muted" style={{ fontWeight: 400 }}>— o ícone redondo que aparece no perfil</span></label>
              : <label>Capa personalizada <span className="muted" style={{ fontWeight: 400 }}>(opcional — a imagem que aparece no feed)</span></label>}
            <div className={`cover-pick${type === 'destaque' ? ' round' : ''}`}>
              <div className="cv">
                {cover ? <Preview file={cover} />
                  : oldCover && !dropOldCover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={oldCover.file_url} alt="Capa atual" />
                    : <Icon name="image" />}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn line sm" onClick={() => coverRef.current?.click()}>
                  <Icon name="upload" />{cover || (oldCover && !dropOldCover) ? 'Trocar capa' : 'Escolher capa'}
                </button>
                {(cover || (oldCover && !dropOldCover)) && (
                  <button type="button" className="btn line sm" onClick={() => { if (cover) setCover(null); else setDropOldCover(true); }}>
                    <Icon name="x" />Remover
                  </button>
                )}
              </div>
            </div>
            <input ref={coverRef} type="file" accept="image/*" hidden
              onChange={(e) => { pickCover(e.target.files); e.target.value = ''; }} />
          </div>
        )}

        <div className="field">
          <label>Legenda / texto para aprovação</label>
          <textarea className="textarea" name="caption" placeholder="Cole aqui a legenda, o roteiro ou o texto." defaultValue={material?.caption ?? ''} />
        </div>

        {isVersion ? (
          <div className="field">
            <label>Recado para o cliente <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
            <input className="input" name="note" placeholder="Ex.: Ajustamos a cor do título como você pediu." />
          </div>
        ) : (
          <>
            <div className="field" style={{ maxWidth: 220 }}>
              <label>Data prevista de publicação <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
              <input className="input" type="date" name="scheduled_date" />
            </div>
            {client.segment === 'beleza' && (
              <div className="field">
                <label htmlFor="uf-pro">Profissional que aparece <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
                <input className="input" id="uf-pro" name="featured_professional" placeholder="@ da profissional" autoComplete="off" />
                <span className="hint">Se ficar em branco, quem agenda recebe o aviso para conferir quem aparece.</span>
              </div>
            )}
          </>
        )}

        <div className="progress" hidden={!busy}><i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
      </form>
    </Modal>
  );
}
