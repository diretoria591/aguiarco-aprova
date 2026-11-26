import { notFound } from 'next/navigation';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Client } from '@/lib/types';
import { DestaquesView } from './destaques-view';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Scanner de destaques: lê a pasta do Drive (1 subpasta = 1 destaque). */
export default async function DestaquesScannerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('clientes');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle();
  if (!data) notFound();
  return <DestaquesView client={data as Pick<Client, 'id' | 'name'>} />;
}
