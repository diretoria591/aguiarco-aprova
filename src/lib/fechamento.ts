import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fmtDate, monthLabel } from './format';
import { loadExtras, type ExtraGroup } from './rodadas-extras';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Monta o e-mail de fechamento do mês: rodadas extras por cliente, para ajustar a cobrança. */
export async function buildFechamento(supabase: SupabaseClient, month: string, siteUrl: string) {
  const [{ groups, total, error }, clientsRes] = await Promise.all([
    loadExtras(supabase, month),
    supabase.from('clients').select('id,name').order('name'),
  ]);
  if (error) throw new Error(error);
  if (clientsRes.error) throw new Error(clientsRes.error.message);
  const withExtra = new Set(groups.map((g) => g.id));
  const clean = ((clientsRes.data ?? []) as { id: string; name: string }[]).filter((c) => !withExtra.has(c.id)).map((c) => c.name);

  const label = monthLabel(month);
  const link = `${siteUrl.replace(/\/$/, '')}/dashboard/rodadas?mes=${month}`;
  const subject = total
    ? `Fechamento ${label}: ${total} rodada${total > 1 ? 's' : ''} extra${total > 1 ? 's' : ''} em ${groups.length} cliente${groups.length > 1 ? 's' : ''}`
    : `Fechamento ${label}: nenhuma rodada extra`;

  const block = (g: ExtraGroup) => `
<tr><td style="padding:16px 0 4px;border-top:1px solid #E8E4E0">
<p style="margin:0;font-size:16px;font-weight:600">${esc(g.name)} <span style="font-weight:400;color:#8C8781">· ${g.items.length} extra${g.items.length > 1 ? 's' : ''}</span></p>
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
    ? `<b>${total}</b> rodada${total > 1 ? 's' : ''} extra${total > 1 ? 's' : ''} em <b>${groups.length}</b> cliente${groups.length > 1 ? 's' : ''}. Use este resumo para ajustar a cobrança do mês.`
    : 'Nenhum cliente passou do limite de rodadas neste mês.'}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${groups.map(block).join('')}</table>
${clean.length ? `<p style="margin:20px 0 0;font-size:13px;color:#8C8781">Sem rodadas extras: ${clean.map(esc).join(', ')}.</p>` : ''}
<p style="margin:20px 0 0;font-size:12px;color:#8C8781">Pedidos marcados como erro da agência não entram.</p>
<p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#2C2C2C;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:999px">Abrir no Aprova</a></p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    `Fechamento ${label} · rodadas extras`, '',
    total ? `${total} rodada(s) extra(s) em ${groups.length} cliente(s).` : 'Nenhuma rodada extra neste mês.', '',
    ...groups.flatMap((g) => [
      `${g.name}: ${g.items.length} extra(s)`,
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
