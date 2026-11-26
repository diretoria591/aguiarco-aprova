'use client';

import { useEffect, useMemo, useState } from 'react';
import { safePath, uploadFile } from '@/lib/upload';
import { isVideoName, type ScanFile } from '@/lib/scanner';
import { Icon } from '@/components/icon';

/** Arquivo de um post no scanner: do Drive ou escolhido no aparelho. */
export type Media = { src: 'drive'; id: string; name: string } | { src: 'local'; file: File; name: string };

export const fromScan = (f: ScanFile): Media => ({ src: 'drive', id: f.id, name: f.name });
export const isVideo = (m: Media) => (m.src === 'local' ? m.file.type.startsWith('video/') : isVideoName(m.name));

export function Thumb({ m, className = 'sc-thumb' }: { m: Media | null; className?: string }) {
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

/** Guarda um arquivo no Storage do Aprova (do Drive, pelo servidor; do aparelho, direto). */
export async function storeMedia(postId: string, m: Media, index: number): Promise<{ url: string; path: string; type: string; name: string }> {
  if (m.src === 'local') {
    const path = safePath(`posts/${postId}`, m.file, index);
    const fileUrl = await uploadFile(path, m.file);
    return { url: fileUrl, path, type: m.file.type, name: m.file.name };
  }
  const res = await fetch('/api/scanner/arquivo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, driveId: m.id, index }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${m.name}: ${data.error || 'falha ao baixar do Drive.'}`);
  return data as { url: string; path: string; type: string; name: string };
}
