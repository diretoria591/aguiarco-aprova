import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { requireSection } from '@/lib/auth';
import type { Client, Post, Profile } from '@/lib/types';
import { AgendaView, type AgendaPost } from './agenda-view';

export const metadata: Metadata = { title: 'Agendamento' };
export const dynamic = 'force-dynamic';

/** Concluídos aparecem por 30 dias depois do aviso ao cliente. */
const DONE_DAYS = 30;

export default async function AgendamentoPage() {
  await requireSection('agendamento');
  const supabase = await createClient();
  const since = new Date(Date.now() - DONE_DAYS * 86400e3).toISOString();

  const [postsRes, profilesRes] = await Promise.all([
    supabase
      .from('posts')
      .select('*, post_media(*), clients(id,name,logo_url,instagram,segment)')
      .eq('status', 'approved')
      .or(`client_notified_at.is.null,client_notified_at.gt.${since}`)
      .order('scheduled_date', { ascending: true, nullsFirst: false }),
    supabase.from('profiles').select('*'),
  ]);

  const names = new Map(((profilesRes.data ?? []) as Profile[]).map((p) => [p.id, p.name || p.email]));
  type Row = Post & { clients: Pick<Client, 'id' | 'name' | 'logo_url' | 'instagram' | 'segment'> | null };
  const posts: AgendaPost[] = ((postsRes.data ?? []) as Row[])
    .filter((p) => p.clients)
    .map((p) => ({
      ...p,
      comments: [],
      client: p.clients!,
      scheduled_by_name: p.scheduled_by ? names.get(p.scheduled_by) ?? 'Equipe' : null,
      client_notified_by_name: p.client_notified_by ? names.get(p.client_notified_by) ?? 'Equipe' : null,
    }));

  return <AgendaView posts={posts} error={postsRes.error?.message ?? null} />;
}
