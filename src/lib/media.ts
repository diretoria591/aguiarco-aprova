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
