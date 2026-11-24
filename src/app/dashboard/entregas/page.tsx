import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { currentMonth, todayYMD } from '@/lib/format';
import { entregaStatus, monthProgress, type EntregaRow } from '@/lib/entregas';
import { monthRange, reportMonth } from '@/lib/relatorio';
import { EntregasView } from './entregas-view';

export const metadata: Metadata = { title: 'Entregas' };
export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const VIDEO = new Set(['reels', 'video']);
const ORDER = { atrasado: 0, atencao: 1, acima: 2, em_dia: 3, sem_meta: 4 } as const;

type C = {
  id: string; name: string; logo_url: string | null; strategist_id: string | null; delivery_supervisor_id: string | null;
  meta_posts_min: number | null; meta_posts_max: number | null; meta_videos_min: number | null; meta_obs: string;
};

/** Termômetro de entregas: meta do contrato × conteúdos aprovados no mês. */
export default async function EntregasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const viewer = await requireSection('entregas');
  const sp = await searchParams;
  const now = currentMonth();
  const month = sp.mes && MONTH_RE.test(sp.mes) ? sp.mes : now;
  const [from, to] = monthRange(month);
  const progress = monthProgress(month, todayYMD());

  const supabase = await createClient();
  let q = supabase.from('clients')
    .select('id,name,logo_url,strategist_id,delivery_supervisor_id,meta_posts_min,meta_posts_max,meta_videos_min,meta_obs')
    .neq('client_type', 'pontual');
  // a dona vê todos; os outros, só os clientes que acompanham
  if (!viewer.view.owner) q = q.eq('delivery_supervisor_id', viewer.view.id);
  const [clientsRes, postsRes, extRes, profRes, manRes] = await Promise.all([
    q.order('name'),
    supabase.from('posts').select('client_id,status,format,scheduled_date,sent_at'),
    supabase.from('posts_externos').select('client_id,format').gte('publish_date', from).lt('publish_date', to),
    supabase.from('profiles').select('id,name'),
    supabase.from('entregas_manuais').select('client_id,quantidade').eq('ref_month', month),
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
  for (const m of (manRes.data ?? []) as { client_id: string; quantidade: number }[]) add(m.client_id).delivered += m.quantidade;
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
      videosMin: c.meta_videos_min, obs: c.meta_obs, ...base, expected, status,
    };
  }).sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));

  return <EntregasView month={month} progress={progress} rows={rows} error={error?.message ?? null} />;
}
