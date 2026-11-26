import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayYMD } from '@/lib/format';
import { loadBoard, loadDoers } from '@/lib/alteracoes-server';
import { AlteracoesView, type Aba } from './alteracoes-view';

export const metadata: Metadata = { title: 'Alterações' };
export const dynamic = 'force-dynamic';

/** Pedidos de alteração dos clientes: encaminhar, acompanhar e revisar (Kim e João). */
export default async function AlteracoesPage({ searchParams }: { searchParams: Promise<{ aba?: string; cliente?: string }> }) {
  await requireSection('alteracoes');
  const sp = await searchParams;
  const supabase = await createClient();
  const [board, doers] = await Promise.all([loadBoard(supabase), loadDoers(supabase)]);
  const counts = { encaminhar: board.pedidos.length, equipe: board.fazendo.length, revisar: board.revisao.length };
  const asked = (['encaminhar', 'equipe', 'revisar'] as Aba[]).find((a) => a === sp.aba);
  // sem aba escolhida: abre onde tem coisa para fazer (revisar primeiro, depois encaminhar)
  const aba: Aba = asked ?? (counts.revisar ? 'revisar' : counts.encaminhar ? 'encaminhar' : counts.equipe ? 'equipe' : 'encaminhar');
  return <AlteracoesView aba={aba} cliente={sp.cliente ?? null} board={board} doers={doers} today={todayYMD()} counts={counts} />;
}
