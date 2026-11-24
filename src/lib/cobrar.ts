/* "Cobrar hoje": quem tem conteúdo parado esperando aprovação. */
import { firstName, fmtDay, todayYMD } from './format';
import { portalLink } from './constants';

/** Conteúdo aguardando há mais que isso entra na lista. */
export const WAIT_HOURS = 48;
/** Publicação em até N dias: entra na hora, mesmo enviado há pouco. */
export const URGENT_DAYS = 3;
/** Depois de avisar/cobrar, o cliente sai da lista por esse tempo (urgente volta antes). */
export const COOLDOWN_HOURS = 48;
export const URGENT_COOLDOWN_HOURS = 24;

/** Tipos de registro que contam como "já falamos com o cliente". */
export const CONTACT_TYPES = ['aviso', 'cobranca'];

export type CobrarPostRow = {
  id: string; client_id: string; title: string; sent_at: string;
  first_viewed_at: string | null; scheduled_date: string | null;
};
export type CobrarClientRow = {
  id: string; name: string; contact_name: string; whatsapp: string; access_token: string; logo_url: string | null;
};
export type CobrarContactRow = { client_id: string; created_at: string; actor: string; type: string };

export type CobrarPost = CobrarPostRow & { waitingDays: number; daysToPublish: number | null; urgent: boolean };
export type CobrarItem = {
  client: CobrarClientRow;
  posts: CobrarPost[];
  /** Conteúdos que já passaram do prazo ou são urgentes. */
  late: number;
  urgent: boolean;
  oldestDays: number;
  lastContact: CobrarContactRow | null;
};

const H = 3600e3;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86400e3);

export function buildCobrar(
  clients: CobrarClientRow[], posts: CobrarPostRow[], contacts: CobrarContactRow[], now = Date.now(),
): CobrarItem[] {
  const today = todayYMD();
  const lastByClient = new Map<string, CobrarContactRow>();
  for (const c of contacts) {
    const prev = lastByClient.get(c.client_id);
    if (!prev || c.created_at > prev.created_at) lastByClient.set(c.client_id, c);
  }

  const items: CobrarItem[] = [];
  for (const client of clients) {
    const mine = posts.filter((p) => p.client_id === client.id).map((p): CobrarPost => {
      const daysToPublish = p.scheduled_date ? dayDiff(p.scheduled_date.slice(0, 10), today) : null;
      return {
        ...p,
        waitingDays: Math.floor((now - Date.parse(p.sent_at)) / 86400e3),
        daysToPublish,
        urgent: daysToPublish !== null && daysToPublish <= URGENT_DAYS,
      };
    });
    if (!mine.length) continue;

    const lastContact = lastByClient.get(client.id) ?? null;
    const sinceContact = lastContact ? (now - Date.parse(lastContact.created_at)) / H : Infinity;
    const late = mine.filter((p) => p.urgent || now - Date.parse(p.sent_at) >= WAIT_HOURS * H);
    if (!late.length) continue;
    const urgent = late.some((p) => p.urgent);
    if (sinceContact < (urgent ? URGENT_COOLDOWN_HOURS : COOLDOWN_HOURS)) continue;

    // a mensagem leva todos os que aguardam, não só os atrasados
    mine.sort((a, b) => (a.daysToPublish ?? 9999) - (b.daysToPublish ?? 9999) || a.sent_at.localeCompare(b.sent_at));
    items.push({
      client, posts: mine, late: late.length, urgent, lastContact,
      oldestDays: Math.max(...mine.map((p) => p.waitingDays)),
    });
  }
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.oldestDays - a.oldestDays || a.client.name.localeCompare(b.client.name));
}

export function publishLabel(d: number | null, ymd: string | null): string {
  if (d === null || !ymd) return '';
  if (d < 0) return `data de publicação passou (${fmtDay(ymd)})`;
  if (d === 0) return 'publica hoje';
  if (d === 1) return 'publica amanhã';
  return `publica ${fmtDay(ymd)}`;
}

export function reminderMessage(item: CobrarItem, origin?: string): string {
  const c = item.client;
  const nome = firstName(c.contact_name) || c.name;
  const n = item.posts.length;
  const lista = item.posts.slice(0, 6).map((p) => {
    const when = p.daysToPublish !== null && p.daysToPublish >= 0 ? ` (${publishLabel(p.daysToPublish, p.scheduled_date)})` : '';
    return `• ${p.title}${when}`;
  }).join('\n');
  const head = n === 1 ? 'tem 1 conteúdo esperando a sua aprovação' : `tem ${n} conteúdos esperando a sua aprovação`;
  const pressa = item.urgent ? `\n\n${n === 1 ? 'A data de publicação já está chegando' : 'Alguns já estão com a data de publicação chegando'}, então se conseguir dar uma olhadinha hoje, ajuda muito a gente a manter tudo no prazo.` : '';
  return `Oi, ${nome}! Tudo bem? 🤍\n\nPassando para lembrar que ${head}:\n\n${lista}${n > 6 ? `\n• e mais ${n - 6}` : ''}${pressa}\n\nÉ só abrir o link para ver, aprovar ou pedir algum ajuste:\n${portalLink(c.access_token, origin)}\n\nQualquer dúvida, estamos por aqui!\nEquipe Aguiar&Co`;
}
