import 'server-only';
import { firstName } from './format';
import { dayLabel } from './alteracoes';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * E-mail para quem vai fazer a alteração: novo pedido, a vez dela depois de outra pessoa
 * ou a revisão devolvendo com recado.
 */
export function demandaEmail(o: {
  to: string; kind: 'nova' | 'vez' | 'volta'; clientName: string; title: string; format: string; version: number;
  ask: string; due: string | null; publish: string | null; by: string; next: string | null; prevName?: string; prevNote?: string;
  backNote?: string; url: string;
}) {
  const hi = firstName(o.to);
  const lead = o.kind === 'volta'
    ? `<b>${esc(o.by)}</b> revisou a alteração de <b>${esc(o.clientName)}</b> e pediu um ajuste.`
    : o.kind === 'vez'
      ? `<b>${esc(o.prevName ?? 'A equipe')}</b> terminou a parte dela da alteração de <b>${esc(o.clientName)}</b>. <b>Agora é a sua vez.</b>`
      : `<b>${esc(o.clientName)}</b> pediu uma alteração e ${esc(firstName(o.by))} encaminhou para você.${o.next ? ` <b>Você é a primeira.</b> Quando terminar, passa para ${esc(o.next)}.` : ''}`;
  const prazo = o.due ? `<b>Prazo: ${esc(dayLabel(o.due, true))}.</b>${o.publish ? ` A publicação é ${esc(dayLabel(o.publish, true))}.` : ''}` : '';
  const subject = o.kind === 'volta'
    ? `Ajuste pedido na revisão: ${o.clientName}`
    : `Alteração para fazer: ${o.clientName}${o.due ? ` · prazo ${dayLabel(o.due)}` : ''}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#ffffff;padding:18px 22px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">ALTERAÇÃO PARA FAZER</span></td></tr>
<tr><td style="padding:22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Oi${hi ? `, ${esc(hi)}` : ''}!</p>
<div style="background:#F3EAE3;border-radius:10px;padding:12px 14px;margin:0 0 14px">${lead}${prazo ? `<br>${prazo}` : ''}</div>
<p style="margin:0 0 4px;font-size:12px;color:#8C8781">${esc(o.format)} “${esc(o.title)}” · versão ${o.version}</p>
${o.ask ? `<div style="background:#FFF3E0;border-radius:10px;padding:10px 12px;margin:6px 0 14px;font-size:14px"><b style="color:#A15C07">O cliente pediu:</b> “${esc(o.ask)}”</div>` : ''}
${o.prevNote ? `<div style="background:#F7F6F4;border-radius:10px;padding:10px 12px;margin:0 0 14px;font-size:14px"><b>${esc(o.prevName ?? '')}:</b> ${esc(o.prevNote)}</div>` : ''}
${o.backNote ? `<div style="background:#FDEBDD;border-radius:10px;padding:10px 12px;margin:0 0 14px;font-size:14px"><b style="color:#C2560C">Recado da revisão:</b> ${esc(o.backNote)}</div>` : ''}
<p style="margin:16px 0 10px"><a href="${esc(o.url)}" style="display:inline-block;background:#E1CABA;color:#2C2C2C;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:999px">Abrir minhas demandas</a></p>
<p style="margin:0;font-size:12.5px;color:#8C8781">Quando terminar, entregue pelo Aprova. A nova versão passa pela revisão da Kim ou do João antes de ir para o cliente.</p>
</td></tr></table>
<p style="font-size:11.5px;color:#B5B0AA;margin:14px 0 0">Aviso automático do Aguiar&amp;Co Aprova.</p>
</td></tr></table></body></html>`;
  const text = [
    `Oi${hi ? `, ${hi}` : ''}!`, '',
    o.kind === 'volta' ? `${o.by} revisou a alteração de ${o.clientName} e pediu um ajuste.`
      : o.kind === 'vez' ? `${o.prevName ?? 'A equipe'} terminou a parte dela da alteração de ${o.clientName}. Agora é a sua vez.`
        : `${o.clientName} pediu uma alteração e ${firstName(o.by)} encaminhou para você.${o.next ? ` Você é a primeira. Quando terminar, passa para ${o.next}.` : ''}`,
    o.due ? `Prazo: ${dayLabel(o.due, true)}.${o.publish ? ` A publicação é ${dayLabel(o.publish, true)}.` : ''}` : '',
    '', `${o.format} “${o.title}” · versão ${o.version}`,
    o.ask ? `O cliente pediu: “${o.ask}”` : '',
    o.prevNote ? `${o.prevName ?? ''}: ${o.prevNote}` : '',
    o.backNote ? `Recado da revisão: ${o.backNote}` : '',
    '', `Abrir minhas demandas: ${o.url}`,
  ].filter((l, k, a) => l !== '' || a[k - 1] !== '').join('\n');
  return { subject, html, text };
}
