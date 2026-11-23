'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { removeFiles, safePath, uploadFile } from '@/lib/upload';
import { MAX_UPLOAD_MB, TYPES } from '@/lib/constants';
import { COVER_PREFIX, EMBED_PREFIX, parseVideoLink, splitMedia, type Embed } from '@/lib/media';
import type { Client, Post, PostFormat } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, useUI } from '@/components/ui';
import { errMsg, normalizeIg } from './client-form';
import { useMe } from './me';

const ACCEPT = /^(image|video)\/|application\/pdf/;
/** Formatos que aceitam capa personalizada. */
const COVER_FORMATS: PostFormat[] = ['reels', 'video'];

type Item = { kind: 'file'; file: File } | { kind: 'link'; embed: Embed };
type MediaRow = { post_id: string; file_url: string; storage_path: string | null; file_type: string; file_name: string; order_index: number };
const itemKey = (it: Item, i: number) =>
  it.kind === 'file' ? `${it.file.name}-${it.file.size}-${it.file.lastModified}-${i}` : `${it.embed.src}-${i}`;

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
  const [itemsState, setItems] = useState<Item[]>([]);
  const items = itemsState;
  const [link, setLink] = useState('');
  const oldCover = material ? splitMedia(material.post_media).cover : null;
  const [cover, setCover] = useState<File | null>(null);
  const [dropOldCover, setDropOldCover] = useState(false);
  const [type, setType] = useState<PostFormat>(material?.format ?? 'carrossel');
  const [over, setOver] = useState(false);
  const [keep, setKeep] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const ok: File[] = [];
    Array.from(list).forEach((f) => {
      if (!ACCEPT.test(f.type)) return toast(`“${f.name}” não é foto, vídeo ou PDF.`, 'err');
      if (f.size > MAX_UPLOAD_MB * 1024 * 1024) return toast(`“${f.name}” passa de ${MAX_UPLOAD_MB} MB.`, 'err');
      ok.push(f);
    });
    setItems((cur) => cur.concat(ok.map((file) => ({ kind: 'file' as const, file }))));
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
    if (!items.length && !caption.trim() && !keep) return toast('Envie pelo menos um arquivo, um link ou um texto.', 'err');

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
        const rows = await uploadAll(material.id, !keep, items);
        if (rows.length) {
          const { error: e2 } = await supabase.from('post_media').insert(rows);
          if (e2) { await removeFiles(rows.map((r) => r.storage_path)); throw e2; }
        }
        // remove o que foi substituído: itens antigos (se não manteve) e a capa antiga (se trocou/removeu)
        const newCover = rows.some((r) => r.file_type.startsWith(COVER_PREFIX));
        const old = splitMedia(material.post_media);
        const gone = [
          ...(keep ? [] : old.items),
          ...(old.cover && (newCover || dropOldCover) ? [old.cover] : []),
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
        await supabase.from('comments').insert({
          post_id: material.id, author_name: me.name, author_role: 'agency', kind: 'version',
          content: note || `Nova versão enviada (v${v}).`, version: v,
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
          <p className="muted small" style={{ margin: '0 0 14px' }}>
            “{material.title}” volta para <b>aguardando aprovação</b> e o cliente vê a versão nova.
          </p>
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
          <label>Arquivos <span className="muted" style={{ fontWeight: 400 }}>— fotos, vídeos ou PDF (pode misturar foto e vídeo no carrossel); a ordem é a do carrossel</span></label>
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
          {items.length > 0 && (
            <div className="previews">
              {items.map((it, i) => (
                <div className="pv" key={itemKey(it, i)}>
                  {it.kind === 'file' ? <Preview file={it.file} /> : (
                    <div className="emb" style={it.embed.thumb ? { backgroundImage: `linear-gradient(rgba(0,0,0,.35),rgba(0,0,0,.35)),url("${it.embed.thumb}")` } : undefined}>
                      <Icon name="video" /><span>{it.embed.label}</span>
                    </div>
                  )}
                  <span className="n">{i + 1}</span>
                  <button type="button" aria-label="Remover" onClick={() => setItems((cur) => cur.filter((_, k) => k !== i))}><Icon name="x" /></button>
                  {items.length > 1 && (
                    <div className="mv">
                      <button type="button" aria-label="Mover para trás" onClick={() => move(i, -1)}><Icon name="left" /></button>
                      <button type="button" aria-label="Mover para frente" onClick={() => move(i, 1)}><Icon name="right" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isVersion && splitMedia(material.post_media).items.length > 0 && (
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Manter os arquivos atuais (mudar só o texto)
            </label>
          )}
        </div>

        {COVER_FORMATS.includes(type) && (
          <div className="field">
            <label>Capa personalizada <span className="muted" style={{ fontWeight: 400 }}>(opcional — a imagem que aparece no feed)</span></label>
            <div className="cover-pick">
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
