import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addMonths, currentMonth, todayYMD, ymdOf } from './format';
import { nextWorkday } from './alteracoes';
import { monthRange, reportMonth } from './relatorio';
import { TIPOS, pedidoTitle, tipoOf } from './pedidos-roteiro';
import { buildMessage, displayName, plural, toneOf, type Area, type PersonPerf, type Tone } from './desempenho';

/** Prazo do relatório: dia 5 do mês seguinte ao do conteúdo. Números: dia 3. */
const REPORT_DAY = '05';
const NUMBERS_DAY = '03';
/** Post aprovado parado na fila de agendamento há mais que isso: aparece no topo da página. */
const QUEUE_DAYS = 2;
/** A fila de Agendamento começou neste dia: posts aprovados antes contam o prazo a partir daqui. */
const AGENDA_DESDE = '2026-11-23';

type Prof = { id: string; name: string; nickname: string | null; email: string; job: string | null; role: string | null; owner: boolean | null; delivery_days: number[] | null };

/**
 * Resumo do mês de cada pessoa da equipe (menos a dona).
 * - Agendamento: no prazo = agendado até o próximo dia de entrega da pessoa depois da aprovação e antes da publicação.
 * - Alterações e pedidos de texto: entregues até o prazo; os ainda abertos com prazo vencido contam como atrasados.
 * - Relatórios (do mês anterior, prazo dia 5) e números (prazo dia 3).
 */
export async function loadDesempenho(supabase: SupabaseClient, month: string) {
  const [from, to] = monthRange(month);
  const fromIso = new Date(`${from}T03:00:00Z`).toISOString(); // meia-noite em São Paulo
  const toIso = new Date(`${to}T03:00:00Z`).toISOString();
  const today = todayYMD();
  const current = month === currentMonth();
  const prev = addMonths(month, -1);
  const reportDue = `${month}-${REPORT_DAY}`;
  const numbersDue = `${month}-${NUMBERS_DAY}`;

  const [profs, sched, notified, etapas, etapasOpen, pedidos, pedidosOpen, clients, prevPosts, reps, queue, last] = await Promise.all([
    supabase.from('profiles').select('id, name, nickname, email, job, role, owner, delivery_days').order('name'),
    supabase.from('posts').select('scheduled_by, approved_at, scheduled_at, publish_at, scheduled_date').gte('scheduled_at', fromIso).lt('scheduled_at', toIso).not('scheduled_by', 'is', null),
    supabase.from('posts').select('client_notified_by').gte('client_notified_at', fromIso).lt('client_notified_at', toIso).not('client_notified_by', 'is', null),
    supabase.from('alteracao_etapas').select('profile_id, due_date, done_at').eq('status', 'feita').gte('done_at', fromIso).lt('done_at', toIso),
    current ? supabase.from('alteracao_etapas').select('profile_id, due_date, alteracoes!inner(status, posts(title), clients(name))').eq('status', 'fazendo').eq('alteracoes.status', 'fazendo').lt('due_date', today) : Promise.resolve({ data: [] }),
    supabase.from('roteiro_pedidos').select('profile_id, tipo, quantidade, due_date, delivered_at, back_note').not('delivered_at', 'is', null).gte('delivered_at', fromIso).lt('delivered_at', toIso).neq('status', 'cancelado'),
    current ? supabase.from('roteiro_pedidos').select('profile_id, tipo, quantidade, ref_month, material, clients(name)').eq('status', 'fazendo').lt('due_date', today) : Promise.resolve({ data: [] }),
    supabase.from('clients').select('id, name, strategist_id, client_type'),
    supabase.from('posts').select('client_id, scheduled_date, sent_at').eq('status', 'approved').eq('is_roteiro', false),
    supabase.from('relatorios').select('client_id, status, reviewed_at, metrics_by, metrics_at').eq('ref_month', prev),
    supabase.from('posts').select('id', { count: 'exact', head: true }).eq('status', 'approved').eq('is_roteiro', false).is('scheduled_at', null)
      .lt('approved_at', new Date(Date.now() - QUEUE_DAYS * 86400e3).toISOString()),
    supabase.from('feedbacks').select('profile_id, created_at, tone, seen_at, sent_by_name').order('created_at', { ascending: false }).limit(200),
  ]);
  const error = profs.error?.message ?? sched.error?.message ?? etapas.error?.message ?? pedidos.error?.message ?? null;
  const one = <T,>(x: T | T[] | null | undefined) => (Array.isArray(x) ? x[0] : x) ?? null;

  const team = ((profs.data ?? []) as Prof[]).filter((p) => !p.owner);
  const byName = new Map(team.map((p) => [p.name.trim().toLowerCase(), p.id]));

  // relatórios: clientes recorrentes de cada estrategista com conteúdo no mês anterior
  const clientRows = (clients.data ?? []) as { id: string; name: string; strategist_id: string | null; client_type: string | null }[];
  const withContent = new Set(((prevPosts.data ?? []) as { client_id: string; scheduled_date: string | null; sent_at: string }[])
    .filter((p) => reportMonth(p) === prev).map((p) => p.client_id));
  const repBy = new Map(((reps.data ?? []) as { client_id: string; status: string; reviewed_at: string | null; metrics_by: string | null; metrics_at: string | null }[]).map((r) => [r.client_id, r]));

  const lastBy = new Map<string, PersonPerf['last']>();
  for (const f of (last.data ?? []) as { profile_id: string; created_at: string; tone: Tone; seen_at: string | null; sent_by_name: string }[]) {
    if (!lastBy.has(f.profile_id)) lastBy.set(f.profile_id, f);
  }

  const people: PersonPerf[] = team.map((p) => {
    const days = p.delivery_days ?? [1, 2, 3, 4, 5];
    const nick = displayName(p);
    const areas: Area[] = [];

    // agendamento
    const mine = ((sched.data ?? []) as { scheduled_by: string; approved_at: string | null; scheduled_at: string; publish_at: string | null; scheduled_date: string | null }[])
      .filter((x) => x.scheduled_by === p.id);
    if (mine.length) {
      let ok = 0;
      for (const x of mine) {
        const s = ymdOf(x.scheduled_at);
        const aprov = x.approved_at ? ymdOf(x.approved_at) : s;
        // aprovado antes da fila existir: o prazo é o dia em que a fila começou (ou o seguinte)
        const limit = aprov < AGENDA_DESDE ? nextWorkday(days, AGENDA_DESDE) : nextWorkday(days, aprov);
        const pub = x.publish_at ? ymdOf(x.publish_at) : x.scheduled_date;
        if (s <= limit && (!pub || s <= pub)) ok++;
      }
      const avisos = ((notified.data ?? []) as { client_notified_by: string }[]).filter((x) => x.client_notified_by === p.id).length;
      areas.push({
        key: 'agendamento', label: 'Agendamento', done: `agendou ${plural(mine.length, 'post', 'posts')}`,
        onTime: ok, late: mine.length - ok, openLate: 0, openList: [],
        extra: avisos ? `e avisou ${plural(avisos, 'cliente', 'clientes')} sobre a publicação` : undefined,
        unit: (n) => plural(n, 'agendamento', 'agendamentos'),
      });
    }

    // alterações
    const alts = ((etapas.data ?? []) as { profile_id: string; due_date: string | null; done_at: string }[]).filter((x) => x.profile_id === p.id);
    const altOpen = ((etapasOpen as { data: unknown[] | null }).data ?? []).filter((x) => (x as { profile_id: string }).profile_id === p.id) as
      { alteracoes: unknown }[];
    if (alts.length || altOpen.length) {
      const ok = alts.filter((x) => !x.due_date || ymdOf(x.done_at) <= x.due_date).length;
      areas.push({
        key: 'alteracoes', label: 'Alterações', done: `fez ${plural(alts.length, 'alteração', 'alterações')}`,
        onTime: ok, late: alts.length - ok, openLate: altOpen.length,
        openList: altOpen.map((x) => {
          const a = one(x.alteracoes as { posts: { title: string } | { title: string }[] | null; clients: { name: string } | { name: string }[] | null } | null);
          return `alteração de ${one(a?.clients)?.name ?? 'cliente'}${one(a?.posts)?.title ? ` (“${one(a?.posts)!.title}”)` : ''}`;
        }),
        unit: (n) => plural(n, 'alteração', 'alterações'),
      });
    }

    // pedidos de texto (roteiro, copy, legenda, texto)
    const peds = ((pedidos.data ?? []) as { profile_id: string; tipo: string; quantidade: number; due_date: string | null; delivered_at: string; back_note: string }[]).filter((x) => x.profile_id === p.id);
    const pedOpen = ((pedidosOpen as { data: unknown[] | null }).data ?? []).filter((x) => (x as { profile_id: string }).profile_id === p.id) as
      { tipo: string; quantidade: number; ref_month: string; material: string; clients: { name: string } | { name: string }[] | null }[];
    if (peds.length || pedOpen.length) {
      const ok = peds.filter((x) => !x.due_date || ymdOf(x.delivered_at) <= x.due_date).length;
      const qty = new Map<string, number>();
      for (const x of peds) qty.set(tipoOf(x.tipo), (qty.get(tipoOf(x.tipo)) ?? 0) + x.quantidade);
      const what = [...qty.entries()].map(([t, n]) => plural(n, TIPOS[tipoOf(t)].one, TIPOS[tipoOf(t)].many));
      const ajustes = peds.filter((x) => x.back_note.trim()).length;
      areas.push({
        key: 'textos', label: 'Roteiros e textos', done: what.length ? `escreveu ${what.join(', ')}` : 'escreveu textos',
        onTime: ok, late: peds.length - ok, openLate: pedOpen.length,
        openList: pedOpen.map((x) => pedidoTitle({ ...x, tipo: tipoOf(x.tipo), clients: one(x.clients) })),
        extra: ajustes ? `${plural(ajustes, 'voltou', 'voltaram')} para ajuste` : undefined,
        unit: (n) => plural(n, 'pedido de texto', 'pedidos de texto'),
      });
    }

    // relatórios do mês anterior (estrategista)
    const mineClients = clientRows.filter((c) => c.strategist_id === p.id && c.client_type !== 'pontual' && withContent.has(c.id));
    if (mineClients.length) {
      let ok = 0, late = 0;
      const open: string[] = [];
      for (const c of mineClients) {
        const r = repBy.get(c.id);
        if (r?.status === 'pronto' && r.reviewed_at) { if (ymdOf(r.reviewed_at) <= reportDue) ok++; else late++; }
        else if (today > reportDue) open.push(`relatório de ${c.name}`);
      }
      if (ok + late + open.length) {
        areas.push({
          key: 'relatorios', label: 'Relatórios', done: `entregou ${plural(ok + late, 'relatório', 'relatórios')}`,
          onTime: ok, late, openLate: current ? open.length : 0, openList: current ? open : [],
          unit: (n) => plural(n, 'relatório', 'relatórios'),
        });
        if (!current) areas[areas.length - 1].late += open.length;
      }
    }

    // números do Instagram do mês anterior (quem preencheu)
    const nums = ((reps.data ?? []) as { metrics_by: string | null; metrics_at: string | null }[])
      .filter((r) => r.metrics_at && r.metrics_by && byName.get(r.metrics_by.trim().toLowerCase()) === p.id);
    if (nums.length) {
      const ok = nums.filter((r) => ymdOf(r.metrics_at!) <= numbersDue).length;
      areas.push({
        key: 'numeros', label: 'Números', done: `preencheu os números de ${plural(nums.length, 'cliente', 'clientes')}`,
        onTime: ok, late: nums.length - ok, openLate: 0, openList: [],
        unit: (n) => plural(n, 'preenchimento de números', 'preenchimentos de números'),
      });
    }

    const onTime = areas.reduce((s, a) => s + a.onTime, 0);
    const late = areas.reduce((s, a) => s + a.late, 0);
    const openLate = areas.reduce((s, a) => s + a.openLate, 0);
    const total = onTime + late + openLate;
    const tone = toneOf(onTime, total, openLate);
    return {
      id: p.id, name: p.name, nick, email: p.email, job: p.job ?? '', areas,
      total, onTime, late, openLate, rate: total ? Math.round((onTime / total) * 100) : null, tone,
      message: buildMessage({ nick, areas, tone, month, current }),
      last: lastBy.get(p.id) ?? null,
    };
  });

  return { people, queueStuck: queue.count ?? 0, error };
}

/** Recados ainda não lidos da pessoa (aviso no topo do Aprova). */
export async function loadUnseenFeedback(supabase: SupabaseClient, profileId: string) {
  const { data } = await supabase.from('feedbacks').select('id, message, tone, sent_by_name, created_at, ref_month')
    .eq('profile_id', profileId).is('seen_at', null).order('created_at', { ascending: false }).limit(1);
  return ((data ?? [])[0] as { id: string; message: string; tone: Tone; sent_by_name: string; created_at: string; ref_month: string } | undefined) ?? null;
}
