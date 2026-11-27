/* Projetos especiais: painel de tarefas, tarefas de cada pessoa, e-mails e relatório de sexta. */

export type TarefaStatus = 'a_fazer' | 'andamento' | 'travado' | 'saiu' | 'cancelada';

export interface Projeto {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  gmail_domains: string[];
  client_name: string;
  report_to: string;
  report_cc: string;
  contatos: Contato[];
  rotinas: Rotina[];
}

export type Contato = { nome: string; email: string; cc?: string };

/** Rotina que vira tarefa sozinha: toda semana (weekday 1 = segunda) ou todo mês (day). */
export type Rotina = { key: string; title: string; owner?: string; weekday?: number; day?: number; detail?: string };

export interface Item { id: string; tarefa_id: string; label: string; note: string; position: number; done: boolean; done_at: string | null; done_by: string }
export interface Mov { id: string; tarefa_id: string; author_name: string; text: string; created_at: string }

export interface Tarefa {
  id: string;
  projeto_id: string;
  title: string;
  detail: string;
  owner_id: string | null;
  owner_name: string;
  status: TarefaStatus;
  due_date: string | null;
  waiting_on: string;
  cobrar_em: string | null;
  kind: 'tarefa' | 'rotina' | 'ideia';
  priority: 'alta' | 'media' | 'baixa';
  source: string;
  source_url: string;
  link_url: string;
  internal: boolean;
  done_at: string | null;
  done_by: string;
  created_at: string;
  updated_at: string;
  projeto_itens?: Item[];
  projeto_movs?: Mov[];
}

export interface ProjEmail {
  id: string; gmail_id: string; thread_id: string; from_name: string; from_email: string; to_list: string; cc_list: string;
  subject: string; snippet: string; sent_at: string; direction: 'in' | 'out'; dismissed_at: string | null; tarefa_id: string | null;
}

export const STATUS_LABEL: Record<TarefaStatus, string> = {
  a_fazer: 'A fazer', andamento: 'Em andamento', travado: 'Travado · esperando resposta', saiu: 'Já saiu', cancelada: 'Cancelada',
};

/* ---------- Datas no fuso do projeto (ex.: Lisboa) ---------- */
export function ymdIn(tz: string, d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
export function hourIn(tz: string, d: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d));
}
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
/** 1 = segunda … 7 = domingo */
export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
}
/** Soma dias úteis (seg a sex). */
export function addBusinessDays(ymd: string, n: number): string {
  let d = ymd;
  let left = n;
  while (left > 0) { d = addDaysYmd(d, 1); if (weekdayOf(d) <= 5) left--; }
  return d;
}
/** Segunda-feira da semana de `ymd`. */
export const mondayOf = (ymd: string) => addDaysYmd(ymd, 1 - weekdayOf(ymd));

const DOW = ['', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
/** "qua 02/12" */
export function dia(ymd: string | null | undefined): string {
  if (!ymd) return '';
  return `${DOW[weekdayOf(ymd)]} ${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
}
/** "26/11 19:08" no fuso do projeto */
export function quando(iso: string, tz: string): string {
  const f = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return f.format(new Date(iso)).replace(',', '');
}

/** Atrasada: prazo passou e ainda não saiu. Travada usa a data de cobrar. */
export function isLate(t: Pick<Tarefa, 'status' | 'due_date' | 'cobrar_em'>, today: string): boolean {
  if (t.status === 'saiu' || t.status === 'cancelada') return false;
  if (t.status === 'travado') return !!t.cobrar_em && t.cobrar_em < today;
  return !!t.due_date && t.due_date < today;
}

/* ---------- Abrir o Gmail e a Agenda já preenchidos (o Aprova nunca envia e-mail) ---------- */
export function gmailCompose(o: { to?: string; cc?: string; subject?: string; body?: string }): string {
  const p = new URLSearchParams({ view: 'cm', fs: '1' });
  if (o.to) p.set('to', o.to);
  if (o.cc) p.set('cc', o.cc);
  if (o.subject) p.set('su', o.subject);
  if (o.body) p.set('body', o.body);
  return `https://mail.google.com/mail/?${p.toString()}`;
}
/** Abre a conversa no Gmail de quem clicar (busca pelo assunto: o id da conversa muda de uma caixa para outra). */
export function gmailSearch(subject: string, from?: string): string {
  const clean = subject.replace(/^\s*((re|res|fw|fwd|enc)\s*:\s*)+/i, '').replace(/"/g, '').trim();
  const q = [clean ? `subject:"${clean}"` : '', from ? `from:${from}` : ''].filter(Boolean).join(' ');
  return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`;
}
export function calendarInvite(o: { title: string; details?: string; guests?: string }): string {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: o.title });
  if (o.details) p.set('details', o.details);
  if (o.guests) p.set('add', o.guests);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** E-mail do cliente ou de parceiro (pelo domínio). */
export function fromProject(email: string, domains: string[]): boolean {
  const e = email.toLowerCase();
  return domains.some((d) => e.endsWith(`@${d.toLowerCase()}`) || e.endsWith(`.${d.toLowerCase()}`));
}

export const firstWord = (s: string) => s.trim().split(/\s+/)[0] ?? '';
