import Link from 'next/link';
import type { Metadata } from 'next';
import { blockScheduler } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addMonths, currentMonth, fmtDate, monthLabel } from '@/lib/format';
import { reportMonth } from '@/lib/relatorio';
import { Mono } from '@/components/ui';

export const metadata: Metadata = { title: 'Relatórios' };
export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function RelatoriosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await blockScheduler();
  const sp = await searchParams;
  const now = currentMonth();
  // padrão: mês anterior, que é o da reunião de desempenho
  const month = sp.mes && MONTH_RE.test(sp.mes) ? sp.mes : addMonths(now, -1);

  const supabase = await createClient();
  const [clientsRes, postsRes, repRes] = await Promise.all([
    supabase.from('clients').select('id,name,logo_url').order('name'),
    supabase.from('posts').select('client_id,status,scheduled_date,sent_at'),
    supabase.from('relatorios').select('client_id,status,reviewed_by,reviewed_at,updated_at').eq('ref_month', month),
  ]);
  const error = clientsRes.error ?? postsRes.error ?? repRes.error;

  type P = { client_id: string; status: string; scheduled_date: string | null; sent_at: string };
  const count = new Map<string, number>();
  for (const p of (postsRes.data ?? []) as P[]) {
    if (reportMonth(p) === month) count.set(p.client_id, (count.get(p.client_id) ?? 0) + 1);
  }
  type R = { client_id: string; status: string; reviewed_by: string; reviewed_at: string | null; updated_at: string };
  const reps = new Map(((repRes.data ?? []) as R[]).map((r) => [r.client_id, r]));
  const clients = ((clientsRes.data ?? []) as { id: string; name: string; logo_url: string | null }[])
    .map((c) => ({ ...c, n: count.get(c.id) ?? 0, rep: reps.get(c.id) ?? null }))
    .sort((a, b) => Number(b.n > 0) - Number(a.n > 0) || a.name.localeCompare(b.name));
  const ready = clients.filter((c) => c.rep?.status === 'pronto').length;
  const withContent = clients.filter((c) => c.n > 0).length;

  return (
    <>
      <div className="hello">
        <div><p className="eyebrow">Reunião de desempenho</p><h1>Relatórios <b>mensais</b></h1></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link className="btn line sm" href={`/dashboard/relatorios?mes=${addMonths(month, -1)}`}>←</Link>
          <b suppressHydrationWarning>{monthLabel(month)}</b>
          <Link className="btn line sm" href={`/dashboard/relatorios?mes=${addMonths(month, 1)}`} style={month >= now ? { visibility: 'hidden' } : undefined}>→</Link>
        </div>
      </div>
      <div style={{ display: 'grid', gap: 12, maxWidth: 820 }}>
        {error ? (
          <div className="card empty"><p style={{ margin: 0 }}>Não foi possível carregar: {error.message}</p></div>
        ) : (
          <>
            <p className="muted small" style={{ margin: 0 }}>
              {withContent} cliente{withContent === 1 ? '' : 's'} com conteúdo em {monthLabel(month)} · {ready} relatório{ready === 1 ? '' : 's'} pronto{ready === 1 ? '' : 's'}.
              {' '}O rascunho chega no dia 1. <b>Prazo: relatórios prontos até o dia 5</b> e reunião marcada com cada cliente para apresentar o planejamento estratégico.
            </p>
            {clients.map((c) => (
              <Link key={c.id} href={`/dashboard/relatorios/${c.id}?mes=${month}`} className="card"
                style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', opacity: c.n ? 1 : 0.6 }}>
                <Mono name={c.name} logo={c.logo_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontWeight: 600 }}>{c.name}</b>
                  <div className="small muted" suppressHydrationWarning>
                    {c.n ? `${c.n} conteúdo${c.n > 1 ? 's' : ''} no mês` : 'Nenhum conteúdo no mês'}
                    {c.rep?.status === 'pronto' && c.rep.reviewed_at ? ` · revisado por ${c.rep.reviewed_by || 'equipe'} ${fmtDate(c.rep.reviewed_at, false)}` : ''}
                  </div>
                </div>
                {c.rep?.status === 'pronto'
                  ? <span className="status aprovado">Pronto</span>
                  : c.rep ? <span className="status pendente">Rascunho</span>
                  : <span className="muted small">Não iniciado</span>}
              </Link>
            ))}
          </>
        )}
      </div>
    </>
  );
}
