import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TYPES } from './constants';
import { fmtDay } from './format';
import { materialsOf } from './media';
import type { Client, Post } from './types';
import { isWhatsappNote } from './whatsapp-note';

type OutboxKind = 'approval' | 'adjustment' | 'rejection' | 'comment';
type OutboxRow = { id: string; post_id: string; client_id: string; channel: 'email' | 'whatsapp'; attempts: number; kind?: OutboxKind; comment_id?: string | null };
type Result = { processed: number; sent: number; failed: number };

const MAX_ATTEMPTS = 3;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Envia os avisos pendentes da fila (notification_outbox).
 * Chamado pelo banco (pg_net) logo depois que o cliente aprova, pede
 * alteração, reprova ou comenta.
 * Falha de um canal vira registro em activity_logs e nova tentativa depois;
 * nunca afeta a aprovação, que já foi gravada.
 */
export async function dispatchNotifications(admin: SupabaseClient, siteUrl: string): Promise<Result> {
  const res: Result = { processed: 0, sent: 0, failed: 0 };

  // envio que travou no meio (servidor caiu) volta para a fila
  await admin.from('notification_outbox').update({ status: 'pending' })
    .eq('status', 'sending').lt('created_at', new Date(Date.now() - 10 * 60e3).toISOString());

  const { data: rows, error } = await admin.from('notification_outbox')
    .select('*')
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
    .order('created_at').limit(20);
  if (error) throw error;

  for (const row of (rows ?? []) as OutboxRow[]) {
    // "trava" a linha: se outra chamada já pegou, pula (evita e-mail duplicado)
    const { data: claimed } = await admin.from('notification_outbox')
      .update({ status: 'sending', attempts: row.attempts + 1 })
      .eq('id', row.id).in('status', ['pending', 'failed']).select('id');
    if (!claimed?.length) continue;
    res.processed++;

    try {
      if (row.channel !== 'email') throw new Error('WhatsApp ainda não está configurado.');
      if ((row.kind ?? 'approval') === 'approval') await sendApprovalEmail(admin, row, siteUrl);
      else await sendClientMessageEmail(admin, row, siteUrl);
      await admin.from('notification_outbox').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null }).eq('id', row.id);
      res.sent++;
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await admin.from('notification_outbox').update({ status: 'failed', last_error: msg }).eq('id', row.id);
      const canal = row.channel === 'email' ? 'e-mail' : 'WhatsApp';
      await admin.from('activity_logs').insert({
        client_id: row.client_id, post_id: row.post_id, type: 'aviso_falhou', actor: 'Sistema', meta: canal,
        action_text: `Falha ao avisar a equipe por ${canal} (tentativa ${row.attempts + 1}/${MAX_ATTEMPTS}): ${msg}`,
      });
      res.failed++;
    }
  }
  return res;
}

async function sendResend(mail: { from: string; to: string[]; subject: string; html: string; text: string }, key: string, idem: string) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
    body: JSON.stringify(mail),
  });
  if (!r.ok) {
    let msg = `Resend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.message) msg += `: ${j.message}`; } catch { /* corpo vazio */ }
    throw new Error(msg);
  }
}

/** Cliente pediu alteração, reprovou ou comentou: avisa a equipe (CLIENT_ALERT_EMAIL). */
async function sendClientMessageEmail(admin: SupabaseClient, row: OutboxRow, siteUrl: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  const to = (process.env.CLIENT_ALERT_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key) throw new Error('RESEND_API_KEY não configurada.');
  if (!from) throw new Error('NOTIFY_EMAIL_FROM não configurado.');
  if (!to.length) throw new Error('CLIENT_ALERT_EMAIL não configurado.');

  const { data: post, error } = await admin.from('posts')
    .select('id, title, format, version, client_id, clients(name, revision_limit)').eq('id', row.post_id).maybeSingle();
  if (error) throw error;
  if (!post) throw new Error('Conteúdo não encontrado (pode ter sido excluído).');
  const { data: msg } = row.comment_id
    ? await admin.from('comments').select('author_name, kind, content, created_at').eq('id', row.comment_id).maybeSingle()
    : { data: null };
  if (!msg) throw new Error('Mensagem do cliente não encontrada (pode ter sido excluída).');

  // rodada de alteração (para saber se já passou do combinado)
  let round: { n: number; limit: number } | null = null;
  const client = (Array.isArray(post.clients) ? post.clients[0] : post.clients) as { name: string; revision_limit: number | null } | null;
  if (row.kind === 'adjustment') {
    const { count } = await admin.from('comments').select('id', { count: 'exact', head: true })
      .eq('post_id', post.id).eq('author_role', 'client').eq('kind', 'adjustment').eq('agency_error', false)
      .lte('created_at', msg.created_at);
    round = { n: count ?? 1, limit: client?.revision_limit ?? 2 };
  }
  const mail = clientMessageEmail({
    kind: row.kind as Exclude<OutboxKind, 'approval'>, clientName: client?.name ?? 'Cliente', author: msg.author_name,
    title: post.title, format: TYPES[post.format as Post['format']]?.label ?? post.format, version: post.version,
    content: msg.content, round, url: `${siteUrl.replace(/\/$/, '')}/dashboard/clientes/${post.client_id}?post=${post.id}`,
  });
  await sendResend({ from, to, ...mail }, key, `client-msg-${row.id}`);
}

export function clientMessageEmail(m: {
  kind: 'adjustment' | 'rejection' | 'comment'; clientName: string; author: string; title: string; format: string;
  version: number; content: string; round: { n: number; limit: number } | null; url: string;
}) {
  const head = {
    adjustment: { verb: 'pediu alteração em', lead: 'pediu alteração', color: '#B26A00', bg: '#FFF3E0' },
    rejection: { verb: 'reprovou', lead: 'reprovou um conteúdo (não publicar)', color: '#C62828', bg: '#FDE3E1' },
    comment: { verb: 'comentou em', lead: 'deixou um comentário', color: '#555250', bg: '#F3EAE3' },
  }[m.kind];
  const extra = m.round && m.round.n > m.round.limit;
  const roundTxt = m.round ? `${m.round.n}ª alteração deste conteúdo${extra ? ` · passou do limite de ${m.round.limit} (rodada extra, cobrada à parte)` : ` de ${m.round.limit} combinadas`}` : '';
  const who = m.author && m.author !== m.clientName ? `${m.author} (${m.clientName})` : m.clientName;
  const subject = `${m.clientName} ${head.verb} “${m.title}”`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">APROVA</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px"><b>${esc(who)}</b> ${esc(head.lead)}.</p>
<p style="margin:0 0 4px;font-size:12px;color:#8C8781;text-transform:uppercase;letter-spacing:1px">${esc(m.format)}${m.version > 1 ? ` · versão ${m.version}` : ''}</p>
<p style="margin:0 0 14px;font-size:17px;font-weight:600">${esc(m.title)}</p>
<div style="background:${head.bg};border-left:4px solid ${head.color};border-radius:10px;padding:12px 14px;margin:0 0 12px;font-size:14px;white-space:pre-wrap">${esc(m.content)}</div>
${roundTxt ? `<p style="margin:0 0 16px;font-size:13px;color:${extra ? '#C62828' : '#8C8781'}">${extra ? '<b>' : ''}${esc(roundTxt)}${extra ? '</b>' : ''}</p>` : ''}
<a href="${esc(m.url)}" style="display:block;background:#2C2C2C;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:999px;text-align:center">Abrir no Aprova</a>
</td></tr></table>
<p style="font-size:11.5px;color:#B5B0AA;margin:14px 0 0">Aviso automático do Aguiar&amp;Co Aprova.</p>
</td></tr></table></body></html>`;
  const text = [`${who} ${head.lead}.`, `${m.format}: ${m.title}${m.version > 1 ? ` (versão ${m.version})` : ''}`, '', m.content, roundTxt ? `\n${roundTxt}` : '', `\nAbrir no Aprova: ${m.url}`].filter((x) => x !== null).join('\n');
  return { subject, html, text };
}

async function sendApprovalEmail(admin: SupabaseClient, row: OutboxRow, siteUrl: string) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  const to = (process.env.SCHEDULER_EMAIL ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!key) throw new Error('RESEND_API_KEY não configurada.');
  if (!from) throw new Error('NOTIFY_EMAIL_FROM não configurado.');
  if (!to.length) throw new Error('SCHEDULER_EMAIL não configurado.');

  const { data, error } = await admin.from('posts')
    .select('*, post_media(*), clients(name,instagram,segment)').eq('id', row.post_id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Conteúdo não encontrado (pode ter sido excluído).');
  const post = data as Post & { clients: Pick<Client, 'name' | 'instagram' | 'segment'> | null; is_roteiro?: boolean };
  // roteiro aprovado não vai para o agendamento: não avisa quem agenda
  if (post.is_roteiro) return;
  const client = post.clients;
  const { subject, html, text } = approvalEmail(post, client, siteUrl);

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // mesma chave = mesmo e-mail: nova tentativa nunca duplica
      'Idempotency-Key': `approval-${row.id}`,
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!r.ok) {
    let msg = `Resend respondeu ${r.status}`;
    try { const j = await r.json(); if (j?.message) msg += `: ${j.message}`; } catch { /* corpo vazio */ }
    throw new Error(msg);
  }
}

export function approvalEmail(
  post: Post, client: Pick<Client, 'name' | 'instagram' | 'segment'> | null, siteUrl: string,
) {
  const cname = client?.name ?? 'Cliente';
  const queue = `${siteUrl.replace(/\/$/, '')}/dashboard/agendamento`;
  const fmt = TYPES[post.format]?.label ?? post.format;
  const mats = materialsOf(post);
  const due = post.scheduled_date ? fmtDay(post.scheduled_date) : null;
  const beauty = client?.segment === 'beleza';
  const note = (post.schedule_note ?? '').trim();
  const wa = isWhatsappNote(note);

  const btn = (href: string, label: string, bg: string) =>
    `<a href="${esc(href)}" style="display:block;background:${bg};color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 18px;border-radius:999px;text-align:center;margin:0 0 8px">${esc(label)}</a>`;
  const matLinks = mats.filter((m) => m.downloadUrl || m.openUrl).map((m) => {
    const bg = m.kind === 'cover' ? '#7A5A47' : m.kind === 'video' ? '#2C2C2C' : '#555250';
    return m.downloadUrl ? btn(m.downloadUrl, m.downloadLabel, bg) : btn(m.openUrl!, `Abrir ${m.label.toLowerCase()}`, bg);
  }).join('');

  const subject = wa
    ? `${cname} aprovou “${post.title}” pelo WhatsApp: leia a observação antes de agendar`
    : `${cname} aprovou “${post.title}”, pronto para agendar`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F6F4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#ffffff;padding:20px 24px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">APROVA</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px"><b>${esc(cname)}</b> aprovou um conteúdo. Ele já está na fila de agendamento.</p>
<p style="margin:0 0 4px;font-size:12px;color:#8C8781;text-transform:uppercase;letter-spacing:1px">${esc(fmt)}</p>
<p style="margin:0 0 6px;font-size:17px;font-weight:600">${esc(post.title)}</p>
<p style="margin:0 0 16px;font-size:13px;color:#8C8781">${due ? `Publicação prevista: <b style="color:#2C2C2C">${esc(due)}</b> · ` : ''}Aprovado por ${esc(post.decided_by ?? 'cliente')}</p>
${note ? (wa
  ? `<div style="background:#FDE3E1;color:#8E1B1B;border:2px solid #C62828;border-radius:10px;padding:12px 14px;margin:0 0 16px;font-size:14px;white-space:pre-wrap"><b style="color:#C62828">⚠ ATENÇÃO: combinado com o cliente pelo WhatsApp. Agende exatamente assim:</b>\n${esc(note)}</div>`
  : `<div style="background:#F7E6DC;color:#6B3A23;border-radius:10px;padding:12px 14px;margin:0 0 16px;font-size:13px;white-space:pre-wrap"><b>Antes de agendar, leia:</b>\n${esc(note)}</div>`) : ''}
${beauty ? `<div style="background:#F3EAE3;border-radius:10px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.6"><b style="color:#7A5A47">Antes de publicar, faça as marcações</b><br>
<b>1. Não esqueça de marcar na publicação a profissional que fez o procedimento:</b> ${post.featured_professional ? esc(post.featured_professional) : 'o @ dela não foi informado no envio, confira no material quem fez e marque.'}<br>
<b>2. Marque também o cliente:</b> ${client?.instagram ? esc(client.instagram) : 'o @ do cliente não está cadastrado no Aprova. Se ele tiver Instagram, procure e marque.'}</div>` : ''}
${matLinks ? `<p style="margin:0 0 8px;font-size:12px;color:#555250;font-weight:600;letter-spacing:1px;text-transform:uppercase">Materiais</p>${matLinks}` : ''}
<p style="margin:16px 0 0"><a href="${esc(queue)}" style="color:#7A5A47;font-weight:600">Abrir a fila de agendamento →</a></p>
</td></tr></table>
<p style="font-size:11.5px;color:#B5B0AA;margin:14px 0 0">Aviso automático do Aguiar&amp;Co Aprova. Aprovar de novo o mesmo conteúdo não gera e-mail repetido.</p>
</td></tr></table></body></html>`;

  const text = [
    `${cname} aprovou “${post.title}” (${fmt}). Já está na fila de agendamento.`,
    due ? `Publicação prevista: ${due}` : '',
    note ? `\n${wa ? 'ATENÇÃO: COMBINADO COM O CLIENTE PELO WHATSAPP. AGENDE EXATAMENTE ASSIM:' : 'ANTES DE AGENDAR, LEIA:'}\n${note}` : '',
    beauty ? `\nANTES DE PUBLICAR, FAÇA AS MARCAÇÕES:\n1. Marque a profissional que fez o procedimento: ${post.featured_professional || 'confira no material quem fez e marque'}\n2. Marque também o cliente: ${client?.instagram || 'procure o @ do cliente no Instagram e marque'}` : '',
    ...mats.map((m) => `${m.downloadLabel}: ${m.downloadUrl ?? m.openUrl ?? ''}`),
    `\nFila de agendamento: ${queue}`,
  ].filter(Boolean).join('\n');

  return { subject, html, text };
}
