import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, currentMonth, todayYMD } from './format';
import { monthRange, reportMonth } from './relatorio';

/** Até que dia do mês as tarefas do relatório aparecem no painel. */
export const TASKS_UNTIL_DAY = 10;

export type MonthTasks = {
  day: number;
  /** Mês do relatório (o anterior), AAAA-MM. */
  month: string;
  /** Clientes com conteúdo no mês que ainda estão sem números do Instagram. */
  numbersMissing: number;
  reportsTotal: number;
  reportsReady: number;
};

/** Tarefas do começo do mês (números da social media, relatórios da estrategista). Fora da janela: null. */
export async function loadMonthTasks(supabase: SupabaseClient): Promise<MonthTasks | null> {
  const day = Number(todayYMD().slice(8, 10));
  if (day > TASKS_UNTIL_DAY) return null;
  const month = addMonths(currentMonth(), -1);
  const [from, to] = monthRange(month);
  const [postsRes, extRes, repRes, pontRes] = await Promise.all([
    supabase.from('posts').select('client_id,scheduled_date,sent_at').eq('status', 'approved'),
    supabase.from('posts_externos').select('client_id').gte('publish_date', from).lt('publish_date', to),
    supabase.from('relatorios').select('client_id,status,metrics_at').eq('ref_month', month),
    // clientes pontuais (avulsos) não têm números nem relatório mensal
    supabase.from('clients').select('id').eq('client_type', 'pontual'),
  ]);
  if (postsRes.error || extRes.error || repRes.error) return null;
  const withContent = new Set<string>();
  for (const p of (postsRes.data ?? []) as { client_id: string; scheduled_date: string | null; sent_at: string }[]) {
    if (reportMonth(p) === month) withContent.add(p.client_id);
  }
  for (const e of (extRes.data ?? []) as { client_id: string }[]) withContent.add(e.client_id);
  const reps = new Map(((repRes.data ?? []) as { client_id: string; status: string; metrics_at: string | null }[])
    .map((r) => [r.client_id, r]));
  for (const c of (pontRes.data ?? []) as { id: string }[]) withContent.delete(c.id);
  const ids = [...withContent];
  return {
    day, month,
    numbersMissing: ids.filter((id) => !reps.get(id)?.metrics_at).length,
    reportsTotal: ids.length,
    reportsReady: ids.filter((id) => reps.get(id)?.status === 'pronto').length,
  };
}
