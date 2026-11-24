/* Relatório mensal por cliente: números do Aprova + textos e métricas preenchidos pela equipe. */
import { monthOf } from './format';
import { DEFAULT_REVISION_LIMIT, roundMap } from './rounds';
import type { Comment, PostFormat, PostStatus } from './types';

export type RelatorioStatus = 'rascunho' | 'pronto';

export interface Relatorio {
  id: string;
  client_id: string;
  ref_month: string;
  status: RelatorioStatus;
  summary: string;
  highlights: string;
  next_steps: string;
  metrics: Partial<Record<MetricKey, string>>;
  reviewed_by: string;
  reviewed_at: string | null;
  updated_at: string;
}

/** Números do Instagram digitados pela equipe (até a API da Meta entrar). */
export const METRICS = [
  { key: 'seguidores', label: 'Seguidores no fim do mês' },
  { key: 'novos_seguidores', label: 'Novos seguidores' },
  { key: 'alcance', label: 'Contas alcançadas' },
  { key: 'visualizacoes', label: 'Visualizações' },
  { key: 'interacoes', label: 'Interações' },
  { key: 'visitas_perfil', label: 'Visitas ao perfil' },
  { key: 'cliques_link', label: 'Cliques no link' },
] as const;
export type MetricKey = (typeof METRICS)[number]['key'];

export type ReportPost = {
  id: string; title: string; caption: string; format: PostFormat; status: PostStatus;
  scheduled_date: string | null; scheduled_at: string | null; sent_at: string; created_at: string;
  approved_at: string | null;
  post_media: { file_url: string; file_type: string; order_index: number }[];
  comments: Pick<Comment, 'id' | 'author_role' | 'kind' | 'agency_error' | 'created_at'>[];
};

export const REPORT_POST_SELECT =
  'id,title,caption,format,status,scheduled_date,scheduled_at,sent_at,created_at,approved_at,' +
  'post_media(file_url,file_type,order_index), comments(id,author_role,kind,agency_error,created_at)';

/** Mês do conteúdo: data de publicação planejada, ou o envio se não tiver data. */
export const reportMonth = (p: { scheduled_date: string | null; sent_at: string }) =>
  p.scheduled_date ? p.scheduled_date.slice(0, 7) : monthOf(p.sent_at);

export function coverOf(p: ReportPost): string | null {
  const m = [...p.post_media].sort((a, b) => a.order_index - b.order_index)
    .find((x) => x.file_type.startsWith('cover/image/') || x.file_type.startsWith('image/'));
  return m?.file_url ?? null;
}

export type ReportStats = {
  total: number;
  published: number;
  waitingSchedule: number;
  inProgress: number;
  rejected: number;
  byFormat: { format: PostFormat; n: number }[];
  firstTry: number;
  approved: number;
  roundsUsed: number;
  extraRounds: number;
  /** Horas médias entre o envio e a aprovação. */
  avgApprovalHours: number | null;
};

export function reportStats(posts: ReportPost[], revisionLimit?: number | null): ReportStats {
  const limit = revisionLimit ?? DEFAULT_REVISION_LIMIT;
  const approved = posts.filter((p) => p.status === 'approved');
  const fmt = new Map<PostFormat, number>();
  approved.forEach((p) => fmt.set(p.format, (fmt.get(p.format) ?? 0) + 1));
  let roundsUsed = 0, extraRounds = 0, firstTry = 0;
  for (const p of posts) {
    const sorted = [...p.comments].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const rounds = [...roundMap(sorted as Comment[], limit).values()].filter((r) => !r.free);
    roundsUsed += rounds.length;
    extraRounds += rounds.filter((r) => r.extra).length;
    if (p.status === 'approved' && !rounds.length) firstTry++;
  }
  const times = approved.filter((p) => p.approved_at)
    .map((p) => (Date.parse(p.approved_at!) - Date.parse(p.created_at)) / 3600e3)
    .filter((h) => h >= 0);
  return {
    total: posts.length,
    published: approved.filter((p) => p.scheduled_at).length,
    waitingSchedule: approved.filter((p) => !p.scheduled_at).length,
    inProgress: posts.filter((p) => p.status === 'pending' || p.status === 'adjustment_requested').length,
    rejected: posts.filter((p) => p.status === 'rejected').length,
    byFormat: [...fmt.entries()].map(([format, n]) => ({ format, n })).sort((a, b) => b.n - a.n),
    firstTry,
    approved: approved.length,
    roundsUsed,
    extraRounds,
    avgApprovalHours: times.length ? times.reduce((s, h) => s + h, 0) / times.length : null,
  };
}

export function fmtHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 1) return 'menos de 1 h';
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}
