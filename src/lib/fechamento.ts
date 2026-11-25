import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDate, monthLabel } from './format';
import { loadExtras, type ExtraGroup } from './rodadas-extras';
import { REGION_CURRENCY, money, priceOf, regionOf, round2, type BillingClient } from './cobranca';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Monta o e-mail de fechamento do mês: rodadas extras por cliente, para ajustar a cobrança. */
export async function buildFechamento(supabase: SupabaseClient, month: string, siteUrl: string) {
  const [{ groups, total, error }, clientsRes] = await Promise.all([
    loadExtras(supabase, month),
    supabase.from('clients').select('id,name,billing_region,extra_round_price,asaas_customer_id').order('name'),
  ]);
  if (error) throw new Error(error);
  if (clientsRes.error) throw new Error(clientsRes.error.message);
  const withExtra = new Set(groups.map((g) => g.id));
  const all = (clientsRes.data ?? []) as BillingClient[];
  const clean = all.filter((c) => !withExtra.has(c.id)).map((c) => c.name);
  const billing = new Map(all.map((c) => [c.id, c]));
  /** Valor de cada cliente: rodadas × preço da rodada, na moeda da região. */
  const bill = (g: ExtraGroup) => {
    const c = billing.get(g.id) ?? { id: g.id, name: g.name };
    const region = regionOf(c);
    const cur = REGION_CURRENCY[region];
    return { region, cur, linked: !!c.asaas_customer_id, total: round2(priceOf(c) * g.items.length), unit: priceOf(c) };
  };
  const europe = groups.filter((g) => bill(g).region === 'europa');
  const brazil = groups.filter((g) => bill(g).region === 'brasil');
  const sum = (gs: ExtraGroup[]) => round2(gs.reduce((s, g) => s + bill(g).total, 0));

  const label = monthLabel(month);
  const link = `${siteUrl.replace(/\/$/, '')}/dashboard/rodadas?mes=${month}`;
  const subject = total
    ? `Fechamento ${label}: ${total} rodada${total > 1 ? 's' : ''} extra${total > 1 ? 's' : ''} em ${groups.length} cliente${groups.length > 1 ? 's' : ''}`
    : `Fechamento ${label}: nenhuma rodada extra`;

  const block = (g: ExtraGroup) => `
<tr><td style="padding:16px 0 4px;border-top:1px solid #E8E4E0">
<p style="margin:0;font-size:16px;font-weight:600">${esc(g.name)} <span style="font-weight:400;color:#8C8781">· ${g.items.length} extra${g.items.length > 1 ? 's' : ''} · ${esc(money(bill(g).total, bill(g).cur))}${bill(g).region === 'europa' ? ' · cobrar pelo Wise' : bill(g).linked ? '' : ' · ligar ao Asaas'}</span></p>
${g.items.map((it) => `<p style="margin:8px 0 0;font-size:14px"><b style="font-weight:500">${esc(it.title)}</b><br>
<span style="font-size:12px;color:#8C8781">${it.n}ª rodada (limite ${it.limit}) · ${it.by ? esc(it.by) + ' · ' : ''}${esc(fmtDate(it.at))}</span><br>
<span style="font-size:13px;white-space:pre-wrap">${esc(it.content)}</span></p>`).join('')}
</td></tr>`;

  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">FECHAMENTO</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 4px;font-size:12px;color:#8C8781;text-transform:uppercase;letter-spacing:1px">Rodadas extras · ${esc(label)}</p>
<p style="margin:0 0 16px">${total
    ? `<b>${total}</b> rodada${total > 1 ? 's' : ''} extra${total > 1 ? 's' : ''} em <b>${groups.length}</b> cliente${groups.length > 1 ? 's' : ''}.${brazil.length ? ` Brasil: <b>${esc(money(sum(brazil), 'BRL'))}</b> para somar nas mensalidades do Asaas.` : ''}${europe.length ? ` Europa: <b>${esc(money(sum(europe), 'EUR'))}</b> para cobrar pelo Wise.` : ''}`
    : 'Nenhum cliente passou do limite de rodadas neste mês.'}</p>
${brazil.length ? `<p style="margin:16px 0 0;font-size:12px;color:#555250;font-weight:600;letter-spacing:1px;text-transform:uppercase">Brasil · somar na mensalidade (Asaas)</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${brazil.map(block).join('')}</table>` : ''}
${europe.length ? `<p style="margin:20px 0 0;font-size:12px;color:#555250;font-weight:600;letter-spacing:1px;text-transform:uppercase">Europa · cobrar pelo Wise</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${europe.map(block).join('')}</table>` : ''}
${clean.length ? `<p style="margin:20px 0 0;font-size:13px;color:#8C8781">Sem rodadas extras: ${clean.map(esc).join(', ')}.</p>` : ''}
<p style="margin:20px 0 0;font-size:12px;color:#8C8781">Pedidos marcados como erro da agência não entram.</p>
<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#2C2C2C;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:999px">${total ? 'Revisar e cobrar no Aprova' : 'Abrir no Aprova'}</a></p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    `Fechamento ${label} · rodadas extras`, '',
    total ? `${total} rodada(s) extra(s) em ${groups.length} cliente(s).` : 'Nenhuma rodada extra neste mês.',
    brazil.length ? `Brasil (somar nas mensalidades do Asaas): ${money(sum(brazil), 'BRL')}` : '',
    europe.length ? `Europa (cobrar pelo Wise): ${money(sum(europe), 'EUR')}` : '', '',
    ...groups.flatMap((g) => [
      `${g.name}: ${g.items.length} extra(s) · ${money(bill(g).total, bill(g).cur)}${bill(g).region === 'europa' ? ' · cobrar pelo Wise' : ''}`,
      ...g.items.map((it) => `  - ${it.title} (${it.n}ª rodada, limite ${it.limit}, ${fmtDate(it.at)}): ${it.content}`),
      '',
    ]),
    clean.length ? `Sem rodadas extras: ${clean.join(', ')}.` : '',
    '', link,
  ].join('\n');

  return { subject, html, text, total };
}

export async function sendFechamento(mail: { subject: string; html: string; text: string }, month: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  const to = (process.env.FECHAMENTO_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key) throw new Error('RESEND_API_KEY não configurada.');
  if (!from) throw new Error('NOTIFY_EMAIL_FROM não configurado.');
  if (!to.length) throw new Error('FECHAMENTO_EMAIL não configurado.');

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // o mesmo mês nunca sai duas vezes, mesmo se o agendador repetir a chamada
      'Idempotency-Key': `fechamento-${month}`,
    },
    body: JSON.stringify({ from, to, ...mail }),
  });
  if (!r.ok) {
    let msg = `Resend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.message) msg += `: ${j.message}`; } catch { /* corpo vazio */ }
    throw new Error(msg);
  }
}
