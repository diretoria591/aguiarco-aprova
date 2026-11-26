import 'server-only';

/**
 * Acesso ao Google Docs/Drive pelos links públicos ("qualquer pessoa com o link"),
 * sem login do Google. Usado pelo scanner do calendário.
 */

const UA = 'Mozilla/5.0 (compatible; AprovaScanner/1.0)';

export class DriveError extends Error {
  /** too_big: passou do limite de tamanho do Aprova */
  constructor(message: string, public code: '' | 'too_big' = '') { super(message); }
}

const looksHtml = (type: string | null) => !!type && /text\/html/i.test(type);

/** Markdown do Google Docs (o doc precisa estar aberto para quem tem o link). */
export async function fetchDocMarkdown(docId: string): Promise<string> {
  const res = await fetch(`https://docs.google.com/document/d/${docId}/export?format=md`, {
    headers: { 'User-Agent': UA }, redirect: 'follow', cache: 'no-store',
  });
  if (res.status === 404) throw new DriveError('Não achei esse doc. Confira o link.');
  if (!res.ok || looksHtml(res.headers.get('content-type'))) {
    throw new DriveError('O Aprova não conseguiu abrir o doc. No Google Docs, clique em Compartilhar e deixe "Qualquer pessoa com o link" como Leitor.');
  }
  return res.text();
}

/** Arquivos de uma pasta pública do Drive, em ordem de nome (1, 2, 3… 10). */
export async function listFolder(folderId: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, {
    headers: { 'User-Agent': UA }, cache: 'no-store',
  });
  if (!res.ok) return [];
  const html = await res.text();
  const out: { id: string; name: string }[] = [];
  const re = /id="entry-([\w-]{10,})"[\s\S]*?class="flip-entry-title">([^<]*)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    // subpastas não têm extensão; ficam de fora
    if (/\.[a-z0-9]{2,5}$/i.test(name)) out.push({ id: m[1], name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

const EXT_TYPE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', pdf: 'application/pdf',
};

function nameFrom(disposition: string | null): string {
  if (!disposition) return '';
  const star = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (star) { try { return decodeURIComponent(star[1].trim()); } catch { /* noop */ } }
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain ? plain[1].trim() : '';
}

/** Baixa um arquivo público do Drive. */
export async function downloadDriveFile(fileId: string, maxBytes: number) {
  const res = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`, {
    headers: { 'User-Agent': UA }, redirect: 'follow', cache: 'no-store',
  });
  if (!res.ok || looksHtml(res.headers.get('content-type'))) {
    throw new DriveError('Esse arquivo do Drive não está aberto para quem tem o link (ou foi apagado).');
  }
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > maxBytes) throw new DriveError(`O arquivo tem ${Math.round(len / 1048576)} MB e passa do limite de ${Math.round(maxBytes / 1048576)} MB.`, 'too_big');
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new DriveError(`O arquivo passa do limite de ${Math.round(maxBytes / 1048576)} MB.`, 'too_big');
  const name = nameFrom(res.headers.get('content-disposition')) || fileId;
  const ext = (name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? '').toLowerCase();
  let type = (res.headers.get('content-type') || '').split(';')[0].trim();
  if (!type || type === 'application/octet-stream' || type === 'binary/octet-stream') type = EXT_TYPE[ext] ?? 'application/octet-stream';
  return { buf, name, type, ext };
}

const unescape = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * Tudo o que está numa pasta pública do Drive (arquivos e subpastas) e o nome
 * da pasta. Diferente de listFolder, mantém arquivos sem extensão no nome
 * (o Drive esconde a extensão de alguns, como a capa do destaque).
 * Devolve null se a pasta não abrir para quem tem o link.
 */
export async function listFolderEntries(folderId: string): Promise<{ title: string; entries: { id: string; name: string; folder: boolean }[] } | null> {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}`, {
    headers: { 'User-Agent': UA }, cache: 'no-store',
  });
  if (!res.ok || !looksHtml(res.headers.get('content-type'))) return null;
  const html = await res.text();
  if (!html.includes('flip-entries')) return null;
  const title = unescape(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').trim();
  const entries: { id: string; name: string; folder: boolean }[] = [];
  const re = /id="entry-([\w-]{10,})"[\s\S]*?<a href="([^"]*)"[\s\S]*?class="flip-entry-title">([^<]*)</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    entries.push({ id: m[1], name: unescape(m[3]).trim(), folder: /\/folders\//.test(m[2]) });
  }
  return { title, entries };
}
