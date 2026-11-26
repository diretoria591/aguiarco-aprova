import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayYMD } from '@/lib/format';
import { loadMine } from '@/lib/alteracoes-server';
import { DemandasView } from './demandas-view';

export const metadata: Metadata = { title: 'Minhas demandas' };
export const dynamic = 'force-dynamic';

/** Alterações encaminhadas para a pessoa, separadas por cliente. */
export default async function DemandasPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const v = await currentViewer();
  if (!v) redirect('/login');
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ rows, error }, { data: prof }] = await Promise.all([
    loadMine(supabase, v.view.id),
    supabase.from('profiles').select('delivery_days, delivery_hours').eq('id', v.view.id).maybeSingle(),
  ]);
  const p = (prof ?? {}) as { delivery_days?: number[] | null; delivery_hours?: string | null };
  return <DemandasView rows={rows} error={error} meId={v.view.id} name={v.view.name} cliente={sp.cliente ?? null} today={todayYMD()}
    days={p.delivery_days ?? [1, 2, 3, 4, 5]} hours={p.delivery_hours ?? ''} />;
}
