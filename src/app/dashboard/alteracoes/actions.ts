'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { MEDIA_BUCKET } from '@/lib/supabase/env';
import { currentViewer } from '@/lib/auth';
import { TYPES } from '@/lib/constants';
import { sendResendEmail } from '@/lib/ideias-email';
import { demandaEmail } from '@/lib/alteracoes-email';
import { doerName, etapasOf, publishDateOf, type Alteracao, type Etapa, type Plan } from '@/lib/alteracoes';
import type { Post, PostFormat, PostMedia } from '@/lib/types';

type Result = { ok: true; warning?: string } | { ok: false; error: string };

async function me() {
  const v = await currentViewer();
  if (!v) return null;
  const reviewer = v.real.owner || v.real.sections.includes('alteracoes');
  return { ...v.real, reviewer };
}
async function siteUrl() {
  const env = process.env.NEXT_PUBLIC_SITE_URL;
  if (env) return env.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
}
function refresh() {
  revalidatePath('/dashboard/alteracoes');
  revalidatePath('/dashboard/demandas');
  revalidatePath('/dashboard', 'layout');
}

type AltFull = Alteracao & { posts: Post & { publish_at?: string | null }; clients: { name: string } };
async function loadAlt(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase.from('alteracoes')
    .select('*, alteracao_etapas(*), alteracao_media(*), posts(*, post_media(*)), clients(name)').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as AltFull | null;
}

/** Avisa a pessoa por e-mail. Falha no e-mail não desfaz nada: volta como aviso. */
async function notify(alt: AltFull, etapa: Etapa, kind: 'nova' | 'vez' | 'volta', by: string, extra: { next?: string | null; prevName?: string; prevNote?: string; backNote?: string } = {}) {
  if (!etapa.email) return `${etapa.name} não tem e-mail cadastrado.`;
  try {
    const mail = demandaEmail({
      to: etapa.name, kind, clientName: alt.clients?.name ?? 'Cliente', title: alt.posts.title,
      format: TYPES[alt.posts.format as PostFormat]?.label ?? alt.posts.format, version: alt.posts.version,
      ask: alt.request_text, obs: alt.forward_note, obsBy: alt.created_by_name, due: etapa.due_date, publish: alt.publish_date, by, next: extra.next ?? null,
      prevName: extra.prevName, prevNote: extra.prevNote, backNote: extra.backNote,
      url: `${await siteUrl()}/dashboard/demandas?cliente=${alt.client_id}`,
    });
    await sendResendEmail({ to: [etapa.email], ...mail }, `alteracao-${etapa.id}-${kind}-${Date.now()}`);
    return undefined;
  } catch (e) {
    return `A demanda foi registrada, mas o e-mail para ${etapa.name} não saiu: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Kim ou João escolhem quem faz (1ª pessoa e, se quiser, a 2ª) e o prazo de cada uma. */
export async function forwardAlteracao(input: { postId: string; steps: { profileId: string; due: string }[]; note?: string }): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim e o João encaminham alterações.' };
  const steps = input.steps.filter((s) => s.profileId).slice(0, 2);
  if (!steps.length) return { ok: false, error: 'Escolha quem altera primeiro.' };
  if (steps.some((s) => !/^\d{4}-\d{2}-\d{2}$/.test(s.due))) return { ok: false, error: 'Escolha o prazo de cada pessoa.' };
  if (steps.length === 2 && steps[0].profileId === steps[1].profileId) return { ok: false, error: 'A segunda pessoa precisa ser diferente da primeira.' };

  const supabase = await createClient();
  const { data: post } = await supabase.from('posts').select('*, comments(*)').eq('id', input.postId).maybeSingle();
  if (!post) return { ok: false, error: 'Conteúdo não encontrado.' };
  const { count } = await supabase.from('alteracoes').select('id', { count: 'exact', head: true })
    .eq('post_id', input.postId).in('status', ['fazendo', 'revisao']);
  if (count) return { ok: false, error: 'Esse pedido já foi encaminhado.' };
  const ask = [...((post.comments ?? []) as { author_role: string; kind: string; created_at: string; id: string; content: string }[])]
    .filter((c) => c.author_role === 'client' && c.kind === 'adjustment').sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const { data: people } = await supabase.from('profiles').select('id, name, nickname, email').in('id', steps.map((s) => s.profileId));
  const person = (id: string) => (people ?? []).find((p) => p.id === id) as { id: string; name: string; nickname: string | null; email: string } | undefined;
  if (steps.some((s) => !person(s.profileId))) return { ok: false, error: 'Pessoa não encontrada na equipe.' };

  const { data: alt, error } = await supabase.from('alteracoes').insert({
    client_id: post.client_id, post_id: post.id, request_comment_id: ask?.id ?? null, request_text: ask?.content ?? '',
    publish_date: publishDateOf(post), created_by: u.id, created_by_name: u.name,
    forward_note: String(input.note ?? '').trim().slice(0, 1500),
  }).select('id').single();
  if (error) return { ok: false, error: error.message };
  const now = new Date().toISOString();
  const { error: e2 } = await supabase.from('alteracao_etapas').insert(steps.map((s, i) => {
    const p = person(s.profileId)!;
    return { alteracao_id: alt.id, ordem: i + 1, profile_id: p.id, name: doerName(p), email: p.email, due_date: s.due, status: i === 0 ? 'fazendo' : 'aguardando', started_at: i === 0 ? now : null };
  }));
  if (e2) { await supabase.from('alteracoes').delete().eq('id', alt.id); return { ok: false, error: e2.message }; }

  const full = (await loadAlt(supabase, alt.id))!;
  const [first, second] = etapasOf(full);
  await supabase.from('activity_logs').insert({
    client_id: post.client_id, post_id: post.id, type: 'alteracao_encaminhada', actor: u.name,
    action_text: `${u.name} encaminhou a alteração de ${post.title} para ${first.name}${second ? ` → ${second.name}` : ''}`,
  });
  const warning = await notify(full, first, 'nova', u.name, { next: second?.name ?? null });
  refresh();
  return { ok: true, warning };
}

/** A pessoa terminou a parte dela: passa para a próxima ou vai para a revisão. */
export async function finishEtapa(input: { etapaId: string; plan: Plan; note: string; summary: string }): Promise<Result> {
  const u = await me();
  if (!u) return { ok: false, error: 'Entre novamente.' };
  const supabase = await createClient();
  const { data: et } = await supabase.from('alteracao_etapas').select('*').eq('id', input.etapaId).maybeSingle();
  if (!et || et.status !== 'fazendo') return { ok: false, error: 'Essa demanda não está mais com você.' };
  if (et.profile_id !== u.id && !u.reviewer) return { ok: false, error: 'Essa demanda é de outra pessoa.' };

  const { error: e1 } = await supabase.from('alteracoes').update({ plan: input.plan }).eq('id', et.alteracao_id);
  if (e1) return { ok: false, error: e1.message };
  await supabase.from('alteracao_etapas').update({
    status: 'feita', done_at: new Date().toISOString(), note: input.note.trim().slice(0, 1000), summary: input.summary.slice(0, 500), back_note: '',
  }).eq('id', et.id);

  const alt = (await loadAlt(supabase, et.alteracao_id))!;
  const next = etapasOf(alt).find((e) => e.status === 'aguardando' && e.ordem > et.ordem);
  let warning: string | undefined;
  if (next) {
    await supabase.from('alteracao_etapas').update({ status: 'fazendo', started_at: new Date().toISOString() }).eq('id', next.id);
    warning = await notify(alt, next, 'vez', u.name, { prevName: et.name, prevNote: input.note.trim() });
  } else {
    await supabase.from('alteracoes').update({ status: 'revisao' }).eq('id', alt.id);
  }
  await supabase.from('activity_logs').insert({
    client_id: alt.client_id, post_id: alt.post_id, type: 'alteracao_etapa', actor: u.name,
    action_text: next ? `${et.name} terminou a parte dela de ${alt.posts.title} e passou para ${next.name}` : `${et.name} entregou ${alt.posts.title} para revisão`,
  });
  refresh();
  return { ok: true, warning };
}

/** Revisão: volta para uma das pessoas com recado. */
export async function sendBack(input: { alteracaoId: string; etapaId: string; note: string }): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim e o João revisam.' };
  const note = input.note.trim();
  if (!note) return { ok: false, error: 'Escreva o que falta ajustar.' };
  const supabase = await createClient();
  const alt = await loadAlt(supabase, input.alteracaoId);
  if (!alt || alt.status !== 'revisao') return { ok: false, error: 'Essa alteração não está mais em revisão.' };
  const et = etapasOf(alt).find((e) => e.id === input.etapaId);
  if (!et) return { ok: false, error: 'Pessoa não encontrada.' };
  await supabase.from('alteracao_etapas').update({ status: 'fazendo', back_note: note.slice(0, 1000), done_at: null, started_at: new Date().toISOString() }).eq('id', et.id);
  await supabase.from('alteracoes').update({ status: 'fazendo', review_note: note.slice(0, 1000) }).eq('id', alt.id);
  await supabase.from('activity_logs').insert({
    client_id: alt.client_id, post_id: alt.post_id, type: 'alteracao_volta', actor: u.name,
    action_text: `${u.name} devolveu ${alt.posts.title} para ${et.name}: ${note.slice(0, 200)}`,
  });
  const warning = await notify(alt, { ...et, status: 'fazendo' }, 'volta', u.name, { backNote: note });
  refresh();
  return { ok: true, warning };
}

const summaryPart = (s: string) => s.replace(/^O que mudou:\s*/i, '').replace(/\.$/, '').trim();

/** "Tudo certo": aplica a versão montada no conteúdo e ela vai para o cliente. */
export async function approveAlteracao(input: { alteracaoId: string; message: string }): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim e o João revisam.' };
  const supabase = await createClient();
  const alt = await loadAlt(supabase, input.alteracaoId);
  if (!alt || alt.status !== 'revisao') return { ok: false, error: 'Essa alteração não está mais em revisão.' };
  const plan = alt.plan;
  if (!plan) return { ok: false, error: 'Ninguém entregou a nova versão ainda.' };

  const post = alt.posts;
  const live = new Map((post.post_media ?? []).map((m) => [m.id, m]));
  const staged = new Map((alt.alteracao_media ?? []).map((m) => [m.id, m]));
  const refs = [...plan.items, ...(plan.cover ? [plan.cover] : [])];
  const usedLive = new Set(refs.filter((r) => r.src === 'live' && live.has(r.id)).map((r) => r.id));
  const usedStaged = new Set(refs.filter((r) => r.src === 'staged' && staged.has(r.id)).map((r) => r.id));

  // arquivos novos entram no conteúdo, na ordem montada
  const inserts: Omit<PostMedia, 'id'>[] = [];
  const updates: { id: string; order_index: number }[] = [];
  plan.items.forEach((r, i) => {
    if (r.src === 'live') { const m = live.get(r.id); if (m && m.order_index !== i) updates.push({ id: m.id, order_index: i }); }
    else { const m = staged.get(r.id); if (m) inserts.push({ post_id: post.id, file_url: m.file_url, storage_path: m.storage_path, file_type: m.file_type, file_name: m.file_name, order_index: i }); }
  });
  if (plan.cover?.src === 'staged') {
    const m = staged.get(plan.cover.id);
    if (m) inserts.push({ post_id: post.id, file_url: m.file_url, storage_path: m.storage_path, file_type: m.file_type, file_name: m.file_name, order_index: -1 });
  }
  if (inserts.length) {
    const { error } = await supabase.from('post_media').insert(inserts);
    if (error) return { ok: false, error: error.message };
  }
  await Promise.all(updates.map((x) => supabase.from('post_media').update({ order_index: x.order_index }).eq('id', x.id)));
  const goneLive = [...live.values()].filter((m) => !usedLive.has(m.id));
  if (goneLive.length) await supabase.from('post_media').delete().in('id', goneLive.map((m) => m.id));
  const unusedStaged = [...staged.values()].filter((m) => !usedStaged.has(m.id));
  const removePaths = [...goneLive, ...unusedStaged].map((m) => m.storage_path).filter((p): p is string => !!p);
  if (removePaths.length) await supabase.storage.from(MEDIA_BUCKET).remove(removePaths);
  await supabase.from('alteracao_media').delete().eq('alteracao_id', alt.id);

  const v = post.version + 1;
  const { error: e3 } = await supabase.from('posts').update({
    version: v, caption: plan.caption, status: 'pending', sent_at: new Date().toISOString(),
    first_viewed_at: null, decided_at: null, decided_by: null,
  }).eq('id', post.id);
  if (e3) return { ok: false, error: e3.message };
  const parts = [...new Set(etapasOf(alt).map((e) => summaryPart(e.summary)).filter(Boolean))];
  const summary = parts.length ? `O que mudou: ${parts.join('; ')}.` : '';
  await supabase.from('comments').insert({
    post_id: post.id, author_name: u.name, author_role: 'agency', kind: 'version',
    content: [input.message.trim() || `Nova versão enviada (v${v}).`, summary].filter(Boolean).join('\n'), version: v,
  });
  await supabase.from('alteracoes').update({ status: 'enviada', sent_at: new Date().toISOString(), sent_by: u.name }).eq('id', alt.id);
  const quem = etapasOf(alt).map((e) => e.name).join(' e ');
  await supabase.from('activity_logs').insert({
    client_id: alt.client_id, post_id: post.id, type: 'nova_versao', actor: u.name, meta: `v${v}`,
    action_text: `${u.name} revisou e enviou a nova versão de ${post.title} (v${v}), feita por ${quem}`,
  });
  refresh();
  revalidatePath(`/dashboard/clientes/${alt.client_id}`);
  return { ok: true };
}

/** Cancela o encaminhamento (o pedido volta para "Para encaminhar"). */
export async function cancelAlteracao(id: string): Promise<Result> {
  const u = await me();
  if (!u?.reviewer) return { ok: false, error: 'Só a Kim e o João cancelam.' };
  const supabase = await createClient();
  const alt = await loadAlt(supabase, id);
  if (!alt || !['fazendo', 'revisao'].includes(alt.status)) return { ok: false, error: 'Essa alteração não está mais aberta.' };
  const paths = (alt.alteracao_media ?? []).map((m) => m.storage_path).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(MEDIA_BUCKET).remove(paths);
  await supabase.from('alteracao_media').delete().eq('alteracao_id', id);
  await supabase.from('alteracoes').update({ status: 'cancelada' }).eq('id', id);
  await supabase.from('activity_logs').insert({
    client_id: alt.client_id, post_id: alt.post_id, type: 'alteracao_cancelada', actor: u.name,
    action_text: `${u.name} cancelou o encaminhamento da alteração de ${alt.posts.title}`,
  });
  refresh();
  return { ok: true };
}
