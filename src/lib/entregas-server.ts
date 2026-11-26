import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { todayYMD } from './format';
import { entregaStatus, monthProgress, type EntregaRow } from './entregas';
import { monthRange, reportMonth } from './relatorio';

const VIDEO = new Set(['reels', 'video']);
const ORDER = { atrasado: 0, atencao: 1, acima: 2, em_dia: 3, sem_meta: 4 } as const;

type C = {
  id: string; name: string; logo_url: string | null; strategist_id: string | null; delivery_supervisor_id: string | null;
  meta_posts_min: number | null; meta_posts_max: number | null; meta_videos_min: number | null; meta_obs: string;
};

/** Termômetro do mês: supervisorId = só os clientes dessa pessoa; null = todos (dona da conta). */
export async function loadEntregas(supabase: SupabaseClient, supervisorId: string | null, month: string) {
  const [from, to] = monthRange(month);
  const progress = monthProgress(month, todayYMD());
  let q = supabase.from('clients')
    .select('id,name,logo_url,strategist_id,delivery_supervisor_id,meta_posts_min,meta_posts_max,meta_videos_min,meta_obs')
    .neq('client_type', 'pontual');
  // a dona vê todos; os outros, só os clientes que acompanham
  if (supervisorId) q = q.eq('delivery_supervisor_id', supervisorId);
  const [clientsRes, postsRes, extRes, profRes, manRes] = await Promise.all([
    q.order('name'),
    supabase.from('posts').select('client_id,status,format,scheduled_date,sent_at').eq('is_roteiro', false),
    supabase.from('posts_externos').select('client_id,format').gte('publish_date', from).lt('publish_date', to),
    supabase.from('profiles').select('id,name'),
    supabase.from('entregas_manuais').select('id,client_id,quantidade,nota,created_by,created_at').eq('ref_month', month).order('created_at'),
  ]);
  const error = clientsRes.error ?? postsRes.error ?? extRes.error;
  const names = new Map(((profRes.data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));

  const acc = new Map<string, { delivered: number; videos: number; inProgress: number }>();
  const add = (id: string) => acc.get(id) ?? acc.set(id, { delivered: 0, videos: 0, inProgress: 0 }).get(id)!;
  for (const p of (postsRes.data ?? []) as { client_id: string; status: string; format: string; scheduled_date: string | null; sent_at: string }[]) {
    if (reportMonth(p) !== month) continue;
    const a = add(p.client_id);
    if (p.status === 'approved') { a.delivered++; if (VIDEO.has(p.format)) a.videos++; }
    else if (p.status === 'pending' || p.status === 'adjustment_requested') a.inProgress++;
  }
  // entregas informadas à mão (sem detalhes dos posts)
  type Extra = { id: string; client_id: string; quantidade: number; nota: string; created_by: string; created_at: string };
  const extras = new Map<string, Extra[]>();
  for (const m of (manRes.data ?? []) as Extra[]) {
    add(m.client_id).delivered += m.quantidade;
    extras.set(m.client_id, [...(extras.get(m.client_id) ?? []), m]);
  }
  for (const e of (extRes.data ?? []) as { client_id: string; format: string }[]) {
    const a = add(e.client_id);
    a.delivered++;
    if (VIDEO.has(e.format)) a.videos++;
  }

  const rows: EntregaRow[] = ((clientsRes.data ?? []) as C[]).map((c) => {
    const a = acc.get(c.id) ?? { delivered: 0, videos: 0, inProgress: 0 };
    const base = { metaMin: c.meta_posts_min, metaMax: c.meta_posts_max, ...a };
    const { status, expected } = entregaStatus(base, progress);
    return {
      id: c.id, name: c.name, logo_url: c.logo_url, strategist: c.strategist_id ? names.get(c.strategist_id) ?? '' : '',
      videosMin: c.meta_videos_min, obs: c.meta_obs, ...base, expected, status, extras: extras.get(c.id) ?? [],
    };
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));


  return { rows, progress, error: error?.message ?? null };
}
