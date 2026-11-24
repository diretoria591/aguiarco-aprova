import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addMonths, currentMonth, fmtDay, monthLabel } from '@/lib/format';

export const metadata: Metadata = { title: 'Lembretes' };
export const dynamic = 'force-dynamic';

type Lembrete = {
  id: string; ref_month: string; event_day: string | null; title: string;
  theme: string; description: string; client_label: string; sort_order: number;
};

function Item({ l }: { l: Lembrete }) {
  return (
    <div style={{ display: 'grid', gap: 4, padding: '12px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <b>{l.title}</b>
        {l.event_day && <span className="muted small">{fmtDay(l.event_day)}</span>}
        {l.theme && <span className="muted small">· {l.theme}</span>}
        {l.client_label && <span className="muted small">· {l.client_label}</span>}
      </div>
      {l.description && <p className="muted" style={{ margin: 0 }}>{l.description}</p>}
    </div>
  );
}

export default async function LembretesPage() {
  await requireSection('lembretes');
  const now = currentMonth();
  const next = addMonths(now, 1);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lembretes').select('*').gte('ref_month', next)
    .order('ref_month').order('sort_order');
  const rows = (data ?? []) as Lembrete[];
  const missing = error && /does not exist|schema cache|relation/i.test(error.message);

  const upcoming = rows.filter((r) => r.ref_month === next);
  const later = new Map<string, Lembrete[]>();
  rows.filter((r) => r.ref_month > next).forEach((r) => later.set(r.ref_month, [...(later.get(r.ref_month) ?? []), r]));

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Planejar com um mês de antecedência</p><h1>Lembre<b>tes</b></h1></div>
      </div>
      <div style={{ display: 'grid', gap: 14, maxWidth: 820 }}>
        {error ? (
          <div className="card empty">
            <p style={{ margin: 0 }}>
              {missing
                ? 'A aba Lembretes ainda não foi ativada no banco. Rode o arquivo supabase/migrations/2026-11-24_lembretes.sql no SQL Editor do Supabase.'
                : `Não foi possível carregar: ${error.message}`}
            </p>
          </div>
        ) : (
          <>
            <section className="card" style={{ padding: '16px 18px' }}>
              <p className="eyebrow" style={{ margin: 0 }}>Para planejar agora</p>
              <h3 style={{ margin: '4px 0 8px' }} suppressHydrationWarning>O que acontece em {monthLabel(next)}</h3>
              {upcoming.length ? upcoming.map((l) => <Item key={l.id} l={l} />) : (
                <p className="muted" style={{ margin: 0 }}>Nenhum lembrete cadastrado para {monthLabel(next)}.</p>
              )}
            </section>
            {[...later.entries()].map(([m, items]) => (
              <section className="card" key={m} style={{ padding: '16px 18px' }}>
                <p className="eyebrow" style={{ margin: 0 }}>Mais adiante</p>
                <h3 style={{ margin: '4px 0 8px' }} suppressHydrationWarning>{monthLabel(m)}</h3>
                {items.map((l) => <Item key={l.id} l={l} />)}
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}
