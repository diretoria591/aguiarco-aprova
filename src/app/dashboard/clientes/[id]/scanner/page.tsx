import { notFound } from 'next/navigation';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Client } from '@/lib/types';
import { ScannerView } from './scanner-view';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cadastrar posts pelo scanner: lê o calendário do Google Docs do cliente. */
export default async function ScannerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSection('clientes');
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from('clients').select('id, name, segment').eq('id', id).maybeSingle();
  if (!data) notFound();
  return <ScannerView client={data as Pick<Client, 'id' | 'name' | 'segment'>} />;
}
