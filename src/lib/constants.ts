import type { IconName } from '@/components/icon';
import type { Counts, PostFormat, PostStatus } from './types';

export const TYPES: Record<PostFormat, { label: string; icon: IconName }> = {
  foto: { label: 'Foto', icon: 'image' },
  video: { label: 'Vídeo', icon: 'video' },
  reels: { label: 'Reels', icon: 'video' },
  carrossel: { label: 'Carrossel', icon: 'layers' },
  arte: { label: 'Arte', icon: 'pen' },
  stories: { label: 'Stories', icon: 'image' },
  texto: { label: 'Texto', icon: 'text' },
};

/** Classe CSS do protótipo para cada status do banco. */
export const STATUS_CLASS: Record<PostStatus, keyof Counts> = {
  pending: 'pendente',
  adjustment_requested: 'ajustes',
  approved: 'aprovado',
};
export const STATUS_LABEL: Record<PostStatus, string> = {
  pending: 'Aguardando aprovação',
  adjustment_requested: 'Ajustes solicitados',
  approved: 'Aprovado',
};
export const STATUS_SHORT: Record<PostStatus, string> = {
  pending: 'Aguardando',
  adjustment_requested: 'Em ajuste',
  approved: 'Aprovado',
};

export function countStatuses(posts: { status: PostStatus }[]): Counts {
  const o: Counts = { pendente: 0, ajustes: 0, aprovado: 0 };
  posts.forEach((p) => o[STATUS_CLASS[p.status]]++);
  return o;
}

export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB) || 50;

export function portalLink(token: string, origin?: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || origin || '').replace(/\/$/, '');
  return `${base}/aprovar/${token}`;
}
