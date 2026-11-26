'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { currentViewer } from '@/lib/auth';
import { sendResendEmail } from '@/lib/ideias-email';
import { dayLabel } from '@/lib/alteracoes';
import { currentMonth, firstName, monthLabel } from '@/lib/format';
import {
  TIPOS, filledItems, fixoPeriod, pedidoTitle, tipoOf, writerName,
  type PedidoRoteiro, type PedidoTipo, type RoteiroItem,
} from '@/lib/pedidos-roteiro';

type Result = { ok: true; warning?: string } | { ok: false; error: string };
type Supa = Awaited<ReturnType<typeof createClient>>;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const SELECT = '*, clients(id, name, logo_url)';

async function me() {
  const v = await currentViewer();
  if (!v) return null;
  return { ...v.real, reviewer: v.real.owner || v.real.sections.includes('alteracoes') };
}
type Me = NonNullable<Awaited<ReturnType<typeof me>>>;
/** Quem confere a entrega: Kim/João (pedido deles ou demanda fixa) ou quem pediu (pedido entre a equipe). */
const canReview = (u: Me, p: Pick<PedidoRoteiro, 'peer' | 'created_by'>) => (p.peer ? p.created_by === u.id || u.reviewer : u.reviewer);

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

async function loadPedido(supabase: Supa, id: string) {
  const { data } = await supabase.from('roteiro_pedidos').select(SELECT).eq('id', id).maybeSingle();
  return data as PedidoRoteiro | null;
}

/** E-mail simples no padrão do Aprova. Falha no e-mail nunca desfaz nada: volta como aviso. */
async function mail(supabase: Supa, profileId: string | null, o: { tag: string; subject: string; lead: string; extra?: string; button: string; path: string; foot: string; key: string }) {
  if (!profileId) return undefined;
  const { data } = await supabase.from('profiles').select('name, nickname, email').eq('id', profileId).maybeSingle();
  const who = data as { name: string; nickname: string | null; email: string | null } | null;
  if (!who?.email) return `${who?.name ?? 'A pessoa'} não tem e-mail cadastrado.`;
  const url = `${await siteUrl()}${o.path}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F6F4;font-family:Poppins,Arial,sans-serif;color:#2C2C2C">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #E8E4E0;border-radius:14px;overflow:hidden">
<tr><td style="background:#2C2C2C;color:#fff;padding:18px 22px;font-size:20px;font-weight:300">Aguiar<b style="font-weight:600">&amp;co</b> <span style="font-size:11px;letter-spacing:3px;color:#E1CABA;margin-left:8px">${esc(o.tag)}</span></td></tr>
<tr><td style="padding:22px;font-size:15px;line-height:1.55">
<p style="margin:0 0 12px">Oi, ${esc(writerName(who))}!</p>
<div style="background:#F3EAE3;border-radius:10px;padding:12px 14px;margin:0 0 14px">${esc(o.lead)}</div>
${o.extra ? `<div style="background:#FFF3E0;border-radius:10px;padding:10px 12px;margin:0 0 14px;font-size:14px;white-space:pre-wrap">${esc(o.extra)}</div>` : ''}
<p style="margin:16px 0 10px"><a href="${esc(url)}" style="display:inline-block;background:#E1CABA;color:#2C2C2C;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:999px">${esc(o.button)}</a></p>
<p style="margin:0;font-size:12.5px;color:#8C8781">${esc(o.foot)}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [`Oi, ${writerName(who)}!`, '', o.lead, o.extra ?? '', '', `${o.button}: ${url}`].filter(Boolean).join('\n');
  try {
    await sendResendEmail({ to: [who.email], subject: o.subject, html, text }, `${o.key}-${Date.now()}`);
    return undefined;
  } catch (e) {
    return `Ficou registrado, mas o e-mail não saiu: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Para quem vai escrever: pedido novo ou ajuste pedido. */
function notifyWriter(supabase: Supa, p: PedidoRoteiro, kind: 'nova' | 'volta', by: string) {
  const t = TIPOS[tipoOf(p.tipo)];
  const what = pedidoTitle(p);
  const prazo = p.due_date ? ` Prazo: ${dayLabel(p.due_date, true)}.` : '';
  return mail(supabase, p.profile_id, {
    tag: kind === 'volta' ? 'AJUSTE PEDIDO' : `${t.many.toUpperCase()} PARA ESCREVER`,
    subject: kind === 'volta' ? `Ajuste pedido: ${what}` : `${t.label} para escrever: ${what}${p.due_date ? ` · prazo ${dayLabel(p.due_date)}` : ''}`,
    lead: kind === 'volta' ? `${firstName(by)} conferiu ${what} e pediu um ajuste.${prazo}` : `${firstName(by)} pediu ${what} para você.${prazo}`,
    extra: kind === 'volta' ? (p.back_note ? `Recado: ${p.back_note}` : '') : (p.briefing ? `Briefing: ${p.briefing}` : ''),
    button: 'Abrir minhas demandas', path: '/dashboard/demandas',
    foot: p.peer ? 'Quando terminar, entregue pelo Aprova: volta para quem pediu.' : 'Quando terminar, entregue pelo Aprova. Passa pela revisão da Kim ou do João antes de ir para o cliente.',
    key: `pedido-${p.id}-${kind}`,
  });
}

/** Para quem pediu: chegou a entrega. */
function notifyRequester(supabase: Supa, p: PedidoRoteiro) {
  const what = pedidoTitle(p);
  return mail(supabase, p.created_by, {
    tag: 'ENTREGA RECEBIDA',
    subject: `Chegou: ${what} (${p.assignee_name || 'equipe'})`,
    lead: `${p.assignee_name || 'A equipe'} entregou ${what}.${p.due_date ? ` O prazo era ${dayLabel(p.due_date, true)}.` : ''}`,
    extra: p.entrega_note ? `Recado: ${p.entrega_note}` : '',
    button: p.peer ? 'Ver o que chegou' : 'Revisar agora',
    path: p.peer ? '/dashboard/demandas' : '/dashboard/roteiros/pedidos?aba=revisar',
    foot: p.peer ? 'Confira e marque como recebido, ou peça ajuste.' : 'Confira, ajuste o texto se quiser e envie para o cliente.',
    key: `pedido-${p.id}-entregue`,
  });
}

/**
 * Pedir um texto. Kim/João pedem para a equipe (passa pela revisão deles);
 * as meninas pedem umas para as outras (volta para quem pediu).
 */
export async function createPedido(input: {
  tipo: PedidoTipo; clientId: string | null; profileId: string; quantidade: number; refMonth: string | null;
  due: string; briefing: string; material: string;
}): Promise<Result> {
  const u = await me();
  if (!u) return { ok: false, error: 'Faça login de novo.' };
  const tipo = tipoOf(input.tipo);
  const q = Math.round(Number(input.quantidade));
  if (tipo === 'roteiro' && !input.clientId) return { ok: false, error: 'Escolha o cliente.' };
  if (!input.profileId) return { ok: false, error: 'Escolha quem faz.' };
  if (input.profileId === u.id) return { ok: false, error: 'Escolha outra pessoa: o pedido é para alguém da equipe.' };
  if (!(q >= 1 && q <= 60)) return { ok: false, error: 'Quantidade entre 1 e 60.' };
  if (!input.due || !YMD.test(input.due)) return { ok: false, error: 'Escolha o prazo para receber.' };
  const ref = input.refMonth && MONTH.test(input.refMonth) ? input.refMonth : input.due.slice(0, 7);
  try {
    const supabase = await createClient();
    const { data: prof } = await supabase.from('profiles').select('name, nickname').eq('id', input.profileId).maybeSingle();
    const { data, error } = await supabase.from('roteiro_pedidos').insert({
      tipo, client_id: input.clientId || null, profile_id: input.profileId,
      assignee_name: prof ? writerName(prof as { name: string; nickname: string | null }) : '',
      quantidade: q, ref_month: ref, due_date: input.due, briefing: input.briefing.trim().slice(0, 4000),
      material: input.material.trim().slice(0, 200), peer: !u.reviewer,
      created_by: u.id, created_by_name: u.name,
    }).select(SELECT).single();
    if (error) throw error;
    const warning = await notifyWriter(supabase, data as PedidoRoteiro, 'nova', u.name);
    refresh();
    return { ok: true, warning };
  } catch (e) { return fail(e); }
}

/** Quem escreve salva o rascunho ou entrega (avisa quem pediu por e-mail). */
export async function savePedido(input: { id: string; itens: RoteiroItem[]; docUrl: string; note: string; deliver: boolean }): Promise<Result> {
  const u = await me();
  if (!u) return { ok: false, error: 'Faça login de novo.' };
  const itens = (input.itens ?? []).slice(0, 60).map((i) => ({ title: String(i.title ?? '').slice(0, 200), content: String(i.content ?? '').slice(0, 20000) }));
  const doc = (input.docUrl ?? '').trim();
  if (doc && !/^https?:\/\//i.test(doc)) return { ok: false, error: 'O link do documento precisa começar com https://.' };
  if (input.deliver && !filledItems(itens).length && !doc) return { ok: false, error: 'Escreva pelo menos um texto ou cole o link do documento.' };
  try {
    const supabase = await createClient();
    const cur = await loadPedido(supabase, input.id);
    if (!cur) return { ok: false, error: 'Pedido não encontrado.' };
    if (cur.status !== 'fazendo') return { ok: false, error: 'Este pedido já foi entregue.' };
    if (cur.profile_id !== u.id && !u.reviewer) return { ok: false, error: 'Este pedido é de outra pessoa.' };
    const now = new Date().toISOString();
    const values = {
      itens, doc_url: doc, entrega_note: (input.note ?? '').trim().slice(0, 2000), updated_at: now,
      ...(input.deliver ? { status: 'revisao' as const, delivered_at: now } : {}),
    };
    const { error } = await supabase.from('roteiro_pedidos').update(values).eq('id', input.id);
    if (error) throw error;
    const warning = input.deliver ? await notifyRequester(supabase, { ...cur, ...values }) : undefined;
    refresh();
    return { ok: true, warning };
  } catch (e) { return fail(e); }
}

/** Devolve para quem escreveu, com recado. */
export async function sendBackPedido(id: string, note: string): Promise<Result> {
  const u = await me();
  if (!u) return { ok: false, error: 'Faça login de novo.' };
  if (!note.trim()) return { ok: false, error: 'Explique o que precisa ajustar.' };
  try {
    const supabase = await createClient();
    const cur = await loadPedido(supabase, id);
    if (!cur || cur.status !== 'revisao') return { ok: false, error: 'Este pedido não está mais esperando conferência.' };
    if (!canReview(u, cur)) return { ok: false, error: 'Só quem pediu confere este pedido.' };
    const back = note.trim().slice(0, 2000);
    const { error } = await supabase.from('roteiro_pedidos')
      .update({ status: 'fazendo', back_note: back, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    const warning = await notifyWriter(supabase, { ...cur, back_note: back }, 'volta', u.name);
    refresh();
    return { ok: true, warning };
  } catch (e) { return fail(e); }
}

/** Recebido: quem pediu vai usar o texto (num material, por exemplo) e não precisa mandar ao cliente. */
export async function concluirPedido(input: { id: string; itens?: RoteiroItem[] }): Promise<Result> {
  const u = await me();
  if (!u) return { ok: false, error: 'Faça login de novo.' };
  try {
    const supabase = await createClient();
    const cur = await loadPedido(supabase, input.id);
    if (!cur || cur.status !== 'revisao') return { ok: false, error: 'Este pedido não está mais esperando conferência.' };
    if (!canReview(u, cur)) return { ok: false, error: 'Só quem pediu confere este pedido.' };
    const now = new Date().toISOString();
    const { error } = await supabase.from('roteiro_pedidos').update({
      status: 'concluido', done_at: now, updated_at: now, sent_by: u.name,
      ...(input.itens?.length ? { itens: filledItems(input.itens) } : {}),
    }).eq('id', cur.id);
    if (error) throw error;
    refresh();
    return { ok: true };
  } catch (e) { return fail(e); }
}

/**
 * "Enviar para o cliente": cada texto vira um material de texto no link de aprovação do cliente
 * (marcado como pedido de texto: não entra em Agendamento, termômetro nem relatórios).
 */
export async function sendPedidoToClient(input: { id: string; itens: RoteiroItem[] }): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim ou o João enviam para o cliente.' };
  try {
    const supabase = await createClient();
    const p = await loadPedido(supabase, input.id);
    if (!p) return { ok: false, error: 'Pedido não encontrado.' };
    if (p.status !== 'revisao') return { ok: false, error: 'Este pedido não está em revisão.' };
    if (!p.client_id) return { ok: false, error: 'Este pedido não é de um cliente: marque como recebido.' };
    const t = TIPOS[tipoOf(p.tipo)];
    let itens = filledItems(input.itens?.length ? input.itens : p.itens)
      .map((i) => ({ title: i.title.trim().slice(0, 200), content: i.content.slice(0, 20000) }));
    if (!itens.length && p.doc_url) itens = [{ title: '', content: p.doc_url }];
    if (!itens.length) return { ok: false, error: 'Não há texto para enviar.' };
    const fallback = (k: number) => [t.item, itens.length > 1 ? String(k + 1) : '', p.material || (p.tipo === 'roteiro' ? monthLabel(p.ref_month) : '')].filter(Boolean).join(' ');
    const rows = itens.map((i, k) => ({
      client_id: p.client_id, format: 'texto', created_by: u.id, is_roteiro: true,
      title: (i.title || fallback(k)).slice(0, 200),
      caption: i.content + (p.doc_url && i.content !== p.doc_url && k === 0 ? `\n\nDocumento: ${p.doc_url}` : ''),
    }));
    const { data: posts, error } = await supabase.from('posts').insert(rows).select('id, title');
    if (error) throw error;
    await supabase.from('activity_logs').insert((posts ?? []).map((x) => ({
      client_id: p.client_id, post_id: x.id, type: 'enviado', actor: u.name, action_text: `${u.name} enviou ${t.one} ${x.title}`,
    })));
    const now = new Date().toISOString();
    const { error: e2 } = await supabase.from('roteiro_pedidos').update({
      status: 'enviado', itens, sent_at: now, sent_by: u.name, post_ids: (posts ?? []).map((x) => x.id as string), updated_at: now,
    }).eq('id', p.id);
    if (e2) throw e2;
    refresh();
    revalidatePath(`/dashboard/clientes/${p.client_id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function cancelPedido(id: string): Promise<Result> {
  const u = await me();
  if (!u) return { ok: false, error: 'Faça login de novo.' };
  try {
    const supabase = await createClient();
    const cur = await loadPedido(supabase, id);
    if (!cur) return { ok: false, error: 'Pedido não encontrado.' };
    if (!(u.reviewer || cur.created_by === u.id)) return { ok: false, error: 'Só quem pediu (ou a Kim e o João) cancela.' };
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
      }, { onConflict: 'fixo_id,ref_month', ignoreDuplicates: true }).select(SELECT);
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

