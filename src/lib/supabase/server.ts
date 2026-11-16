import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { supabaseEnv } from './env';

/** Cliente do servidor com a sessão da equipe (cookies). */
export async function createClient(): Promise<SupabaseClient> {
  const { url, anonKey } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // chamado a partir de um Server Component: o proxy renova a sessão.
        }
      },
    },
  });
}

/** Cliente administrativo (service role) — só existe se a chave estiver configurada. */
export function createAdminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const { url } = supabaseEnv();
  return createPlainClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
