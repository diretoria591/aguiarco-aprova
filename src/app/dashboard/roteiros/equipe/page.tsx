import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { currentRole } from '@/lib/auth';
import { loadRoteiros } from '@/lib/roteiros-server';
import type { Client } from '@/lib/types';
import { TeamConfig } from './team-config';

export const metadata: Metadata = { title: 'Equipes e clientes · Roteiros' };
export const dynamic = 'force-dynamic';

export default async function RoteirosTeamPage() {
  if ((await currentRole()) !== 'admin') redirect('/dashboard/roteiros');
  const { supabase, clients, roteiros, teams, error } = await loadRoteiros();
  const { data } = await supabase.from('clients').select('id,name,logo_url').order('name');
  return (
    <TeamConfig
      clients={clients}
      allClients={((data ?? []) as Pick<Client, 'id' | 'name' | 'logo_url'>[])}
      roteiros={roteiros}
      teams={teams}
      error={error}
    />
  );
}
