import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CONTACT_TYPES, buildCobrar,
  type CobrarClientRow, type CobrarContactRow, type CobrarPostRow,
} from './cobrar';

/** Lê do banco e monta a lista "Cobrar hoje". */
export async function loadCobrar(supabase: SupabaseClient) {
  // 30 dias: o suficiente para mostrar "última cobrança há X dias"
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [clientsRes, postsRes, contactsRes] = await Promise.all([
    supabase.from('clients').select('id,name,contact_name,whatsapp,access_token,logo_url').order('name'),
    supabase.from('posts').select('id,client_id,title,sent_at,first_viewed_at,scheduled_date').eq('status', 'pending'),
    supabase.from('activity_logs').select('client_id,created_at,actor,type')
      .in('type', CONTACT_TYPES).gte('created_at', since),
  ]);
  const error = clientsRes.error ?? postsRes.error ?? contactsRes.error;
  const items = buildCobrar(
    (clientsRes.data ?? []) as CobrarClientRow[],
    (postsRes.data ?? []) as CobrarPostRow[],
    (contactsRes.data ?? []) as CobrarContactRow[],
  );
  return { items, error: error?.message ?? null };
}
