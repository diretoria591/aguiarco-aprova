import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Client, Comment, Post } from './types';
import { publishDateOf, type Alteracao, type Doer } from './alteracoes';

export type AltPost = Post & { publish_at?: string | null };
export type AltRow = Alteracao & { posts: AltPost; clients: Client };
/** Pedido do cliente que ainda não foi encaminhado. */
export type Pedido = { post: AltPost; client: Client; ask: Comment | null; publish: string | null };

const lastAsk = (p: Post) => [...(p.comments ?? [])]
  .sort((a, b) => a.created_at.localeCompare(b.created_at))
  .reverse().find((c) => c.author_role === 'client' && c.kind === 'adjustment') ?? null;

export async function loadDoers(supabase: SupabaseClient): Promise<Doer[]> {
  const { data } = await supabase.from('profiles')
    .select('id, name, nickname, email, job, delivery_days, delivery_hours, does_changes').eq('does_changes', true).order('name');
  return ((data ?? []) as { id: string; name: string; nickname: string | null; email: string; job: string | null; delivery_days: number[] | null; delivery_hours: string | null }[])
    .map((p) => ({ id: p.id, name: p.name || 'Equipe', nickname: p.nickname ?? '', email: p.email, job: p.job ?? '', days: p.delivery_days ?? [1, 2, 3, 4, 5], hours: p.delivery_hours ?? '' }));
}

const ALT_SELECT = '*, alteracao_etapas(*), alteracao_media(*), posts(*, post_media(*), comments(*)), clients(*)';

/** Pedidos para encaminhar + alterações abertas (com a equipe e para revisar). */
export async function loadBoard(supabase: SupabaseClient) {
  const [{ data: posts, error: e1 }, { data: alts, error: e2 }] = await Promise.all([
    supabase.from('posts').select('*, post_media(*), comments(*), clients(*)').eq('status', 'adjustment_requested').order('decided_at', { ascending: false }),
    supabase.from('alteracoes').select(ALT_SELECT).in('status', ['fazendo', 'revisao']).order('created_at'),
  ]);
  const open = (alts ?? []) as AltRow[];
  const busy = new Set(open.map((a) => a.post_id));
  const pedidos: Pedido[] = ((posts ?? []) as (AltPost & { clients: Client })[])
    .filter((p) => !busy.has(p.id))
    .map(({ clients, ...p }) => ({ post: p as AltPost, client: clients, ask: lastAsk(p), publish: publishDateOf(p) }));
  return {
    pedidos,
    fazendo: open.filter((a) => a.status === 'fazendo'),
    revisao: open.filter((a) => a.status === 'revisao'),
    error: e1?.message ?? e2?.message ?? null,
  };
}

/** Demandas de uma pessoa: a vez dela, as que vêm depois de outra pessoa e as entregues em revisão. */
export async function loadMine(supabase: SupabaseClient, profileId: string) {
  // só o que já foi passado para a pessoa (a vez dela ou o que ela já entregou); a 2ª pessoa não vê antes da sua vez
  const { data: mine } = await supabase.from('alteracao_etapas').select('alteracao_id').eq('profile_id', profileId).in('status', ['fazendo', 'feita']);
  const ids = [...new Set((mine ?? []).map((e) => e.alteracao_id as string))];
  if (!ids.length) return { rows: [] as AltRow[], error: null as string | null };
  const { data, error } = await supabase.from('alteracoes').select(ALT_SELECT).in('id', ids).in('status', ['fazendo', 'revisao']).order('created_at');
  return { rows: (data ?? []) as AltRow[], error: error?.message ?? null };
}

/** Uma demanda da pessoa, para o aviso do topo ("Bom dia, Brenda! ..."). */
export type MinhaDemanda = { client: string; clientId: string; title: string; due: string | null };

/** Números para o menu e o aviso do topo: pedidos para encaminhar, para revisar e a vez da pessoa. */
export async function loadAltCounts(supabase: SupabaseClient, profileId: string, reviewer: boolean) {
  const mineQ = supabase.from('alteracao_etapas').select('due_date, alteracoes!inner(status, client_id, posts(title), clients(name))')
    .eq('profile_id', profileId).eq('status', 'fazendo').eq('alteracoes.status', 'fazendo').order('due_date');
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;
  const toList = (data: unknown[] | null): MinhaDemanda[] => (data ?? []).map((r) => {
    const row = r as { due_date: string | null; alteracoes: unknown };
    const a = one(row.alteracoes as { client_id: string; posts: { title: string } | { title: string }[] | null; clients: { name: string } | { name: string }[] | null } | null);
    return { client: one(a?.clients)?.name ?? 'Cliente', clientId: a?.client_id ?? '', title: one(a?.posts)?.title ?? '', due: row.due_date };
  });
  if (!reviewer) {
    const { data } = await mineQ;
    const lista = toList(data);
    return { encaminhar: 0, revisar: 0, minhas: lista.length, lista };
  }
  const [m, posts, open, rev] = await Promise.all([
    mineQ,
    supabase.from('posts').select('id').eq('status', 'adjustment_requested'),
    supabase.from('alteracoes').select('post_id').in('status', ['fazendo', 'revisao']),
    supabase.from('alteracoes').select('id', { count: 'exact', head: true }).eq('status', 'revisao'),
  ]);
  const busy = new Set((open.data ?? []).map((a) => a.post_id as string));
  const lista = toList(m.data);
  return {
    encaminhar: (posts.data ?? []).filter((p) => !busy.has(p.id as string)).length,
    revisar: rev.count ?? 0,
    minhas: lista.length,
    lista,
  };
}
