'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { removeFiles, safePath, uploadFile } from '@/lib/upload';
import { MAX_UPLOAD_MB, TYPES } from '@/lib/constants';
import type { Client, Post, PostFormat } from '@/lib/types';
import { Icon } from '@/components/icon';
import { Modal, useUI } from '@/components/ui';
import { errMsg } from './client-form';
import { useMe } from './me';

const ACCEPT = /^(image|video)\/|application\/pdf/;

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
  const [files, setFiles] = useState<File[]>([]);
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
    setFiles((cur) => cur.concat(ok));
  }
  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= files.length) return;
    setFiles((cur) => { const n = cur.slice(); [n[i], n[j]] = [n[j], n[i]]; return n; });
  }

  async function uploadAll(postId: string) {
    const total = files.reduce((a, f) => a + f.size, 0) || 1;
    let done = 0;
    const rows: { post_id: string; file_url: string; storage_path: string; file_type: string; file_name: string; order_index: number }[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = safePath(`posts/${postId}`, f, i);
      try {
        const url = await uploadFile(path, f, (loaded) => setProgress((done + loaded) / total));
        rows.push({ post_id: postId, file_url: url, storage_path: path, file_type: f.type, file_name: f.name, order_index: i });
      } catch (e) {
        await removeFiles(rows.map((r) => r.storage_path)).catch(() => {});
        throw e;
      }
      done += f.size;
      setProgress(done / total);
    }
    return rows;
  }

  async function submit() {
    const form = formRef.current!;
    const fd = new FormData(form);
    const title = String(fd.get('title') ?? '').trim();
    const caption = String(fd.get('caption') ?? '');
    if (!isVersion && !title) return toast('Dê um título para o material.', 'err');
    if (!files.length && !caption.trim() && !keep) return toast('Envie pelo menos um arquivo ou um texto.', 'err');

    const supabase = createClient();
    setProgress(0);
    try {
      if (!isVersion) {
        const scheduled = String(fd.get('scheduled_date') ?? '') || null;
        const { data: post, error } = await supabase
          .from('posts')
          .insert({ client_id: client.id, title, format: type, caption, scheduled_date: scheduled, created_by: me.id })
          .select('id')
          .single();
        if (error) throw error;
        try {
          const rows = await uploadAll(post.id);
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
        if (!keep) {
          const rows = await uploadAll(material.id);
          if (rows.length) {
            const { error: e2 } = await supabase.from('post_media').insert(rows);
            if (e2) { await removeFiles(rows.map((r) => r.storage_path)); throw e2; }
          }
          const oldIds = material.post_media.map((m) => m.id);
          if (oldIds.length) {
            await supabase.from('post_media').delete().in('id', oldIds);
            await removeFiles(material.post_media.map((m) => m.storage_path)).catch(() => {});
          }
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
          <label>Arquivos <span className="muted" style={{ fontWeight: 400 }}>— fotos, vídeos ou PDF; a ordem é a do carrossel</span></label>
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
          {files.length > 0 && (
            <div className="previews">
              {files.map((f, i) => (
                <div className="pv" key={`${f.name}-${f.size}-${f.lastModified}-${i}`}>
                  <Preview file={f} />
                  <span className="n">{i + 1}</span>
                  <button type="button" aria-label="Remover" onClick={() => setFiles((cur) => cur.filter((_, k) => k !== i))}><Icon name="x" /></button>
                  {files.length > 1 && (
                    <div className="mv">
                      <button type="button" aria-label="Mover para trás" onClick={() => move(i, -1)}><Icon name="left" /></button>
                      <button type="button" aria-label="Mover para frente" onClick={() => move(i, 1)}><Icon name="right" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {isVersion && material.post_media.length > 0 && (
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} /> Manter os arquivos atuais (mudar só o texto)
            </label>
          )}
        </div>

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
          <div className="field" style={{ maxWidth: 220 }}>
            <label>Data prevista de publicação <span className="muted" style={{ fontWeight: 400 }}>(opcional)</span></label>
            <input className="input" type="date" name="scheduled_date" />
          </div>
        )}

        <div className="progress" hidden={!busy}><i style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} /></div>
      </form>
    </Modal>
  );
}
