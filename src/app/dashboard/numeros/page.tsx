import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireSection } from '@/lib/auth';
import { addMonths, currentMonth } from '@/lib/format';
import { monthRange, reportMonth, type MetricKey } from '@/lib/relatorio';
import { NumerosView, type NumerosRow } from './numeros-view';

export const metadata: Metadata = { title: 'Números do mês' };
export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
type Metrics = Partial<Record<MetricKey, string>>;

/** Social media preenche os números do Instagram de cada cliente; a estrategista usa no relatório. */
export default async function NumerosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireSection('numeros');
  const sp = await searchParams;
  const month = sp.mes && MONTH_RE.test(sp.mes) ? sp.mes : addMonths(currentMonth(), -1);
  const prev = addMonths(month, -1);
  const [from, to] = monthRange(month);

  const supabase = await createClient();
  const [clientsRes, postsRes, extRes, repRes] = await Promise.all([
    supabase.from('clients').select('id,name,logo_url,instagram').order('name'),
    supabase.from('posts').select('client_id,status,scheduled_date,sent_at'),
    supabase.from('posts_externos').select('client_id').gte('publish_date', from).lt('publish_date', to),
    supabase.from('relatorios').select('client_id,ref_month,metrics,metrics_by,metrics_at,status').in('ref_month', [month, prev]),
  ]);
  const error = clientsRes.error ?? postsRes.error ?? extRes.error ?? repRes.error;

  const count = new Map<string, number>();
  for (const p of (postsRes.data ?? []) as { client_id: string; status: string; scheduled_date: string | null; sent_at: string }[]) {
    if (p.status === 'approved' && reportMonth(p) === month) count.set(p.client_id, (count.get(p.client_id) ?? 0) + 1);
  }
  for (const e of (extRes.data ?? []) as { client_id: string }[]) count.set(e.client_id, (count.get(e.client_id) ?? 0) + 1);

  type R = { client_id: string; ref_month: string; metrics: Metrics; metrics_by: string; metrics_at: string | null; status: string };
  const reps = (repRes.data ?? []) as R[];
  const cur = new Map(reps.filter((r) => r.ref_month === month).map((r) => [r.client_id, r]));
  const old = new Map(reps.filter((r) => r.ref_month === prev).map((r) => [r.client_id, r]));

  const rows: NumerosRow[] = ((clientsRes.data ?? []) as { id: string; name: string; logo_url: string | null; instagram?: string }[])
    .map((c) => ({
      id: c.id, name: c.name, logo_url: c.logo_url, instagram: c.instagram ?? '',
      posts: count.get(c.id) ?? 0,
      metrics: cur.get(c.id)?.metrics ?? {},
      prev: old.get(c.id)?.metrics ?? {},
      by: cur.get(c.id)?.metrics_by ?? '',
      at: cur.get(c.id)?.metrics_at ?? null,
      ready: cur.get(c.id)?.status === 'pronto',
    }))
    .sort((a, b) => Number(b.posts > 0) - Number(a.posts > 0) || a.name.localeCompare(b.name));

  return <NumerosView month={month} rows={rows} error={error?.message ?? null} />;
}
