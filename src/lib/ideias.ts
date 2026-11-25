import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TYPES } from './constants';
import type { PostFormat } from './types';

/**
 * Banco de ideias: os conteúdos marcados como "Performou" nos relatórios mensais,
 * de todos os clientes, para reaproveitar o formato com clientes da mesma área.
 */
export type Idea = {
  id: string;
  title: string;
  caption: string;
  format: string;
  formatLabel: string;
  cover: string | null;
  clientId: string;
  clientName: string;
  clientLogo: string | null;
  segment: string;
  /** Mês do relatório (AAAA-MM). */
  month: string;
  /** Texto "Conteúdos que performaram" do relatório: por que funcionou. */
  why: string;
};

type Rep = { client_id: string; ref_month: string; highlights: string | null; post_marks: Record<string, string> | null };
type PostRow = {
  id: string; title: string; caption: string | null; format: string;
  post_media: { file_url: string; file_type: string; order_index: number }[];
};
type ExtRow = { id: string; title: string; caption: string | null; format: string; format_label: string | null; image_url: string | null };
type ClientRow = { id: string; name: string; logo_url: string | null; segment: string | null };

const cover = (media: PostRow['post_media']) =>
  [...media].sort((a, b) => a.order_index - b.order_index)
    .find((m) => m.file_type.startsWith('cover/image/') || m.file_type.startsWith('image/'))?.file_url ?? null;

async function inChunks<T>(ids: string[], load: (part: string[]) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await load(ids.slice(i, i + 150));
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** Todas as ideias, do mês mais recente para o mais antigo. `sinceMonth` (AAAA-MM) limita o período. */
export async function loadIdeas(supabase: SupabaseClient, opts: { sinceMonth?: string } = {}): Promise<Idea[]> {
  let q = supabase.from('relatorios').select('client_id,ref_month,highlights,post_marks');
  if (opts.sinceMonth) q = q.gte('ref_month', opts.sinceMonth);
  const { data: reps, error } = await q;
  if (error) throw new Error(error.message);

  const marked = new Map<string, Rep>();
  for (const r of (reps ?? []) as Rep[]) {
    for (const [id, m] of Object.entries(r.post_marks ?? {})) if (m === 'top') marked.set(id, r);
  }
  const ids = [...marked.keys()];
  if (!ids.length) return [];

  const [posts, externos, clients] = await Promise.all([
    inChunks<PostRow>(ids, (part) => supabase.from('posts').select('id,title,caption,format,post_media(file_url,file_type,order_index)').in('id', part)),
    inChunks<ExtRow>(ids, (part) => supabase.from('posts_externos').select('id,title,caption,format,format_label,image_url').in('id', part)),
    inChunks<ClientRow>([...new Set([...marked.values()].map((r) => r.client_id))],
      (part) => supabase.from('clients').select('id,name,logo_url,segment').in('id', part)),
  ]);
  const byClient = new Map(clients.map((c) => [c.id, c]));

  const ideas: Idea[] = [];
  const add = (id: string, base: Pick<Idea, 'title' | 'caption' | 'format' | 'formatLabel' | 'cover'>) => {
    const r = marked.get(id)!;
    const c = byClient.get(r.client_id);
    if (!c) return;
    ideas.push({
      id, ...base, clientId: c.id, clientName: c.name, clientLogo: c.logo_url, segment: c.segment ?? '',
      month: r.ref_month, why: (r.highlights ?? '').trim(),
    });
  };
  for (const p of posts) {
    add(p.id, { title: p.title, caption: p.caption ?? '', format: p.format, formatLabel: TYPES[p.format as PostFormat]?.label ?? 'Post', cover: cover(p.post_media ?? []) });
  }
  for (const e of externos) {
    add(e.id, { title: e.title, caption: e.caption ?? '', format: e.format, formatLabel: TYPES[e.format as PostFormat]?.label ?? (e.format_label || 'Post'), cover: e.image_url || null });
  }
  return ideas.sort((a, b) => b.month.localeCompare(a.month) || a.clientName.localeCompare(b.clientName));
}
