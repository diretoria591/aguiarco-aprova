import { createClient as createPlainClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseEnv } from './supabase/env';

export type GravacaoRoteiro = {
  id: string; client_name: string; title: string; content: string;
  content_url: string | null; content_name: string | null; ref_url: string | null;
  pub_date: string | null; notes: string; month: string; status: string; alt_note: string | null;
  video_url: string | null; photos_url: string | null; cover_url: string | null;
  video_type: 'bruto' | 'editado' | null; delivered_at: string | null;
};
export type GravacaoData = {
  team: { name: string; first_name: string };
  delivered_month: number;
  roteiros: GravacaoRoteiro[];
};

export const GRAVACAO_TOKEN_RE = /^[A-Za-z0-9_-]{32,128}$/;

/** Cliente anônimo: a equipe de gravação só chama as funções gravacao_* com o token do link. */
export function gravacaoSupabase(): SupabaseClient {
  const { url, anonKey } = supabaseEnv();
  return createPlainClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'ac-gravacao' },
  });
}
