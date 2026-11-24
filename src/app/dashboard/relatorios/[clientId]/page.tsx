import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { blockScheduler } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addMonths, currentMonth } from '@/lib/format';
import { REPORT_POST_SELECT, reportMonth, type Relatorio, type ReportPost } from '@/lib/relatorio';
import { ReportView } from './report-view';

export const metadata: Metadata = { title: 'Relatório mensal' };
export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function RelatorioPage({ params, searchParams }: {
  params: Promise<{ clientId: string }>; searchParams: Promise<{ mes?: string }>;
}) {
  await blockScheduler();
  const { clientId } = await params;
  const sp = await searchParams;
  const month = sp.mes && MONTH_RE.test(sp.mes) ? sp.mes : addMonths(currentMonth(), -1);

  const supabase = await createClient();
  const [clientRes, postsRes, repRes] = await Promise.all([
    supabase.from('clients').select('id,name,logo_url,instagram,revision_limit').eq('id', clientId).maybeSingle(),
    supabase.from('posts').select(REPORT_POST_SELECT).eq('client_id', clientId),
    supabase.from('relatorios').select('*').eq('client_id', clientId).eq('ref_month', month).maybeSingle(),
  ]);
  if (!clientRes.data) notFound();
  const posts = ((postsRes.data ?? []) as unknown as ReportPost[])
    .filter((p) => reportMonth(p) === month)
    .sort((a, b) => (a.scheduled_date ?? a.sent_at).localeCompare(b.scheduled_date ?? b.sent_at));

  return (
    <ReportView
      client={clientRes.data as { id: string; name: string; logo_url: string | null; instagram?: string; revision_limit?: number | null }}
      month={month}
      posts={posts}
      report={(repRes.data as Relatorio | null) ?? null}
      error={postsRes.error?.message ?? repRes.error?.message ?? null}
    />
  );
}
