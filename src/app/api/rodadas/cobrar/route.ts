import { NextResponse, type NextRequest } from 'next/server';
import { currentViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { monthLabel } from '@/lib/format';
import { loadExtras } from '@/lib/rodadas-extras';
import { createPayment, nextMonthly, updatePayment } from '@/lib/asaas';
import { REGION_CURRENCY, money, priceOf, regionOf, round2, type BillingClient } from '@/lib/cobranca';

export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const TZ = process.env.NEXT_PUBLIC_TIMEZONE || 'America/Sao_Paulo';
const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * Cobra as rodadas extras de um cliente num mês (só a dona da conta).
 * via "asaas" (Brasil): soma na próxima mensalidade em aberto, no mesmo vencimento, com a descrição dos pedidos.
 * via "wise" (Europa): só registra que a cobrança foi feita pelo Wise.
 * Uma cobrança por cliente e mês; o banco impede cobrar duas vezes.
 */
export async function POST(req: NextRequest) {
  const viewer = await currentViewer();
  if (!viewer?.real.owner) return NextResponse.json({ error: 'Só a dona da conta pode gerar cobranças.' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { clientId?: string; month?: string; commentIds?: unknown; via?: string };
  const clientId = String(body.clientId ?? '');
  const month = String(body.month ?? '');
  const via = body.via === 'wise' ? 'wise' : 'asaas';
  const ids = Array.isArray(body.commentIds) ? [...new Set(body.commentIds.map(String))] : [];
  if (!UUID_RE.test(clientId) || !MONTH_RE.test(month) || !ids.length || ids.some((x) => !UUID_RE.test(x))) {
    return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: c, error: cErr } = await supabase.from('clients')
    .select('id,name,billing_region,extra_round_price,asaas_customer_id').eq('id', clientId).maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!c) return NextResponse.json({ error: 'Cliente não encontrado.' }, { status: 404 });
  const client = c as BillingClient;
  const region = regionOf(client);
  if (via === 'wise' && region !== 'europa') return NextResponse.json({ error: 'Este cliente é cobrado pelo Asaas.' }, { status: 400 });
  if (via === 'asaas' && region !== 'brasil') return NextResponse.json({ error: 'Este cliente é cobrado pelo Wise.' }, { status: 400 });
  if (via === 'asaas' && !client.asaas_customer_id) return NextResponse.json({ error: 'Ligue este cliente ao cadastro dele no Asaas primeiro.' }, { status: 400 });

  // confere no servidor que os pedidos são mesmo rodadas extras deste cliente neste mês
  const { groups, error: exErr } = await loadExtras(supabase, month);
  if (exErr) return NextResponse.json({ error: exErr }, { status: 500 });
  const items = (groups.find((g) => g.id === clientId)?.items ?? []).filter((it) => ids.includes(it.id));
  if (items.length !== ids.length) return NextResponse.json({ error: 'A lista de rodadas mudou. Atualize a página.' }, { status: 409 });

  const unit = priceOf(client);
  const currency = REGION_CURRENCY[region];
  const total = round2(unit * items.length);

  // trava: uma cobrança por cliente e mês (uma tentativa que falhou pode ser refeita)
  const { data: prev } = await supabase.from('extra_charges').select('id,status').eq('client_id', clientId).eq('ref_month', month).maybeSingle();
  if (prev && prev.status !== 'falhou') return NextResponse.json({ error: 'As rodadas deste mês já foram cobradas.' }, { status: 409 });
  if (prev) await supabase.from('extra_charges').delete().eq('id', prev.id).eq('status', 'falhou');
  const { data: row, error: insErr } = await supabase.from('extra_charges').insert({
    client_id: clientId, ref_month: month, comment_ids: ids, rounds: items.length, unit_price: unit, currency, total,
    status: 'cobrando', charged_by: viewer.real.name,
  }).select('id').single();
  if (insErr || !row) {
    const dup = insErr?.code === '23505';
    return NextResponse.json({ error: dup ? 'Outra cobrança deste mês já está em andamento.' : insErr?.message ?? 'Falha ao registrar.' }, { status: dup ? 409 : 500 });
  }

  const now = new Date().toISOString();
  if (via === 'wise') {
    await supabase.from('extra_charges').update({ status: 'wise', charged_at: now }).eq('id', row.id);
    return NextResponse.json({ ok: true, status: 'wise', total, currency });
  }

  const label = monthLabel(month).toLowerCase();
  const head = `Rodadas extras de ${label}: ${items.length} × ${money(unit, currency)} = ${money(total, currency)}`;
  const lines = items.map((it) => `• ${it.title}: ${clip(it.content.replace(/\s+/g, ' ').trim(), 90)}`);
  try {
    const { payment, subscription } = await nextMonthly(client.asaas_customer_id!, todayYmd());
    if (payment) {
      const desc = clip([payment.description?.trim(), head, ...lines].filter(Boolean).join('\n'), 500);
      const updated = await updatePayment(payment, round2(payment.value + total), desc);
      await supabase.from('extra_charges').update({
        status: 'mensalidade', asaas_payment_id: updated.id, asaas_due_date: updated.dueDate,
        asaas_invoice_url: updated.invoiceUrl ?? '', previous_value: payment.value, charged_at: now, error: '',
      }).eq('id', row.id);
      return NextResponse.json({ ok: true, status: 'mensalidade', total, currency, dueDate: updated.dueDate, newValue: updated.value });
    }
    if (subscription) {
      const created = await createPayment({
        customer: client.asaas_customer_id!, billingType: subscription.billingType, value: total, dueDate: subscription.nextDueDate,
        description: clip([head, ...lines].join('\n'), 500), externalReference: `aprova-extras-${row.id}`,
      });
      await supabase.from('extra_charges').update({
        status: 'avulsa', asaas_payment_id: created.id, asaas_due_date: created.dueDate,
        asaas_invoice_url: created.invoiceUrl ?? '', charged_at: now, error: '',
      }).eq('id', row.id);
      return NextResponse.json({ ok: true, status: 'avulsa', total, currency, dueDate: created.dueDate });
    }
    throw new Error('Este cliente não tem mensalidade em aberto nem assinatura ativa no Asaas.');
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await supabase.from('extra_charges').update({ status: 'falhou', error: msg }).eq('id', row.id);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
