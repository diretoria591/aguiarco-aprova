import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { ActivityLog, Client, Post } from '@/lib/types';
import { ClientView } from './client-view';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();

  const [clientRes, postsRes, eventsRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('posts')
      .select('*, post_media(*), comments(*)')
      .eq('client_id', id)
      .order('sent_at', { ascending: false }),
    supabase
      .from('activity_logs')
      .select('*, posts(title)')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(60),
  ]);
  if (!clientRes.data) notFound();

  const posts = ((postsRes.data ?? []) as Post[]).map((p) => ({
    ...p,
    post_media: [...p.post_media].sort((a, b) => a.order_index - b.order_index),
    comments: [...p.comments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
  }));

  return <ClientView client={clientRes.data as Client} posts={posts} events={(eventsRes.data ?? []) as ActivityLog[]} />;
}
