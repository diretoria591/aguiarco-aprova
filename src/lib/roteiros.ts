import { todayYMD } from './format';

export type RtStatus = 'grav' | 'bruto' | 'edit' | 'rec' | 'alt' | 'pronto';

export interface Roteiro {
  id: string;
  client_id: string;
  month: string;
  title: string;
  content: string;
  content_url: string | null;
  content_name: string | null;
  ref_url: string | null;
  pub_date: string | null;
  notes: string;
  author_id: string | null;
  author_name: string;
  batch_id: string | null;
  batch_size: number;
  status: RtStatus;
  alt_note: string | null;
  video_url: string | null;
  photos_url: string | null;
  cover_url: string | null;
  video_type: 'bruto' | 'editado' | null;
  delivery_note: string | null;
  delivered_at: string | null;
  delivered_by: string | null;
  delivered_team: string | null;
  brenda_at: string | null;
  created_at: string;
}

export interface Equipe {
  id: string;
  name: string;
  first_name: string;
  access_token: string;
  active: boolean;
}

export interface RtClient {
  client_id: string;
  team_id: string | null;
  clients: { id: string; name: string; logo_url: string | null } | null;
}

/* ---------- Prazos (regras ajustáveis) ---------- */
/** Captar até 14 dias antes da publicação. */
export const LEAD = 14;
/** A partir de 35 dias da publicação, o que ainda não foi gravado vira prioridade alta. */
export const HIGH = 35;
/** Faltando 7 dias ou menos e ainda sem estar pronto: calendário em risco. */
export const RISK = 7;

export function daysLeft(pub: string | null): number | null {
  if (!pub) return null;
  const [y, m, d] = pub.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = todayYMD().split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400e3);
}

export function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export type Level = 'risk' | 'late' | 'high' | 'wait' | null;
export const LEVEL_LABEL = {
  risk: 'Calendário em risco',
  late: 'Atrasado',
  high: 'Prioridade alta',
  wait: 'Aguardando gravação',
} as const;

export function levelOf(r: { status: RtStatus; pub_date: string | null }): Level {
  if (r.status === 'pronto' || !r.pub_date) return null;
  const d = daysLeft(r.pub_date)!;
  const cap = r.status === 'grav';
  if (d <= RISK) return 'risk';
  if (cap && d < LEAD) return 'late';
  if (cap && d <= HIGH) return 'high';
  if (cap) return 'wait';
  return null;
}

export function whenText(pub: string | null): string {
  const d = daysLeft(pub);
  if (d === null) return '';
  if (d < 0) return `publicação era ${Math.abs(d)} dia${Math.abs(d) > 1 ? 's' : ''} atrás`;
  if (d === 0) return 'publica hoje';
  return `publica em ${d} dia${d > 1 ? 's' : ''}`;
}

/* ---------- Fases (cores do painel) ---------- */
export type Phase = 'grav' | 'gravado' | 'edicao' | 'alter' | 'pronto';
export const PHASE_COLOR: Record<Phase, string> = {
  grav: '#8D8782', gravado: '#7B5EA7', edicao: '#2F7F8F', alter: '#D9A441', pronto: '#55704F',
};
export const phaseOf = (r: { status: RtStatus }): Phase =>
  r.status === 'alt' ? 'alter' : r.status === 'grav' ? 'grav' : r.status === 'bruto' ? 'gravado'
    : r.status === 'edit' || r.status === 'rec' ? 'edicao' : 'pronto';

export const STATUS_TEXT: Record<RtStatus, string> = {
  grav: 'Aguardando gravação',
  bruto: 'Vídeo bruto · sinalizar a Brenda',
  edit: 'Em edição com a Brenda',
  rec: 'Editado recebido · conferir',
  alt: 'Alteração pedida',
  pronto: 'Pronto para o calendário',
};

/** Painéis (cada um é um filtro dentro do mês). "Já gravados" inclui o que já foi para edição ou ficou pronto. */
export const FILTERS: { key: string; label: string; test: (r: Roteiro) => boolean }[] = [
  { key: 'all', label: 'Cadastrados', test: () => true },
  { key: 'grav', label: 'Aguardando gravação', test: (r) => r.status === 'grav' },
  { key: 'gravado', label: 'Já gravados', test: (r) => r.status !== 'grav' },
  { key: 'edicao', label: 'Em edição', test: (r) => r.status === 'edit' || r.status === 'rec' },
  { key: 'alter', label: 'Precisam de alteração', test: (r) => r.status === 'alt' },
  { key: 'pronto', label: 'Prontos para o calendário', test: (r) => r.status === 'pronto' },
];

export const MONTH_RE = /^\d{4}-\d{2}$/;

export function gravacaoLink(token: string, origin?: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || origin || '').replace(/\/$/, '');
  return `${base}/gravacao/${token}`;
}

/** E-mail para liberar o acesso aos vídeos no Drive. */
export const DRIVE_SHARE_EMAIL = process.env.NEXT_PUBLIC_DRIVE_SHARE_EMAIL || 'supervisao@aguiareco.com.br';
