/* Pedidos de alteração: quem faz, prazo pelos dias de entrega de cada pessoa e a versão em andamento. */

export const WEEKDAYS = [
  { n: 1, short: 'seg', long: 'segunda' },
  { n: 2, short: 'ter', long: 'terça' },
  { n: 3, short: 'qua', long: 'quarta' },
  { n: 4, short: 'qui', long: 'quinta' },
  { n: 5, short: 'sex', long: 'sexta' },
] as const;
const LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Pessoa que pode fazer alterações (perfil da equipe com "faz alterações"). */
export type Doer = { id: string; name: string; nickname: string; email: string; job: string; days: number[]; hours: string };
export const doerName = (d: { name: string; nickname?: string | null }) => (d.nickname || '').trim() || d.name.trim().split(/\s+/)[0] || 'Equipe';

/** Dia da semana ISO (1 = segunda … 7 = domingo) de uma data YYYY-MM-DD. */
export function isoWeekday(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** "ter, 16/12" */
export function dayLabel(ymd: string | null | undefined, long = false): string {
  if (!ymd) return '';
  const [, m, d] = ymd.split('-');
  const w = isoWeekday(ymd) % 7;
  return `${long ? LONG[w] : SHORT[w]}, ${d}/${m}`;
}

/** Sábado e domingo ninguém entrega; nos outros dias, só os marcados da pessoa. */
export function worksOn(days: number[], ymd: string): boolean {
  const w = isoWeekday(ymd);
  return w <= 5 && (days.length ? days.includes(w) : true);
}

/** Próximo dia de entrega da pessoa depois de `after` (nunca o próprio dia: ninguém faz "na hora"). */
export function nextWorkday(days: number[], after: string): string {
  let d = addDays(after, 1);
  for (let i = 0; i < 21; i++, d = addDays(d, 1)) if (worksOn(days, d)) return d;
  return addDays(after, 1);
}

export type DueWarning = { kind: 'off' | 'late' | 'tight'; text: string };

/**
 * Avisos sobre o prazo escolhido: dia em que a pessoa não entrega, prazo depois da publicação
 * ou no próprio dia (não sobra tempo para revisar e o cliente aprovar).
 */
export function dueWarnings(o: { who: string; days: number[]; due: string; publish: string | null; today: string }): DueWarning[] {
  const out: DueWarning[] = [];
  if (o.due < o.today) out.push({ kind: 'late', text: `O prazo de ${o.who} (${dayLabel(o.due)}) já passou.` });
  if (!worksOn(o.days, o.due)) {
    const w = isoWeekday(o.due);
    out.push({ kind: 'off', text: w > 5 ? `${dayLabel(o.due, true)} é fim de semana: ninguém entrega.` : `${o.who} não entrega às ${LONG[w % 7]}s.` });
  }
  if (o.publish) {
    if (o.due > o.publish) out.push({ kind: 'late', text: `A publicação é ${dayLabel(o.publish, true)} e o prazo de ${o.who} é ${dayLabel(o.due, true)}: vai passar da data de publicação.` });
    else if (o.due === o.publish) out.push({ kind: 'tight', text: `O prazo de ${o.who} cai no dia da publicação (${dayLabel(o.publish, true)}): não sobra tempo para revisar e o cliente aprovar.` });
  }
  return out;
}

/** Versão montada até agora (o cliente só vê depois do "Tudo certo"). */
export type PlanRef = { src: 'live' | 'staged'; id: string };
export type Plan = { caption: string; items: PlanRef[]; cover: PlanRef | null };
/** Arquivos guardados da versão em andamento aparecem no formulário com este prefixo no id. */
export const STAGED_PREFIX = 's:';

export type AltStatus = 'fazendo' | 'revisao' | 'enviada' | 'cancelada';
export type EtapaStatus = 'aguardando' | 'fazendo' | 'feita';
export type Etapa = {
  id: string; alteracao_id: string; ordem: number; profile_id: string | null; name: string; email: string;
  due_date: string | null; status: EtapaStatus; note: string; summary: string; back_note: string;
  started_at: string | null; done_at: string | null;
};
export type StagedMedia = { id: string; alteracao_id: string; post_id: string; file_url: string; storage_path: string | null; file_type: string; file_name: string; order_index: number };
export type Alteracao = {
  id: string; client_id: string; post_id: string; request_comment_id: string | null; request_text: string;
  status: AltStatus; plan: Plan | null; publish_date: string | null; created_by_name: string; created_at: string;
  /** observação opcional de quem encaminhou (explica o pedido do cliente para a equipe) */
  forward_note: string;
  review_note: string; sent_at: string | null; sent_by: string;
  alteracao_etapas: Etapa[]; alteracao_media: StagedMedia[];
};

export const etapasOf = (a: Pick<Alteracao, 'alteracao_etapas'>) => [...(a.alteracao_etapas ?? [])].sort((x, y) => x.ordem - y.ordem);
export const currentEtapa = (a: Pick<Alteracao, 'alteracao_etapas'>) => etapasOf(a).find((e) => e.status === 'fazendo') ?? null;

/** Data de publicação do post: a agendada (publish_at) ou a prevista (scheduled_date). */
export function publishDateOf(p: { publish_at?: string | null; scheduled_date?: string | null }): string | null {
  if (p.publish_at) {
    const d = new Date(p.publish_at);
    const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    return s;
  }
  return p.scheduled_date ? p.scheduled_date.slice(0, 10) : null;
}
