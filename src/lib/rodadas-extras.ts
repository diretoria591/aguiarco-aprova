import type { SupabaseClient } from '@supabase/supabase-js';
import { monthOf } from './format';
import { DEFAULT_REVISION_LIMIT, roundMap } from './rounds';
import type { Comment } from './types';

type Row = Pick<Comment, 'id' | 'post_id' | 'content' | 'agency_error' | 'created_at' | 'author_name' | 'author_role' | 'kind'> & {
  posts: { id: string; title: string; client_id: string; clients: { id: string; name: string; revision_limit: number | null } | null } | null;
};
export type Extra = { id: string; title: string; n: number; limit: number; content: string; at: string; by: string };
export type ExtraGroup = { id: string; name: string; items: Extra[] };

/** Rodadas extras (pedidos de alteração além do limite) de um mês, agrupadas por cliente. */
export async function loadExtras(supabase: SupabaseClient, month: string) {
  const { data, error } = await supabase
    .from('comments')
    .select('id,post_id,content,agency_error,created_at,author_name,author_role,kind, posts(id,title,client_id, clients(id,name,revision_limit))')
    .eq('author_role', 'client')
    .eq('kind', 'adjustment')
    .order('created_at', { ascending: true });

  // a rodada de cada pedido é contada desde o primeiro, de todos os meses; aqui só entram os extras do mês escolhido
  const byPost = new Map<string, Row[]>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (!r.posts?.clients) continue;
    byPost.set(r.post_id, [...(byPost.get(r.post_id) ?? []), r]);
  }
  const byClient = new Map<string, ExtraGroup>();
  for (const rows of byPost.values()) {
    const client = rows[0].posts!.clients!;
    const limit = client.revision_limit ?? DEFAULT_REVISION_LIMIT;
    const rounds = roundMap(rows as unknown as Comment[], limit);
    for (const r of rows) {
      const info = rounds.get(r.id);
      if (!info?.extra || monthOf(r.created_at) !== month) continue;
      const g = byClient.get(client.id) ?? { id: client.id, name: client.name, items: [] };
      g.items.push({ id: r.id, title: r.posts!.title, n: info.n, limit, content: r.content, at: r.created_at, by: r.author_name });
      byClient.set(client.id, g);
    }
  }
  const groups = [...byClient.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  const total = groups.reduce((s, g) => s + g.items.length, 0);
  return { groups, total, error: error?.message ?? null };
}
