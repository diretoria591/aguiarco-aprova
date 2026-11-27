import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDaysYmd, mondayOf, ymdIn, type ProjEmail, type Projeto, type Rotina, type Tarefa } from './projetos';

export type Pessoa = { id: string; name: string; nickname: string; owner: boolean };

/** Quem participa dos projetos: a dona e quem tem a aba Projetos. */
export async function loadPessoas(supabase: SupabaseClient): Promise<Pessoa[]> {
  const { data } = await supabase.from('profiles').select('id, name, nickname, owner, sections').order('name');
  return ((data ?? []) as { id: string; name: string | null; nickname: string | null; owner: boolean | null; sections: string[] | null }[])
    .filter((p) => p.owner || (p.sections ?? []).includes('projetos'))
    .map((p) => ({ id: p.id, name: p.name || 'Equipe', nickname: p.nickname ?? '', owner: !!p.owner }));
}

const pessoaNome = (p: Pessoa) => (p.nickname || '').trim() || p.name.trim().split(/\s+/)[0];

/**
 * Cria as tarefas das rotinas (uma vez só por semana ou por mês):
 * semanais desta semana e da próxima; mensais deste mês e, na última semana, do próximo.
 */
export async function ensureRotinas(supabase: SupabaseClient, p: Projeto, pessoas: Pessoa[]) {
  const rotinas = (p.rotinas ?? []) as Rotina[];
  if (!rotinas.length) return;
  const today = ymdIn(p.timezone);
  const rows: Record<string, unknown>[] = [];
  const owner = (name?: string) => {
    const n = (name ?? '').trim().toLowerCase();
    const hit = pessoas.find((x) => pessoaNome(x).toLowerCase() === n || x.name.toLowerCase().startsWith(n));
    return { owner_id: hit?.id ?? null, owner_name: hit ? pessoaNome(hit) : name ?? '' };
  };
  for (const r of rotinas) {
    if (r.weekday) {
      for (const mon of [mondayOf(today), addDaysYmd(mondayOf(today), 7)]) {
        rows.push({ projeto_id: p.id, title: r.title, detail: r.detail ?? '', kind: 'rotina', recur_key: `w:${r.key}:${mon}`, due_date: addDaysYmd(mon, r.weekday - 1), created_by_name: 'Rotina', ...owner(r.owner) });
      }
    } else if (r.day) {
      const months = [today.slice(0, 7)];
      if (Number(today.slice(8, 10)) >= 24) {
        const [y, m] = today.split('-').map(Number);
        months.push(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`);
      }
      for (const mo of months) {
        const day = String(Math.min(Math.max(r.day, 1), 28)).padStart(2, '0');
        rows.push({ projeto_id: p.id, title: r.title, detail: r.detail ?? '', kind: 'rotina', recur_key: `m:${r.key}:${mo}`, due_date: `${mo}-${day}`, created_by_name: 'Rotina', ...owner(r.owner) });
      }
    }
  }
  if (rows.length) await supabase.from('projeto_tarefas').upsert(rows, { onConflict: 'projeto_id,recur_key', ignoreDuplicates: true });
}

export async function loadProjeto(supabase: SupabaseClient, slug: string) {
  const { data } = await supabase.from('projetos').select('*').eq('slug', slug).eq('active', true).maybeSingle();
  return (data as Projeto | null) ?? null;
}

export async function loadProjetoData(supabase: SupabaseClient, p: Projeto) {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const [tarefas, emails] = await Promise.all([
    supabase.from('projeto_tarefas').select('*, projeto_itens(*), projeto_movs(*)').eq('projeto_id', p.id).neq('status', 'cancelada')
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('projeto_emails').select('*').eq('projeto_id', p.id).gte('sent_at', since).order('sent_at', { ascending: false }).limit(300),
  ]);
  return {
    tarefas: (tarefas.data ?? []) as Tarefa[],
    emails: (emails.data ?? []) as ProjEmail[],
    error: tarefas.error?.message ?? emails.error?.message ?? null,
  };
}

export type GmailStatus = { configured: boolean; connected: boolean; account: string; lastSync: string | null; error: string };

/** Situação da conexão com o Gmail, sem expor o token (a tabela só é lida com a service role). */
export async function loadGmailStatus(admin: SupabaseClient | null, projetoId: string, configured: boolean): Promise<GmailStatus> {
  if (!admin) return { configured, connected: false, account: '', lastSync: null, error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' };
  const { data } = await admin.from('projeto_gmail').select('account_email, last_sync_at, last_error').eq('projeto_id', projetoId).maybeSingle();
  const d = data as { account_email: string; last_sync_at: string | null; last_error: string } | null;
  return { configured, connected: !!d, account: d?.account_email ?? '', lastSync: d?.last_sync_at ?? null, error: d?.last_error ?? '' };
}
