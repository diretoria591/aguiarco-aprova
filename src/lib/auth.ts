import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { TeamRole } from './types';

/** Função da pessoa logada (team quando a coluna ainda não existe). */
export async function currentRole(): Promise<TeamRole | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!data) return null;
  return ((data as { role?: TeamRole }).role) || 'team';
}

/** Quem é "scheduler" só usa a aba Agendamento: as outras páginas mandam para lá. */
export async function blockScheduler() {
  if ((await currentRole()) === 'scheduler') redirect('/dashboard/agendamento');
}
