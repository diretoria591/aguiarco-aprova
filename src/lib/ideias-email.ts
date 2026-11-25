import 'server-only';
import { firstName, monthLabel } from './format';
import { segmentLabel } from './segments';
import type { Idea } from './ideias';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * E-mail para a estrategista quando o relatório fica pronto:
 * "Esses conteúdos tiveram maior performance. Aposte neles na próxima remessa."
 */
export function ideasEmail(o: {
  to: string; clientName: string; segment: string; month: string; tops: Idea[]; others: Idea[];
  why: string; reportUrl: string; bankUrl: string;
}) {
  const label = monthLabel(o.month).toLowerCase();
  const hi = firstName(o.to);
  const area = o.segment ? segmentLabel(o.segment).toLowerCase() : '';

  const card = (i: Idea, showClient: boolean) => `
<tr><td style="padding:12px 0;border-top:1px solid #E8E4E0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="84" valign="top" style="padding-right:14px">${i.cover
    ? `<img src="${esc(i.cover)}" width="84" height="105" alt="" style="display:block;width:84px;height:105px;object-fit:cover;border-radius:8px;background:#EFECE9">`
    : '<div style="width:84px;height:105px;border-radius:8px;background:#EFECE9"></div>'}</td>
<td valign="top" style="font-size:14px;line-height:1.5">
<p style="margin:0 0 2px;font-size:11px;color:#8C8781;text-transform:uppercase;letter-spacing:1px">${esc(i.formatLabel)}${showClient ? ` · ${esc(i.clientName)}` : ''}</p>
<p style="margin:0 0 4px;font-weight:600">${esc(i.title)}</p>
${i.caption ? `<p style="margin:0;font-size:13px;color:#555250">${esc(clip(i.caption, 180))}</p>` : ''}
</td></tr></table></td></tr>`;

  const subject = `${o.clientName}: aposte nestes conteúdos na próxima remessa`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">BANCO DE IDEIAS</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">${hi ? `Oi, ${esc(hi)}! ` : ''}O relatório de ${esc(label)} de <b>${esc(o.clientName)}</b> ficou pronto.</p>
<p style="margin:0 0 16px;font-size:17px;font-weight:600">Esses conteúdos tiveram maior performance. Aposte neles na próxima remessa.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${o.tops.map((i) => card(i, false)).join('')}</table>
${o.why ? `<div style="background:#F3EAE3;border-radius:10px;padding:12px 14px;margin:16px 0 0;font-size:13px;white-space:pre-wrap"><b style="color:#7A5A47">Por que funcionaram (do relatório):</b>\n${esc(o.why)}</div>` : ''}
${o.others.length ? `<p style="margin:24px 0 4px;font-size:12px;color:#555250;font-weight:600;letter-spacing:1px;text-transform:uppercase">Também funcionou em outros clientes${area ? ` · ${esc(segmentLabel(o.segment))}` : ''}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${o.others.map((i) => card(i, true)).join('')}</table>` : ''}
<p style="margin:20px 0 0">
<a href="${esc(o.bankUrl)}" style="display:inline-block;background:#2C2C2C;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:999px;margin:0 8px 8px 0">Abrir o banco de ideias</a>
<a href="${esc(o.reportUrl)}" style="display:inline-block;color:#7A5A47;font-weight:600;font-size:14px;padding:12px 0">Ver o relatório →</a>
</p>
</td></tr></table>
<p style="font-size:11.5px;color:#B5B0AA;margin:14px 0 0">Aviso automático do Aguiar&amp;Co Aprova, enviado quando o relatório é marcado como pronto.</p>
</td></tr></table></body></html>`;

  const text = [
    `${hi ? `Oi, ${hi}! ` : ''}O relatório de ${label} de ${o.clientName} ficou pronto.`, '',
    'Esses conteúdos tiveram maior performance. Aposte neles na próxima remessa:',
    ...o.tops.map((i) => `- ${i.title} (${i.formatLabel})`),
    o.why ? `\nPor que funcionaram (do relatório):\n${o.why}` : '',
    o.others.length ? `\nTambém funcionou em outros clientes${area ? ` (${segmentLabel(o.segment)})` : ''}:` : '',
    ...o.others.map((i) => `- ${i.title} (${i.formatLabel} · ${i.clientName})`),
    '', `Banco de ideias: ${o.bankUrl}`, `Relatório: ${o.reportUrl}`,
  ].filter((l, k, a) => l !== '' || a[k - 1] !== '').join('\n');

  return { subject, html, text };
}

export async function sendResendEmail(mail: { to: string[]; subject: string; html: string; text: string }, idempotencyKey: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  if (!key) throw new Error('RESEND_API_KEY não configurada.');
  if (!from) throw new Error('NOTIFY_EMAIL_FROM não configurado.');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ from, ...mail }),
  });
  if (!r.ok) {
    let msg = `Resend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.message) msg += `: ${j.message}`; } catch { /* corpo vazio */ }
    throw new Error(msg);
  }
}
