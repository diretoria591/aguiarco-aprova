import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from './supabase/env';
import type { Post } from './types';

export type PortalClient = { name: string; contact_name: string; logo_url: string | null; revision_limit: number };
export type PortalData = { client: PortalClient; posts: Post[] };

export const TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/** Cliente anônimo que envia o token no cabeçalho lido pelas policies de RLS. */
export function portalSupabase(token: string): SupabaseClient {
  const { url, anonKey } = supabaseEnv();
  return createPlainClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'ac-portal' },
    global: { headers: { 'x-client-token': token } },
  });
}

/** Lê os dados do cliente — RLS garante que só voltam os dados deste token. */
export async function fetchPortal(supabase: SupabaseClient): Promise<PortalData | null> {
  const { data: client, error } = await supabase
    .from('clients').select('id,name,contact_name,logo_url,revision_limit').maybeSingle();
  if (error) throw error;
  if (!client) return null;
  const { data: posts, error: e2 } = await supabase
    .from('posts')
    .select('*, post_media(*), comments(*)')
    .eq('client_id', client.id)
    // ordem de publicação: data agendada (mais cedo primeiro), depois ordem de envio
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (e2) throw e2;
  return {
    client: { name: client.name, contact_name: client.contact_name, logo_url: client.logo_url, revision_limit: client.revision_limit ?? 2 },
    posts: ((posts ?? []) as Post[]).map((p) => ({
      ...p,
      post_media: [...p.post_media].sort((a, b) => a.order_index - b.order_index),
      comments: [...p.comments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    })),
  };
}

export function rpcError(e: unknown): string {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão. Tente novamente.';
  return m || 'Não foi possível concluir. Tente novamente.';
}
