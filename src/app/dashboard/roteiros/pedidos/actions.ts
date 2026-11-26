'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { currentViewer } from '@/lib/auth';
import { sendResendEmail } from '@/lib/ideias-email';
import { dayLabel } from '@/lib/alteracoes';
import { firstName, monthLabel } from '@/lib/format';
import { filledItems, fixoPeriod, writerName, type PedidoRoteiro, type RoteiroItem } from '@/lib/pedidos-roteiro';
import { currentMonth } from '@/lib/format';

type Result = { ok: true; warning?: string } | { ok: false; error: string };
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function me() {
  const v = await currentViewer();
  if (!v) return null;
  return { ...v.real, reviewer: v.real.owner || v.real.sections.includes('alteracoes') };
}
async function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}
function refresh() {
  revalidatePath('/dashboard/roteiros/pedidos');
  revalidatePath('/dashboard/demandas');
  revalidatePath('/dashboard', 'layout');
}
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e) });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Avisa quem escreve (pedido novo ou ajuste pedido na revisão). Falha no e-mail vira só aviso. */
async function notifyWriter(supabase: Awaited<ReturnType<typeof createClient>>, p: { id: string; profile_id: string | null; client_id: string; quantidade: number; ref_month: string; due_date: string | null; briefing: string; back_note?: string }, kind: 'nova' | 'volta', by: string) {
  if (!p.profile_id) return undefined;
  const [{ data: prof }, { data: cl }] = await Promise.all([
    supabase.from('profiles').select('name, nickname, email').eq('id', p.profile_id).maybeSingle(),
    supabase.from('clients').select('name').eq('id', p.client_id).maybeSingle(),
  ]);
  const who = prof as { name: string; nickname: string | null; email: string | null } | null;
  if (!who?.email) return `${who?.name ?? 'A pessoa'} não tem e-mail cadastrado.`;
  const client = (cl as { name: string } | null)?.name ?? 'Cliente';
  const n = `${p.quantidade} roteiro${p.quantidade > 1 ? 's' : ''}`;
  const url = `${await siteUrl()}/dashboard/demandas`;
  const lead = kind === 'volta'
    ? `${firstName(by)} revisou os roteiros de ${client} e pediu um ajuste.`
    : `${firstName(by)} pediu ${n} de ${client} (${monthLabel(p.ref_month)}) para você.`;
  const prazo = p.due_date ? `Prazo: ${dayLabel(p.due_date, true)}.` : '';
  const extra = kind === 'volta' ? (p.back_note ? `Recado da revisão: ${p.back_note}` : '') : (p.briefing ? `Briefing: ${p.briefing}` : '');
  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#fff;padding:18px 22px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">ROTEIROS PARA ESCREVER</span></td></tr>
<tr><td style="padding:22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Oi, ${esc(writerName(who))}!</p>
<div style="background:#F3EAE3;border-radius:10px;padding:12px 14px;margin:0 0 14px">${esc(lead)}${prazo ? `<br><b>${esc(prazo)}</b>` : ''}</div>
${extra ? `<div style="background:#FFF3E0;border-radius:10px;padding:10px 12px;margin:0 0 14px;font-size:14px;white-space:pre-wrap">${esc(extra)}</div>` : ''}
<p style="margin:16px 0 10px"><a href="${esc(url)}" style="display:inline-block;background:#E1CABA;color:#2C2C2C;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:999px">Abrir minhas demandas</a></p>
<p style="margin:0;font-size:12.5px;color:#8C8781">Escreva e entregue pelo Aprova. Os roteiros passam pela revisão da Kim ou do João antes de ir para o cliente.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [`Oi, ${writerName(who)}!`, '', lead, prazo, extra, '', `Abrir minhas demandas: ${url}`].filter(Boolean).join('\n');
  try {
    await sendResendEmail({ to: [who.email], subject: kind === 'volta' ? `Ajuste nos roteiros: ${client}` : `Roteiros para escrever: ${client}${p.due_date ? ` · prazo ${dayLabel(p.due_date)}` : ''}`, html, text },
      `roteiro-${p.id}-${kind}-${Date.now()}`);
    return undefined;
  } catch (e) {
    return `O pedido foi registrado, mas o e-mail não saiu: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Kim ou João pedem N roteiros de um cliente para uma pessoa. */
export async function createPedido(input: { clientId: string; profileId: string; quantidade: number; refMonth: string; due: string | null; briefing: string }): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim ou o João pedem roteiros.' };
  const q = Math.round(Number(input.quantidade));
  if (!input.clientId) return { ok: false, error: 'Escolha o cliente.' };
  if (!input.profileId) return { ok: false, error: 'Escolha quem escreve.' };
  if (!(q >= 1 && q <= 60)) return { ok: false, error: 'Quantidade entre 1 e 60.' };
  if (!MONTH.test(input.refMonth)) return { ok: false, error: 'Escolha o mês dos roteiros.' };
  if (input.due && !YMD.test(input.due)) return { ok: false, error: 'Prazo inválido.' };
  try {
    const supabase = await createClient();
    const { data: prof } = await supabase.from('profiles').select('name, nickname').eq('id', input.profileId).maybeSingle();
    const { data, error } = await supabase.from('roteiro_pedidos').insert({
      client_id: input.clientId, profile_id: input.profileId, assignee_name: prof ? writerName(prof as { name: string; nickname: string | null }) : '',
      quantidade: q, ref_month: input.refMonth, due_date: input.due || null, briefing: input.briefing.trim().slice(0, 4000),
      created_by: u.id, created_by_name: u.name,
    }).select('*').single();
    if (error) throw error;
    const warning = await notifyWriter(supabase, data as PedidoRoteiro, 'nova', u.name);
    refresh();
    return { ok: true, warning };
  } catch (e) { return fail(e); }
}

/** Quem escreve salva o rascunho ou entrega para revisão. */
export async function savePedido(input: { id: string; itens: RoteiroItem[]; docUrl: string; note: string; deliver: boolean }): Promise<Result> {
  const u = await me();
  if (!u) return { ok: false, error: 'Faça login de novo.' };
  const itens = (input.itens ?? []).slice(0, 60).map((i) => ({ title: String(i.title ?? '').slice(0, 200), content: String(i.content ?? '').slice(0, 20000) }));
  const doc = (input.docUrl ?? '').trim();
  if (doc && !/^https?:\/\//i.test(doc)) return { ok: false, error: 'O link do documento precisa começar com https://.' };
  if (input.deliver && !filledItems(itens).length && !doc) return { ok: false, error: 'Escreva pelo menos um roteiro ou cole o link do documento.' };
  try {
    const supabase = await createClient();
    const { data: cur } = await supabase.from('roteiro_pedidos').select('profile_id, status').eq('id', input.id).maybeSingle();
    if (!cur) return { ok: false, error: 'Pedido não encontrado.' };
    if (cur.status !== 'fazendo') return { ok: false, error: 'Este pedido já foi entregue.' };
    if (cur.profile_id !== u.id && !u.reviewer) return { ok: false, error: 'Este pedido é de outra pessoa.' };
    const now = new Date().toISOString();
    const { error } = await supabase.from('roteiro_pedidos').update({
      itens, doc_url: doc, entrega_note: (input.note ?? '').trim().slice(0, 2000), updated_at: now,
      ...(input.deliver ? { status: 'revisao', delivered_at: now } : {}),
    }).eq('id', input.id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Revisão devolve para quem escreveu, com recado. */
export async function sendBackPedido(id: string, note: string): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim ou o João revisam.' };
  if (!note.trim()) return { ok: false, error: 'Explique o que precisa ajustar.' };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('roteiro_pedidos')
      .update({ status: 'fazendo', back_note: note.trim().slice(0, 2000), updated_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'revisao').select('*').maybeSingle();
    if (error) throw error;
    if (!data) return { ok: false, error: 'Este pedido não está mais em revisão.' };
    const warning = await notifyWriter(supabase, data as PedidoRoteiro, 'volta', u.name);
    refresh();
    return { ok: true, warning };
  } catch (e) { return fail(e); }
}

/**
 * "Enviar para o cliente": cada roteiro vira um material de texto no link de aprovação do cliente
 * (o cliente aprova, pede alteração ou comenta como em qualquer post).
 */
export async function sendPedidoToClient(input: { id: string; itens: RoteiroItem[] }): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim ou o João enviam para o cliente.' };
  try {
    const supabase = await createClient();
    const { data: cur } = await supabase.from('roteiro_pedidos').select('*').eq('id', input.id).maybeSingle();
    const p = cur as PedidoRoteiro | null;
    if (!p) return { ok: false, error: 'Pedido não encontrado.' };
    if (p.status !== 'revisao') return { ok: false, error: 'Este pedido não está em revisão.' };
    // a revisão pode ter corrigido o texto antes de enviar
    let itens = filledItems(input.itens?.length ? input.itens : p.itens)
      .map((i) => ({ title: i.title.trim().slice(0, 200), content: i.content.slice(0, 20000) }));
    if (!itens.length && p.doc_url) itens = [{ title: '', content: p.doc_url }];
    if (!itens.length) return { ok: false, error: 'Não há roteiro para enviar.' };
    const mes = monthLabel(p.ref_month);
    const rows = itens.map((i, k) => ({
      client_id: p.client_id, format: 'texto', created_by: u.id, is_roteiro: true,
      title: i.title || `Roteiro ${k + 1} · ${mes}`,
      caption: i.content + (p.doc_url && i.content !== p.doc_url && k === 0 ? `\n\nDocumento: ${p.doc_url}` : ''),
    }));
    const { data: posts, error } = await supabase.from('posts').insert(rows).select('id, title');
    if (error) throw error;
    const ids = (posts ?? []).map((x) => x.id as string);
    await supabase.from('activity_logs').insert((posts ?? []).map((x) => ({
      client_id: p.client_id, post_id: x.id, type: 'enviado', actor: u.name, action_text: `${u.name} enviou o roteiro ${x.title}`,
    })));
    const { error: e2 } = await supabase.from('roteiro_pedidos').update({
      status: 'enviado', itens, sent_at: new Date().toISOString(), sent_by: u.name, post_ids: ids, updated_at: new Date().toISOString(),
    }).eq('id', p.id);
    if (e2) throw e2;
    refresh();
    revalidatePath(`/dashboard/clientes/${p.client_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function cancelPedido(id: string): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim ou o João cancelam pedidos.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('roteiro_pedidos').update({ status: 'cancelado', updated_at: new Date().toISOString() }).eq('id', id).in('status', ['fazendo', 'revisao']);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/** Demanda fixa (criar ou mudar). Já cria o pedido deste mês se ainda não existir. */
export async function saveFixo(input: { id?: string; clientId: string; profileId: string; quantidade: number; dueDay: number; briefing: string; active: boolean }): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim ou o João mudam as demandas fixas.' };
  const q = Math.round(Number(input.quantidade));
  const d = Math.round(Number(input.dueDay));
  if (!input.clientId || !input.profileId) return { ok: false, error: 'Escolha o cliente e quem escreve.' };
  if (!(q >= 1 && q <= 60)) return { ok: false, error: 'Quantidade entre 1 e 60.' };
  if (!(d >= 1 && d <= 28)) return { ok: false, error: 'O prazo é um dia entre 1 e 28.' };
  try {
    const supabase = await createClient();
    const values = { client_id: input.clientId, profile_id: input.profileId, quantidade: q, due_day: d, briefing: input.briefing.trim().slice(0, 4000), active: input.active };
    const { data, error } = input.id
      ? await supabase.from('roteiro_fixos').update(values).eq('id', input.id).select('*').single()
      : await supabase.from('roteiro_fixos').insert({ ...values, created_by_name: u.name }).select('*').single();
    if (error) throw error.code === '23505' ? new Error('Este cliente já tem demanda fixa com essa pessoa. Edite a que existe.') : error;
    let warning: string | undefined;
    if (values.active) {
      const per = fixoPeriod(currentMonth(), d);
      const { data: prof } = await supabase.from('profiles').select('name, nickname').eq('id', input.profileId).maybeSingle();
      const { data: made } = await supabase.from('roteiro_pedidos').upsert({
        client_id: input.clientId, profile_id: input.profileId, assignee_name: prof ? writerName(prof as { name: string; nickname: string | null }) : '',
        quantidade: q, briefing: values.briefing, fixo_id: data.id, created_by_name: 'Demanda fixa', ...per,
      }, { onConflict: 'fixo_id,ref_month', ignoreDuplicates: true }).select('*');
      if (made?.length) warning = await notifyWriter(supabase, made[0] as PedidoRoteiro, 'nova', u.name);
    }
    refresh();
    return { ok: true, warning };
  } catch (e) { return fail(e); }
}

export async function deleteFixo(id: string): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim ou o João mudam as demandas fixas.' };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('roteiro_fixos').delete().eq('id', id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}
