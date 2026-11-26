import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { currentMonth, todayYMD } from '@/lib/format';
import { ensureFixos, loadPedidosBoard, loadWriters } from '@/lib/pedidos-roteiro-server';
import { PedidosView, type PedidosAba } from './pedidos-view';

export const metadata: Metadata = { title: 'Pedidos de roteiro' };
export const dynamic = 'force-dynamic';

/** Kim e João: pedir roteiros, acompanhar, revisar, enviar ao cliente e as demandas fixas do contrato. */
export default async function PedidosPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  await requireSection('alteracoes');
  const sp = await searchParams;
  const supabase = await createClient();
  await ensureFixos(supabase);
  const [board, writers, clientsRes] = await Promise.all([
    loadPedidosBoard(supabase),
    loadWriters(supabase),
    supabase.from('clients').select('id, name, meta_videos_min, client_type').order('name'),
  ]);
  const clients = ((clientsRes.data ?? []) as { id: string; name: string; meta_videos_min: number | null; client_type: string | null }[])
    .map((c) => ({ id: c.id, name: c.name, videos: c.meta_videos_min ?? null, pontual: c.client_type === 'pontual' }));
  const counts = { revisar: board.revisao.length, equipe: board.fazendo.length, enviados: board.enviados.length, fixos: board.fixos.filter((f) => f.active).length };
  const asked = (['pedir', 'revisar', 'equipe', 'enviados', 'fixos'] as PedidosAba[]).find((a) => a === sp.aba);
  const aba: PedidosAba = asked ?? (counts.revisar ? 'revisar' : 'pedir');
  return <PedidosView aba={aba} board={board} writers={writers} clients={clients} counts={counts} today={todayYMD()} month={currentMonth()} />;
}
