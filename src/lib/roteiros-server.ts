import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Equipe, Roteiro, RtClient } from '@/lib/roteiros';

/** Carrega tudo da seção Roteiros (a RLS já limita a quem é da equipe). */
export async function loadRoteiros() {
  const supabase = await createClient();
  const [rc, ro, eq] = await Promise.all([
    supabase.from('roteiro_clientes').select('client_id, team_id, clients(id,name,logo_url)'),
    supabase.from('roteiros').select('*').order('pub_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
    supabase.from('roteiro_equipes').select('*').order('name'),
  ]);
  const raw = rc.error?.message || ro.error?.message || eq.error?.message || null;
  const error = raw && /does not exist|schema cache|relation/i.test(raw)
    ? 'A seção Roteiros ainda não foi ativada no banco. Rode o arquivo supabase/migrations/2026-11-23_roteiros.sql no SQL Editor do Supabase.'
    : raw;
  const clients = ((rc.data ?? []) as unknown as RtClient[])
    .filter((c) => c.clients)
    .sort((a, b) => a.clients!.name.localeCompare(b.clients!.name));
  return { supabase, clients, roteiros: (ro.data ?? []) as Roteiro[], teams: (eq.data ?? []) as Equipe[], error };
}
