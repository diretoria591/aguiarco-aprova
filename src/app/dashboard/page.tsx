import { createClient } from '@/lib/supabase/server';
import { countStatuses } from '@/lib/constants';
import type { ActivityLog, Client, PostStatus } from '@/lib/types';
import { DashboardHome, type ClientCard } from './dashboard-home';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const [clientsRes, postsRes, recentRes] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase
      .from('posts')
      .select('client_id,status,sent_at,post_media(file_url,file_type,order_index)')
      .order('sent_at', { ascending: false }),
    supabase
      .from('activity_logs')
      .select('*, clients(name), posts(title)')
      .in('type', ['acesso', 'aprovado', 'ajustes', 'comentario_cliente'])
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  type Row = { client_id: string; status: PostStatus; sent_at: string; post_media: { file_url: string; file_type: string; order_index: number }[] };
  const posts = (postsRes.data ?? []) as Row[];

  const clients: ClientCard[] = ((clientsRes.data ?? []) as Client[]).map((c) => {
    const mine = posts.filter((p) => p.client_id === c.id);
    const cover = mine
      .flatMap((p) => [...p.post_media].sort((a, b) => a.order_index - b.order_index))
      .find((m) => m.file_type.startsWith('image/') || m.file_type.startsWith('cover/image/'));
    return { ...c, counts: countStatuses(mine), cover: cover?.file_url ?? null };
  });

  return (
    <DashboardHome
      clients={clients}
      recent={(recentRes.data ?? []) as ActivityLog[]}
      error={clientsRes.error?.message ?? null}
    />
  );
}
