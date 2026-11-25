import Link from 'next/link';
import type { Metadata } from 'next';
import { requireSection } from '@/lib/auth';
import type { BillingClient, ExtraCharge } from '@/lib/cobranca';
import { createClient } from '@/lib/supabase/server';
import { addMonths, currentMonth, monthLabel } from '@/lib/format';
import { loadExtras } from '@/lib/rodadas-extras';
import { BillingSetup, ClientExtras } from './cobranca';

export const metadata: Metadata = { title: 'Rodadas extras' };
export const dynamic = 'force-dynamic';

export default async function RodadasPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const viewer = await requireSection('rodadas');
  const owner = viewer.real.owner;
  const sp = await searchParams;
  const now = currentMonth();
  const month = sp.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes) ? sp.mes : now;

  const supabase = await createClient();
  const [{ groups, total, error }, clientsRes, chargesRes] = await Promise.all([
    loadExtras(supabase, month),
    supabase.from('clients').select('id,name,client_type,billing_region,extra_round_price,asaas_customer_id').order('name'),
    supabase.from('extra_charges').select('*').eq('ref_month', month),
  ]);
  const clients = (clientsRes.data ?? []) as (BillingClient & { client_type?: string })[];
  const byId = new Map(clients.map((c) => [c.id, c]));
  const charges = new Map(((chargesRes.data ?? []) as ExtraCharge[]).map((c) => [c.client_id, c]));

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
              <ClientExtras key={g.id} client={byId.get(g.id) ?? { id: g.id, name: g.name }} items={g.items}
                charge={charges.get(g.id) ?? null} month={month} owner={owner} />
            ))}
          </>
        )}
        {owner && !clientsRes.error && <BillingSetup clients={clients.filter((c) => c.client_type !== 'pontual')} />}
      </div>
    </>
  );
}
