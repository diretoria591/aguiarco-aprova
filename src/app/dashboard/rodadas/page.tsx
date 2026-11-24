import Link from 'next/link';
import type { Metadata } from 'next';
import { blockScheduler } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addMonths, currentMonth, fmtDate, monthLabel } from '@/lib/format';
import { loadExtras } from '@/lib/rodadas-extras';

export const metadata: Metadata = { title: 'Rodadas extras' };
export const dynamic = 'force-dynamic';

export default async function RodadasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await blockScheduler();
  const sp = await searchParams;
  const now = currentMonth();
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : now;

  const supabase = await createClient();
  const { groups, total, error } = await loadExtras(supabase, month);

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
          <div className="card empty"><p style={{ margin: 0 }}>Não foi possível carregar: {error}</p></div>
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
