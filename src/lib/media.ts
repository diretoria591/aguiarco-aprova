import type { PostMedia } from './types';

/**
 * Tipos especiais guardados em post_media.file_type (sem mudar o banco):
 *  - "cover/<mime>"     → capa personalizada (Reels). Não entra no carrossel.
 *  - "embed/<provedor>" → vídeo por link, exibido em <iframe>. file_url = URL de embed.
 */
export const COVER_PREFIX = 'cover/';
export const EMBED_PREFIX = 'embed/';

export const isCover = (m: { file_type: string }) => m.file_type.startsWith(COVER_PREFIX);
export const isEmbed = (m: { file_type: string }) => m.file_type.startsWith(EMBED_PREFIX);
export const isVideoLike = (m: { file_type: string }) => m.file_type.startsWith('video/') || isEmbed(m);

/** Separa a capa dos itens que aparecem no visualizador/carrossel. */
export function splitMedia<T extends Pick<PostMedia, 'file_type'>>(media: T[]) {
  return { cover: media.find(isCover) ?? null, items: media.filter((m) => !isCover(m)) };
}

export type Embed = { provider: string; label: string; src: string; thumb: string | null; original: string };

const PROVIDER_LABEL: Record<string, string> = {
  youtube: 'YouTube', vimeo: 'Vimeo', drive: 'Google Drive', instagram: 'Instagram',
  tiktok: 'TikTok', loom: 'Loom', canva: 'Canva', link: 'Link',
};

/**
 * Converte um link (ou um código <iframe …>) em URL de incorporação.
 * Aceita YouTube (inclusive Shorts), Vimeo, Google Drive, Instagram, TikTok,
 * Loom, Canva e qualquer outro endereço https já pronto para iframe.
 */
export function parseVideoLink(input: string): Embed | null {
  let raw = input.trim();
  const iframe = raw.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  if (iframe) raw = iframe[1].replace(/&amp;/g, '&');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol === 'http:') u.protocol = 'https:';
  if (u.protocol !== 'https:' || !u.hostname.includes('.')) return null;

  const host = u.hostname.replace(/^www\.|^m\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const make = (provider: string, src: string, thumb: string | null = null): Embed =>
    ({ provider, label: PROVIDER_LABEL[provider] ?? 'Link', src, thumb, original: input.trim() });

  // YouTube
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    let id: string | null = null;
    if (host === 'youtu.be') id = parts[0] ?? null;
    else if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1] ?? null;
    if (id && /^[\w-]{6,}$/.test(id)) {
      return make('youtube', `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`, `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);
    }
    return null;
  }
  // Vimeo
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = parts.find((p) => /^\d+$/.test(p));
    if (!id) return null;
    const idx = parts.indexOf(id);
    const hash = u.searchParams.get('h') || (parts[idx + 1] && /^[\da-f]+$/i.test(parts[idx + 1]) ? parts[idx + 1] : null);
    return make('vimeo', `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`);
  }
  // Google Drive
  if (host === 'drive.google.com') {
    const id = parts[0] === 'file' && parts[1] === 'd' ? parts[2] : u.searchParams.get('id');
    if (!id) return null;
    return make('drive', `https://drive.google.com/file/d/${id}/preview`);
  }
  // Instagram
  if (host === 'instagram.com') {
    const i = parts.findIndex((p) => ['p', 'reel', 'reels', 'tv'].includes(p));
    if (i < 0 || !parts[i + 1]) return null;
    const kind = parts[i] === 'reels' ? 'reel' : parts[i];
    return make('instagram', `https://www.instagram.com/${kind}/${parts[i + 1]}/embed`);
  }
  // TikTok
  if (host === 'tiktok.com') {
    const i = parts.indexOf('video');
    const id = i >= 0 ? parts[i + 1] : null;
    if (!id || !/^\d+$/.test(id)) return null;
    return make('tiktok', `https://www.tiktok.com/embed/v2/${id}`);
  }
  // Loom
  if (host === 'loom.com') {
    const i = parts.findIndex((p) => p === 'share' || p === 'embed');
    if (i < 0 || !parts[i + 1]) return null;
    return make('loom', `https://www.loom.com/embed/${parts[i + 1]}`);
  }
  // Canva (link "Compartilhar → Mais → Incorporar" ou link de visualização)
  if (host === 'canva.com') {
    const i = parts.indexOf('design');
    if (i < 0 || !parts[i + 1]) return null;
    return make('canva', `https://www.canva.com/design/${parts.slice(i + 1, i + 3).join('/')}/view?embed`);
  }
  // Qualquer outro endereço https (ex.: player já pronto para iframe)
  return make('link', u.toString());
}

/** Miniatura de um vídeo por link (quando o provedor oferece). */
export function embedThumb(url: string): string | null {
  const id = url.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export const embedLabel = (fileType: string) => PROVIDER_LABEL[fileType.slice(EMBED_PREFIX.length)] ?? 'Link';

/* ------------------------------------------------------------------
 * Materiais para agendar: cada arquivo do post, identificado (vídeo,
 * capa, tela do carrossel…), com link para abrir e para baixar.
 * ------------------------------------------------------------------ */
export type MaterialKind = 'video' | 'cover' | 'image' | 'file';
export type Material = {
  key: string;
  kind: MaterialKind;
  label: string;
  /** texto pequeno: origem + nome do arquivo */
  detail: string;
  /** imagem para miniatura (quando houver) */
  thumb: string | null;
  /** abre o arquivo/vídeo em outra aba */
  openUrl: string | null;
  /** baixa direto (null quando o provedor não permite, ex.: YouTube) */
  downloadUrl: string | null;
  /** texto do botão de download */
  downloadLabel: string;
  source: 'drive' | 'upload' | 'link';
};

const driveId = (url: string) => url.match(/drive\.google\.com\/file\/d\/([\w-]+)/)?.[1] ?? null;

/** Link do Supabase Storage que já baixa com o nome original do arquivo. */
export function storageDownloadUrl(url: string, name: string) {
  return `${url}${url.includes('?') ? '&' : '?'}download=${encodeURIComponent(name || 'arquivo')}`;
}

export function materialsOf(post: { format: string; post_media: PostMedia[] }): Material[] {
  const sorted = [...post.post_media].sort((a, b) => a.order_index - b.order_index);
  const { cover, items } = splitMedia(sorted);
  const videos = items.filter(isVideoLike);
  const images = items.filter((m) => m.file_type.startsWith('image/'));
  const reels = post.format === 'reels';
  const out: Material[] = [];
  let img = 0;

  items.forEach((m, i) => {
    if (isEmbed(m)) {
      const provider = m.file_type.slice(EMBED_PREFIX.length);
      const id = provider === 'drive' ? driveId(m.file_url) : null;
      const n = videos.length > 1 ? ` ${videos.indexOf(m) + 1}` : '';
      out.push({
        key: m.id, kind: 'video', source: provider === 'drive' ? 'drive' : 'link',
        label: `Vídeo${reels ? ' do Reels' : ''}${n}`,
        detail: `${provider === 'drive' ? 'No Google Drive' : embedLabel(m.file_type)}`,
        thumb: embedThumb(m.file_url),
        openUrl: id ? `https://drive.google.com/file/d/${id}/view` : (/^https?:\/\//.test(m.file_name) ? m.file_name : m.file_url),
        downloadUrl: id ? `https://drive.google.com/uc?export=download&id=${id}` : null,
        downloadLabel: 'Clique aqui para baixar o vídeo',
      });
    } else if (m.file_type.startsWith('video/')) {
      const n = videos.length > 1 ? ` ${videos.indexOf(m) + 1}` : '';
      out.push({
        key: m.id, kind: 'video', source: 'upload', label: `Vídeo${reels ? ' do Reels' : ''}${n}`,
        detail: `Arquivo enviado · ${m.file_name}`, thumb: null,
        openUrl: m.file_url, downloadUrl: storageDownloadUrl(m.file_url, m.file_name),
        downloadLabel: 'Clique aqui para baixar o vídeo',
      });
    } else if (m.file_type.startsWith('image/')) {
      img++;
      const many = images.length > 1;
      out.push({
        key: m.id, kind: 'image', source: 'upload',
        label: many ? `Tela ${img} de ${images.length}` : post.format === 'stories' ? 'Imagem do stories' : 'Imagem do post',
        detail: `Imagem estática · ${m.file_name}`, thumb: m.file_url,
        openUrl: m.file_url, downloadUrl: storageDownloadUrl(m.file_url, m.file_name),
        downloadLabel: many ? `Baixar tela ${img}` : 'Clique aqui para baixar a imagem',
      });
    } else {
      out.push({
        key: m.id || String(i), kind: 'file', source: 'upload', label: 'Arquivo', detail: m.file_name, thumb: null,
        openUrl: m.file_url, downloadUrl: storageDownloadUrl(m.file_url, m.file_name),
        downloadLabel: 'Clique aqui para baixar o arquivo',
      });
    }
  });

  if (cover) {
    out.push({
      key: cover.id, kind: 'cover', source: 'upload', label: `Capa${reels ? ' do Reels' : ''}`,
      detail: `Imagem estática · ${cover.file_name}`, thumb: cover.file_url,
      openUrl: cover.file_url, downloadUrl: storageDownloadUrl(cover.file_url, cover.file_name),
      downloadLabel: 'Clique aqui para baixar a capa',
    });
  }
  return out;
}
