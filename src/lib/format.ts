/* Datas sempre no fuso da agência, para servidor e navegador concordarem. */
const TZ = process.env.NEXT_PUBLIC_TIMEZONE || 'America/Sao_Paulo';
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function parts(d: Date) {
  const o: Record<string, number> = {};
  partsFmt.formatToParts(d).forEach((p) => { if (p.type !== 'literal') o[p.type] = Number(p.value); });
  return { y: o.year, m: o.month, d: o.day, h: o.hour, min: o.minute };
}
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (p: { y: number; m: number; d: number }) => `${p.y}-${p.m}-${p.d}`;

export function fmtDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '';
  const p = parts(new Date(iso));
  const today = parts(new Date());
  const yest = parts(new Date(Date.now() - 86400e3));
  const t = `${pad(p.h)}:${pad(p.min)}`;
  if (dayKey(p) === dayKey(today)) return withTime ? `hoje às ${t}` : 'hoje';
  if (dayKey(p) === dayKey(yest)) return withTime ? `ontem às ${t}` : 'ontem';
  const base = `${p.d} ${MONTHS[p.m - 1]}${p.y !== today.y ? ' ' + p.y : ''}`;
  return withTime ? `${base} às ${t}` : base;
}

export function fmtAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d === 1 ? 'ontem' : `há ${d} dias`; }
  return fmtDate(iso, false);
}

export function fmtDay(ymd: string | null | undefined): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== parts(new Date()).y ? ' ' + y : ''}`;
}

export function greet(): string {
  const h = parts(new Date()).h;
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export const initials = (n: string | null | undefined) =>
  String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const firstName = (n: string | null | undefined) => String(n || '').trim().split(/\s+/)[0];

/* ---------- Organização por mês ---------- */
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** Mês (AAAA-MM) de um instante, no fuso da agência. */
export function monthOf(iso: string): string {
  const p = parts(new Date(iso));
  return `${p.y}-${pad(p.m)}`;
}
/** Mês atual (AAAA-MM), no fuso da agência. */
export const currentMonth = () => monthOf(new Date().toISOString());
/** Soma meses a uma chave AAAA-MM. */
export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}
/** "novembro" / "Novembro 2026" */
export function monthName(key: string): string {
  return MONTHS_FULL[Number(key.slice(5, 7)) - 1] ?? '';
}
export function monthLabel(key: string): string {
  const n = monthName(key);
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${key.slice(0, 4)}`;
}
/** Mês de envio — é o que o cliente vê no link dele. */
export const sentMonth = (p: { sent_at: string }) => monthOf(p.sent_at);
/** Mês de publicação (ou de envio, se não houver data) — usado no painel da agência. */
export const planMonth = (p: { scheduled_date: string | null; sent_at: string }) =>
  p.scheduled_date ? p.scheduled_date.slice(0, 7) : monthOf(p.sent_at);
