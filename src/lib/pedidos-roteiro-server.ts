import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentMonth } from './format';
import { fixoPeriod, writerName, type PedidoRoteiro, type RoteiroFixo, type Writer } from './pedidos-roteiro';

const SELECT = '*, clients(id, name, logo_url)';

/** Quem escreve roteiros (perfil com "escreve roteiros"). */
export async function loadWriters(supabase: SupabaseClient): Promise<Writer[]> {
  const { data } = await supabase.from('profiles')
    .select('id, name, nickname, delivery_days, delivery_hours').eq('writes_roteiros', true).order('name');
  return ((data ?? []) as { id: string; name: string | null; nickname: string | null; delivery_days: number[] | null; delivery_hours: string | null }[])
    .map((p) => ({ id: p.id, name: p.name || 'Equipe', nickname: p.nickname ?? '', days: p.delivery_days ?? [1, 2, 3, 4, 5], hours: p.delivery_hours ?? '' }));
}

/**
 * Cria os pedidos do mês das demandas fixas que ainda não têm (uma vez por mês, sem duplicar).
 * Nunca derruba a página: se a tabela ainda não existir, não faz nada.
 */
export async function ensureFixos(supabase: SupabaseClient, month = currentMonth()) {
  try {
    const { data: fixos, error } = await supabase.from('roteiro_fixos').select('*').eq('active', true);
    if (error || !fixos?.length) return;
    const list = fixos as RoteiroFixo[];
    const refs = [...new Set(list.map((f) => fixoPeriod(month, f.due_day).ref_month))];
    const [{ data: have }, { data: profs }] = await Promise.all([
      supabase.from('roteiro_pedidos').select('fixo_id, ref_month').in('fixo_id', list.map((f) => f.id)).in('ref_month', refs),
      supabase.from('profiles').select('id, name, nickname').in('id', [...new Set(list.map((f) => f.profile_id))]),
    ]);
    const done = new Set((have ?? []).map((h) => `${h.fixo_id}|${h.ref_month}`));
    const names = new Map(((profs ?? []) as { id: string; name: string; nickname: string | null }[]).map((p) => [p.id, writerName(p)]));
    const rows = list.flatMap((f) => {
      const per = fixoPeriod(month, f.due_day);
      if (done.has(`${f.id}|${per.ref_month}`)) return [];
      return [{
        client_id: f.client_id, profile_id: f.profile_id, assignee_name: names.get(f.profile_id) ?? '',
        quantidade: f.quantidade, briefing: f.briefing, fixo_id: f.id, created_by_name: 'Demanda fixa', ...per,
      }];
    });
    if (rows.length) await supabase.from('roteiro_pedidos').upsert(rows, { onConflict: 'fixo_id,ref_month', ignoreDuplicates: true });
  } catch { /* noop */ }
}

/** Painel da Kim/João: com a equipe, para revisar e enviados nos últimos 45 dias. */
export async function loadPedidosBoard(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 45 * 86400e3).toISOString();
  const [open, sent, fixos] = await Promise.all([
    supabase.from('roteiro_pedidos').select(SELECT).in('status', ['fazendo', 'revisao']).order('due_date', { nullsFirst: false }),
    supabase.from('roteiro_pedidos').select(SELECT).eq('status', 'enviado').gte('sent_at', since).order('sent_at', { ascending: false }),
    supabase.from('roteiro_fixos').select('*').order('created_at'),
  ]);
  const rows = (open.data ?? []) as PedidoRoteiro[];
  return {
    fazendo: rows.filter((r) => r.status === 'fazendo'),
    revisao: rows.filter((r) => r.status === 'revisao'),
    enviados: (sent.data ?? []) as PedidoRoteiro[],
    fixos: (fixos.data ?? []) as RoteiroFixo[],
    error: open.error?.message ?? sent.error?.message ?? fixos.error?.message ?? null,
  };
}

/** Pedidos de roteiro de uma pessoa (para escrever e os que estão em revisão). */
export async function loadMyPedidos(supabase: SupabaseClient, profileId: string) {
  const { data, error } = await supabase.from('roteiro_pedidos').select(SELECT)
    .eq('profile_id', profileId).in('status', ['fazendo', 'revisao']).order('due_date', { nullsFirst: false });
  return { rows: (data ?? []) as PedidoRoteiro[], error: error?.message ?? null };
}

/** Para o menu e o aviso do topo. */
export async function loadPedidoCounts(supabase: SupabaseClient, profileId: string, reviewer: boolean) {
  const [mine, rev] = await Promise.all([
    supabase.from('roteiro_pedidos').select('due_date, clients(name)').eq('profile_id', profileId).eq('status', 'fazendo').order('due_date'),
    reviewer ? supabase.from('roteiro_pedidos').select('id', { count: 'exact', head: true }).eq('status', 'revisao') : Promise.resolve({ count: 0 }),
  ]);
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;
  const lista = ((mine.data ?? []) as { due_date: string | null; clients: { name: string } | { name: string }[] | null }[])
    .map((r) => ({ client: one(r.clients)?.name ?? 'Cliente', due: r.due_date }));
  return { escrever: lista.length, revisar: (rev as { count: number | null }).count ?? 0, lista };
}
