'use server';

import { revalidatePath } from 'next/cache';
import { currentViewer } from '@/lib/auth';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { googleConfigured, syncProjeto } from '@/lib/gmail';
import type { Projeto } from '@/lib/projetos';

type Result = { ok: true; novos?: number } | { ok: false; error: string };

/** "Ler e-mails agora": quem tem a aba Projetos pode pedir uma leitura fora dos 10 minutos. */
export async function syncNow(slug: string): Promise<Result> {
  const v = await currentViewer();
  if (!v || !(v.real.owner || v.real.sections.includes('projetos'))) return { ok: false, error: 'Sem permissão.' };
  if (!googleConfigured()) return { ok: false, error: 'O Gmail ainda não foi configurado no servidor.' };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' };
  const { data: p } = await admin.from('projetos').select('*').eq('slug', slug).maybeSingle();
  if (!p) return { ok: false, error: 'Projeto não encontrado.' };
  const r = await syncProjeto(admin, p as Projeto);
  revalidatePath(`/dashboard/projetos/${slug}`);
  if ('error' in r && r.error) return { ok: false, error: r.error };
  if ('skipped' in r && r.skipped) return { ok: false, error: r.skipped };
  return { ok: true, novos: 'novos' in r ? r.novos : 0 };
}

/** Grava que a pessoa já viu o tutorial (nunca no "Ver como"). */
export async function tutorialSeen(): Promise<Result> {
  const v = await currentViewer();
  if (!v) return { ok: false, error: 'Faça login de novo.' };
  if (v.view.id !== v.real.id) return { ok: true };
  const supabase = await createClient();
  await supabase.from('profiles').update({ tutorial_projetos_at: new Date().toISOString() }).eq('id', v.real.id);
  return { ok: true };
}
