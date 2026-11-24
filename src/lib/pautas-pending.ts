import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PendingPauta = { id: string; client_id: string; name: string; ref_month: string; doc_url: string; sent_at: string };

/** Dia da semana no fuso da agência (0 = domingo, 6 = sábado). */
function weekdaySP(): number {
  const d = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(new Date());
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(d);
}

/** Pautas enviadas no sábado e ainda não revisadas: aparecem no Aprova de segunda a sexta. */
export async function loadPendingPautas(supabase: SupabaseClient, strategistId: string | null = null): Promise<PendingPauta[]> {
  const wd = weekdaySP();
  if (wd === 0 || wd === 6) return [];
  const since = new Date(Date.now() - 14 * 86400e3).toISOString();
  const { data, error } = await supabase.from('pautas')
    .select('id,client_id,ref_month,doc_url,sent_at, clients!inner(name,strategist_id)')
    .is('reviewed_at', null).gte('sent_at', since).order('sent_at');
  if (error || !data) return [];
  return (data as unknown as (Omit<PendingPauta, 'name'> & { clients: { name: string; strategist_id: string | null } | null })[])
    .filter((p) => !strategistId || p.clients?.strategist_id === strategistId)
    .map((p) => ({ id: p.id, client_id: p.client_id, ref_month: p.ref_month, doc_url: p.doc_url, sent_at: p.sent_at, name: p.clients?.name ?? 'Cliente' }));
}
