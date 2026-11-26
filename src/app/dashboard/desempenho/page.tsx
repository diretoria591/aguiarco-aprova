import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addMonths, currentMonth } from '@/lib/format';
import { loadDesempenho } from '@/lib/desempenho-server';
import { DesempenhoView } from './desempenho-view';

export const metadata: Metadata = { title: 'Desempenho' };
export const dynamic = 'force-dynamic';

/** Resumo do mês de cada pessoa da equipe, com a mensagem pronta (parabéns ou alerta) para revisar e enviar. */
export default async function DesempenhoPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireSection('desempenho');
  const sp = await searchParams;
  const now = currentMonth();
  const months = [0, -1, -2].map((k) => addMonths(now, k));
  const month = months.includes(sp.mes ?? '') ? sp.mes! : now;
  const supabase = await createClient();
  const data = await loadDesempenho(supabase, month);
  return <DesempenhoView month={month} months={months} current={month === now} {...data} />;
}
