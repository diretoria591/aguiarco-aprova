import Link from 'next/link';
import type { Metadata } from 'next';
import { blockScheduler } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addMonths, currentMonth, fmtDate, monthLabel, monthOf } from '@/lib/format';
import { DEFAULT_REVISION_LIMIT, roundMap } from '@/lib/rounds';
import type { Comment } from '@/lib/types';

export const metadata: Metadata = { title: 'Rodadas extras' };
export const dynamic = 'force-dynamic';

type Row = Pick<Comment, 'id' | 'post_id' | 'content' | 'agency_error' | 'created_at' | 'author_name' | 'author_role' | 'kind'> & {
  posts: { id: string; title: string; client_id: string; clients: { id: string; name: string; revision_limit: number | null } | null } | null;
};
type Extra = { id: string; title: string; n: number; limit: number; content: string; at: string; by: string };

export default async function RodadasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await blockScheduler();
  const sp = await searchParams;
  const now = currentMonth();
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : now;

  const supabase = await createClient();
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
  const byClient = new Map<string, { name: string; items: Extra[] }>();
  for (const rows of byPost.values()) {
    const client = rows[0].posts!.clients!;
    const limit = client.revision_limit ?? DEFAULT_REVISION_LIMIT;
    const rounds = roundMap(rows as unknown as Comment[], limit);
    for (const r of rows) {
      const info = rounds.get(r.id);
      if (!info?.extra || monthOf(r.created_at) !== month) continue;
      const g = byClient.get(client.id) ?? { name: client.name, items: [] };
      g.items.push({ id: r.id, title: r.posts!.title, n: info.n, limit, content: r.content, at: r.created_at, by: r.author_name });
      byClient.set(client.id, g);
    }
  }
  const groups = [...byClient.values()].sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));
  const total = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Para cobrar à parte</p><h1>Rodadas <b>extras</b></h1></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link className="btn line sm" href={`/dashboard/rodadas?mes=${addMonths(month, -1)}`}>←</Link>
          <b suppressHydrationWarning>{monthLabel(month)}</b>
          <Link className="btn line sm" href={`/dashboard/rodadas?mes=${addMonths(month, 1)}`} aria-disabled={month >= now} style={month >= now ? { visibility: 'hidden' } : undefined}>→</Link>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 14, maxWidth: 820 }}>
        {error ? (
          <div className="card empty"><p style={{ margin: 0 }}>Não foi possível carregar: {error.message}</p></div>
        ) : !total ? (
          <div className="card empty">
            <h3>Nenhuma rodada extra em {monthLabel(month)}</h3>
            <p style={{ margin: 0 }}>Aqui aparecem os pedidos de alteração feitos depois do limite de rodadas de cada cliente. Os marcados como erro da agência não entram.</p>
          </div>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>
              <b>{total}</b> rodada{total > 1 ? 's' : ''} extra{total > 1 ? 's' : ''} em {groups.length} cliente{groups.length > 1 ? 's' : ''}.
            </p>
            {groups.map((g) => (
              <section className="card" key={g.name} style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <b>{g.name}</b>
                  <span className="muted small">{g.items.length} extra{g.items.length > 1 ? 's' : ''}</span>
                </div>
                {g.items.map((it) => (
                  <div key={it.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <div style={{ fontWeight: 500 }}>{it.title}</div>
                    <div className="small muted" suppressHydrationWarning>
                      {it.n}ª rodada (limite {it.limit}) · {it.by ? `${it.by} · ` : ''}{fmtDate(it.at)}
                    </div>
                    <div className="small" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{it.content}</div>
                  </div>
                ))}
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}
