'use client';

import { createClient } from './supabase/client';
import { MEDIA_BUCKET, supabaseEnv } from './supabase/env';

const EXT_RE = /\.([a-z0-9]{1,8})$/i;

export function safePath(prefix: string, file: File, index = 0) {
  const ext = (file.name.match(EXT_RE)?.[1] || file.type.split('/')[1] || 'bin').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}/${Date.now()}-${index}-${rand}.${ext}`;
}

/**
 * Envia um arquivo direto do navegador para o Supabase Storage (sem passar
 * pela Vercel, então não há limite de 4,5 MB) reportando o progresso real.
 */
export async function uploadFile(path: string, file: File, onProgress?: (loaded: number) => void): Promise<string> {
  const supabase = createClient();
  const { url, anonKey } = supabaseEnv();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sua sessão expirou. Entre novamente.');

  const endpoint = `${url}/storage/v1/object/${MEDIA_BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`;
  await new Promise<void>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', endpoint);
    x.setRequestHeader('Authorization', `Bearer ${token}`);
    x.setRequestHeader('apikey', anonKey);
    x.setRequestHeader('x-upsert', 'false');
    x.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    x.setRequestHeader('cache-control', 'max-age=31536000');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded); };
    x.onload = () => {
      if (x.status < 300) return resolve();
      let msg = 'Falha no envio.';
      try { const d = JSON.parse(x.responseText); msg = d.message || d.error || msg; } catch { /* noop */ }
      if (x.status === 413 || /size/i.test(msg)) msg = `“${file.name}” é maior que o limite permitido.`;
      reject(new Error(msg));
    };
    x.onerror = () => reject(new Error('Conexão interrompida durante o envio.'));
    x.send(file);
  });
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeFiles(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (!list.length) return;
  await createClient().storage.from(MEDIA_BUCKET).remove(list);
}
