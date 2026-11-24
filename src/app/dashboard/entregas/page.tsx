import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { currentMonth } from '@/lib/format';
import { loadEntregas } from '@/lib/entregas-server';
import { EntregasView } from './entregas-view';

export const metadata: Metadata = { title: 'Entregas' };
export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Termômetro de entregas: meta do contrato × conteúdos aprovados no mês. */
export default async function EntregasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const viewer = await requireSection('entregas');
  const sp = await searchParams;
  const now = currentMonth();
  const month = sp.mes && MONTH_RE.test(sp.mes) ? sp.mes : now;

  const supabase = await createClient();
  const { rows, progress, error } = await loadEntregas(supabase, viewer.view.owner ? null : viewer.view.id, month);
  return <EntregasView month={month} progress={progress} rows={rows} error={error} />;
}
