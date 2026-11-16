import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import { TeamView } from './team-view';

export const metadata: Metadata = { title: 'Equipe' };
export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('*').order('created_at');
  return <TeamView team={(data ?? []) as Profile[]} canManage={!!process.env.SUPABASE_SERVICE_ROLE_KEY} />;
}
