import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { loadCobrar } from '@/lib/cobrar-server';
import { CobrarList } from './cobrar-list';

export const metadata: Metadata = { title: 'Cobrar hoje' };
export const dynamic = 'force-dynamic';

export default async function CobrarPage() {
  await requireSection('cobrar');
  const supabase = await createClient();
  const { items, error } = await loadCobrar(supabase);
  return <CobrarList items={items} error={error} />;
}
