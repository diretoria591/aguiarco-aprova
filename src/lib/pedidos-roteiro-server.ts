import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { currentMonth } from './format';
import { fixoPeriod, pedidoTitle, tipoOf, writerName, type PedidoRoteiro, type RoteiroFixo, type Writer } from './pedidos-roteiro';

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

/** Painel da Kim/João: com a equipe (inclusive pedidos entre as meninas), para revisar e enviados/recebidos nos últimos 45 dias. */
export async function loadPedidosBoard(supabase: SupabaseClient) {
  const since = new Date(Date.now() - 45 * 86400e3).toISOString();
  const [open, sent, fixos] = await Promise.all([
    supabase.from('roteiro_pedidos').select(SELECT).in('status', ['fazendo', 'revisao']).order('due_date', { nullsFirst: false }),
    supabase.from('roteiro_pedidos').select(SELECT).in('status', ['enviado', 'concluido']).eq('peer', false).gte('updated_at', since).order('updated_at', { ascending: false }),
    supabase.from('roteiro_fixos').select('*').order('created_at'),
  ]);
  const rows = (open.data ?? []) as PedidoRoteiro[];
  return {
    fazendo: rows.filter((r) => r.status === 'fazendo'),
    revisao: rows.filter((r) => r.status === 'revisao' && !r.peer),
    enviados: (sent.data ?? []) as PedidoRoteiro[],
    fixos: (fixos.data ?? []) as RoteiroFixo[],
    error: open.error?.message ?? sent.error?.message ?? fixos.error?.message ?? null,
  };
}

/** Minhas demandas: o que a pessoa tem para escrever e o que ela pediu para outra pessoa da equipe. */
export async function loadMyPedidos(supabase: SupabaseClient, profileId: string) {
  const [mine, asked] = await Promise.all([
    supabase.from('roteiro_pedidos').select(SELECT).eq('profile_id', profileId).in('status', ['fazendo', 'revisao']).order('due_date', { nullsFirst: false }),
    supabase.from('roteiro_pedidos').select(SELECT).eq('created_by', profileId).eq('peer', true).in('status', ['fazendo', 'revisao']).order('due_date', { nullsFirst: false }),
  ]);
  return {
    rows: (mine.data ?? []) as PedidoRoteiro[],
    asked: (asked.data ?? []) as PedidoRoteiro[],
    error: mine.error?.message ?? asked.error?.message ?? null,
  };
}

export type PedidoCounts = {
  escrever: number; revisar: number;
  /** pedidos entre a equipe que chegaram para a pessoa conferir */
  recebidos: number;
  /** Kim/João: pedidos com prazo vencido e ainda com a equipe */
  atrasados: { who: string; what: string }[];
  lista: { client: string; due: string | null }[];
};

/** Para o menu e o aviso do topo. */
export async function loadPedidoCounts(supabase: SupabaseClient, profileId: string, reviewer: boolean, today: string): Promise<PedidoCounts> {
  const [mine, rev, rec, late] = await Promise.all([
    supabase.from('roteiro_pedidos').select('tipo, quantidade, ref_month, material, due_date, clients(name)').eq('profile_id', profileId).eq('status', 'fazendo').order('due_date'),
    reviewer ? supabase.from('roteiro_pedidos').select('id', { count: 'exact', head: true }).eq('status', 'revisao').eq('peer', false) : Promise.resolve({ count: 0 }),
    supabase.from('roteiro_pedidos').select('id', { count: 'exact', head: true }).eq('status', 'revisao').eq('peer', true).eq('created_by', profileId),
    reviewer ? supabase.from('roteiro_pedidos').select('tipo, quantidade, ref_month, material, assignee_name, clients(name)').eq('status', 'fazendo').eq('peer', false).lt('due_date', today) : Promise.resolve({ data: [] }),
  ]);
  type R = { tipo: string; quantidade: number; ref_month: string; material: string; due_date?: string | null; assignee_name?: string; clients: { name: string } | { name: string }[] | null };
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;
  const norm = (r: R) => ({ ...r, tipo: tipoOf(r.tipo), clients: one(r.clients) });
  const lista = ((mine.data ?? []) as R[]).map((r) => ({ client: pedidoTitle(norm(r)), due: r.due_date ?? null }));
  const atrasados = (((late as { data: unknown[] | null }).data ?? []) as R[]).map((r) => ({ who: r.assignee_name || 'Equipe', what: pedidoTitle(norm(r)) }));
  return {
    escrever: lista.length,
    revisar: (rev as { count: number | null }).count ?? 0,
    recebidos: (rec as { count: number | null }).count ?? 0,
    atrasados,
    lista,
  };
}
