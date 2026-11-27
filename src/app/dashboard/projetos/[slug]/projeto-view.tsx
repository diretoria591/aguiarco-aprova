'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/icon';
import { useUI } from '@/components/ui';
import { useMe } from '@/components/admin/me';
import { NovaTarefa, Section, TarefaCard, TarefaDetalhe, nomeDe, type Pessoa } from '@/components/projetos/tarefa';
import { ProjetoTutorial } from '@/components/projetos/tutorial';
import {
  addDaysYmd, dia, gmailCompose, gmailSearch, hourIn, isLate, mondayOf, quando, weekdayOf, ymdIn,
  type ProjEmail, type Projeto, type Tarefa,
} from '@/lib/projetos';
import type { GmailStatus } from '@/lib/projetos-server';
import { syncNow } from '../actions';

export type Aba = 'agora' | 'painel' | 'minhas' | 'emails' | 'sexta';
const ABAS: { key: Aba; label: string }[] = [
  { key: 'agora', label: 'Agora' },
  { key: 'painel', label: 'Painel' },
  { key: 'minhas', label: 'Minhas tarefas' },
  { key: 'emails', label: 'E-mails' },
  { key: 'sexta', label: 'Relatório de sexta' },
];

/** Atualiza a página quando alguém mexe numa tarefa ou chega e-mail. */
function Live({ projetoId }: { projetoId: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const refresh = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => router.refresh(), 600); };
    const ch = supabase.channel(`live-projeto-${projetoId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projeto_tarefas', filter: `projeto_id=eq.${projetoId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projeto_emails', filter: `projeto_id=eq.${projetoId}` }, refresh)
      .subscribe();
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('focus', refresh); if (timer.current) clearTimeout(timer.current); supabase.removeChannel(ch); };
  }, [router, projetoId]);
  return null;
}

type Thread = { last: ProjEmail; count: number; hours: number };

export function ProjetoView({ projeto, pessoas, tarefas, emails, error, gmail, aba, quem, gmailMsg, today, viewId, isOwner, tutorial }: {
  projeto: Projeto; pessoas: Pessoa[]; tarefas: Tarefa[]; emails: ProjEmail[]; error: string | null; gmail: GmailStatus;
  aba: Aba; quem: string | null; gmailMsg: string | null; today: string; viewId: string; isOwner: boolean; tutorial: boolean;
}) {
  const me = useMe();
  const [open, setOpen] = useState<Tarefa | null>(null);
  const [nova, setNova] = useState<{ title?: string; detail?: string; emailId?: string } | null>(null);
  const [help, setHelp] = useState(tutorial);
  const ctx = { projeto, today, pessoas };
  const meP = pessoas.find((p) => p.id === viewId);
  const naoDona = pessoas.find((p) => !p.owner);
  // Minhas tarefas: a pessoa vê as dela; a dona escolhe de quem ver (começa pela equipe)
  const alvo = pessoas.find((p) => p.id === quem) ?? (isOwner ? naoDona ?? meP : meP) ?? pessoas[0];
  const isMine = (t: Tarefa, p: Pessoa | undefined) => !!p && (t.owner_id === p.id || (!t.owner_id && t.owner_name.toLowerCase() === nomeDe(p).toLowerCase()));
  const live = tarefas.filter((t) => t.status !== 'cancelada');
  const abertas = live.filter((t) => t.status !== 'saiu');
  const late = abertas.filter((t) => isLate(t, today));
  const threads = useMemo(() => needsReply(emails), [emails]);
  // abrir a tarefa atualizada depois de salvar
  const openNow = open ? tarefas.find((t) => t.id === open.id) ?? null : null;
  const href = (a: Aba, extra = '') => `/dashboard/projetos/${projeto.slug}?aba=${a}${extra}`;
  const counts: Partial<Record<Aba, number>> = {
    minhas: abertas.filter((t) => isMine(t, alvo) && isLate(t, today)).length,
    emails: threads.length,
  };

  return (
    <>
      <Live projetoId={projeto.id} />
      <div className="hello">
        <div>
          <p className="eyebrow">{projeto.name} · {hourIn(projeto.timezone)}h em {projeto.timezone.split('/')[1]?.replace('_', ' ') ?? projeto.timezone}</p>
          <h1>{aba === 'minhas' && alvo ? <>{nomeDe(alvo)}, <b>o que {alvo.id === viewId ? 'eu tenho' : 'tem'} que fazer</b></> : <>Central <b>{projeto.name}</b></>}</h1>
        </div>
        <div className="row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn line sm" onClick={() => setHelp(true)}><Icon name="sparkle" />Como funciona</button>
          <button type="button" className="btn sm" onClick={() => setNova({})}><Icon name="plus" />Anotar pedido novo</button>
        </div>
      </div>
      {error && <div className="card empty" style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>Não foi possível carregar: {error}</p></div>}
      <GmailBanner msg={gmailMsg} />

      <div className="tabs" role="tablist">
        {ABAS.map((t) => (
          <Link key={t.key} href={href(t.key, t.key === 'minhas' && quem ? `&quem=${quem}` : '')} className={`tab${t.key === aba ? ' on' : ''}`} role="tab" aria-selected={t.key === aba}>
            {t.label}{counts[t.key] ? <span className="n hot">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </div>

      {aba === 'agora' && <Agora ctx={ctx} tarefas={live} threads={threads} emails={emails} onOpen={setOpen} href={href} />}
      {aba === 'painel' && <Painel ctx={ctx} tarefas={live} onOpen={setOpen} />}
      {aba === 'minhas' && alvo && (
        <Minhas ctx={ctx} tarefas={live.filter((t) => isMine(t, alvo))} alvo={alvo} viewId={viewId} isOwner={isOwner} threads={threads}
          onOpen={setOpen} href={href} />
      )}
      {aba === 'emails' && <Emails ctx={ctx} emails={emails} threads={threads} gmail={gmail} isOwner={isOwner} onNova={setNova} />}
      {aba === 'sexta' && <Sexta ctx={ctx} tarefas={live} emails={emails} />}

      {openNow && <TarefaDetalhe key={openNow.id + openNow.updated_at} t={openNow} ctx={ctx} onClose={() => setOpen(null)} />}
      {nova && (
        <NovaTarefa ctx={ctx} defaultOwner={(isOwner ? naoDona?.id : meP?.id) ?? ''} initial={nova} onClose={() => setNova(null)}
          onSaved={async (id) => { if (nova.emailId) await createClient().from('projeto_emails').update({ tarefa_id: id }).eq('id', nova.emailId); }} />
      )}
      {help && <ProjetoTutorial name={(me.name || '').split(' ')[0]} projeto={projeto.name} cliente={projeto.client_name} save={tutorial} onClose={() => setHelp(false)} />}
    </>
  );
}

function GmailBanner({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const txt: Record<string, string> = {
    ok: 'Gmail conectado. Os e-mails do projeto já estão chegando.',
    erro: 'Não foi possível conectar o Gmail. Tente de novo.',
    'sem-permissao': 'Só a dona da conta conecta o Gmail.',
    'sem-config': 'O Gmail ainda não foi configurado no servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET).',
    'sem-refresh': 'O Google não liberou o acesso contínuo. Remova o Aprova em myaccount.google.com/permissions e conecte de novo.',
  };
  return <div className={`task-banner ${msg === 'ok' ? 'ok' : 'late'}`} style={{ margin: '0 0 14px' }}><span>{txt[msg] ?? msg}</span></div>;
}

/** Remetentes automáticos (assinatura digital, avisos, no-reply): não pedem resposta. */
const AUTO = /(no-?reply|nao-?responda|notifica|mailer-daemon|d4sign|docusign|calendar-notification)/i;
/** Conversa parada há mais que isso sai de "Precisa de resposta" (continua na lista de e-mails). */
const MAX_DIAS = 14;

/** Conversas em que a última mensagem veio do cliente ou de parceiros e ninguém respondeu. */
function needsReply(emails: ProjEmail[]): Thread[] {
  const by = new Map<string, ProjEmail[]>();
  for (const e of emails) by.set(e.thread_id, [...(by.get(e.thread_id) ?? []), e]);
  const out: Thread[] = [];
  for (const list of by.values()) {
    const last = [...list].sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0];
    const hours = Math.round((Date.now() - Date.parse(last.sent_at)) / 3600e3);
    if (AUTO.test(`${last.from_email} ${last.from_name}`) || hours > MAX_DIAS * 24) continue;
    if (last.direction === 'in' && !last.dismissed_at) out.push({ last, count: list.length, hours });
  }
  return out.sort((a, b) => a.last.sent_at.localeCompare(b.last.sent_at));
}

type Ctx = { projeto: Projeto; today: string; pessoas: Pessoa[] };
const byDue = (a: Tarefa, b: Tarefa) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');

/* ---------------- Agora ---------------- */
function Agora({ ctx, tarefas, threads, emails, onOpen, href }: {
  ctx: Ctx; tarefas: Tarefa[]; threads: Thread[]; emails: ProjEmail[]; onOpen: (t: Tarefa) => void; href: (a: Aba, e?: string) => string;
}) {
  const { today, projeto } = ctx;
  const mon = mondayOf(today);
  const abertas = tarefas.filter((t) => t.status !== 'saiu');
  const late = abertas.filter((t) => isLate(t, today)).sort(byDue);
  const semana = abertas.filter((t) => t.status !== 'travado' && !isLate(t, today) && t.due_date && t.due_date <= addDaysYmd(today, 7)).sort(byDue);
  const travadas = abertas.filter((t) => t.status === 'travado' && !isLate(t, today));
  const saiu = tarefas.filter((t) => t.status === 'saiu' && t.done_at && ymdIn(projeto.timezone, new Date(t.done_at)) >= mon)
    .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? ''));
  const sent = reportSent(emails, mon);
  const sextaTarde = weekdayOf(today) === 5 && hourIn(projeto.timezone) >= 12 && !sent;
  const n = (s: string) => tarefas.filter((t) => t.status === s).length;
  return (
    <>
      {sextaTarde && <div className="task-banner late" style={{ margin: '0 0 14px' }}><span><b>O relatório de sexta ainda não saiu.</b> Já passou do meio-dia em {projeto.timezone.split('/')[1]}.</span><Link className="btn sm" href={href('sexta')}>Abrir o relatório</Link></div>}
      {threads.length > 0 && <div className="task-banner" style={{ margin: '0 0 14px' }}><span><b>{threads.length} e-mail{threads.length > 1 ? 's' : ''} esperando resposta</b> ({threads.slice(0, 3).map((t) => t.last.from_name || t.last.from_email).join(', ')}).</span><Link className="btn sm" href={href('emails')}>Responder</Link></div>}
      <div className="pj-tiles">
        <div className="pj-tile"><b>{n('a_fazer')}</b><span>A fazer</span></div>
        <div className="pj-tile"><b>{n('andamento')}</b><span>Em andamento</span></div>
        <div className="pj-tile wait"><b>{n('travado')}</b><span>Travadas</span></div>
        <div className="pj-tile ok"><b>{saiu.length}</b><span>Saíram nesta semana</span></div>
        <div className={`pj-tile${late.length ? ' late' : ''}`}><b>{late.length}</b><span>Atrasadas</span></div>
      </div>
      <div className="pj-cols2">
        <div>
          <Section title="Atrasadas" tone="late" empty="Nada atrasado.">{late.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} />)}</Section>
          <Section title="Próximos 7 dias" empty="Nada com prazo nos próximos 7 dias.">{semana.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} compact />)}</Section>
        </div>
        <div>
          <Section title="Travadas · esperando resposta" tone="wait" empty="Nada esperando resposta.">{travadas.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} compact />)}</Section>
          <Section title="Saíram nesta semana" tone="ok" empty="Ainda nada nesta semana.">{saiu.slice(0, 8).map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} compact />)}</Section>
        </div>
      </div>
    </>
  );
}

/* ---------------- Painel (4 colunas) ---------------- */
function Painel({ ctx, tarefas, onOpen }: { ctx: Ctx; tarefas: Tarefa[]; onOpen: (t: Tarefa) => void }) {
  const [quem, setQuem] = useState('');
  const mon = mondayOf(ctx.today);
  const list = tarefas.filter((t) => !quem || t.owner_id === quem || (!t.owner_id && t.owner_name.toLowerCase() === nomeDe(ctx.pessoas.find((p) => p.id === quem)!).toLowerCase()));
  const cols: { key: Tarefa['status']; title: string; hint: string; cls: string }[] = [
    { key: 'a_fazer', title: 'A fazer', hint: 'Ainda não começou.', cls: '' },
    { key: 'andamento', title: 'Em andamento', hint: 'Alguém está fazendo agora.', cls: 'doing' },
    { key: 'travado', title: 'Travado · esperando resposta', hint: 'Depende de alguém. Tem data para cobrar.', cls: 'wait' },
    { key: 'saiu', title: 'Já saiu', hint: 'Enviado, aprovado ou concluído (últimas 2 semanas).', cls: 'ok' },
  ];
  return (
    <>
      <div className="chips" style={{ marginBottom: 14 }}>
        <button type="button" className={`chip-opt${!quem ? ' on' : ''}`} onClick={() => setQuem('')}>Todos</button>
        {ctx.pessoas.map((p) => <button key={p.id} type="button" className={`chip-opt${quem === p.id ? ' on' : ''}`} onClick={() => setQuem(p.id)}>{nomeDe(p)}</button>)}
      </div>
      <div className="pj-board">
        {cols.map((c) => {
          const items = list.filter((t) => t.status === c.key && (c.key !== 'saiu' || !t.done_at || ymdIn(ctx.projeto.timezone, new Date(t.done_at)) >= addDaysYmd(mon, -7)))
            .sort((a, b) => (isLate(b, ctx.today) ? 1 : 0) - (isLate(a, ctx.today) ? 1 : 0) || byDue(a, b));
          return (
            <section key={c.key} className={`pj-col ${c.cls}`}>
              <div className="pj-colhead"><h2>{c.title}</h2><span>{items.length}</span></div>
              <p className="small muted" style={{ margin: '0 0 6px' }}>{c.hint}</p>
              {items.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} compact />)}
            </section>
          );
        })}
      </div>
    </>
  );
}

/* ---------------- Minhas tarefas ---------------- */
function Minhas({ ctx, tarefas, alvo, viewId, isOwner, threads, onOpen, href }: {
  ctx: Ctx; tarefas: Tarefa[]; alvo: Pessoa; viewId: string; isOwner: boolean; threads: Thread[]; onOpen: (t: Tarefa) => void; href: (a: Aba, e?: string) => string;
}) {
  const { today } = ctx;
  const abertas = tarefas.filter((t) => t.status !== 'saiu');
  const late = abertas.filter((t) => isLate(t, today)).sort(byDue);
  const notLate = abertas.filter((t) => !isLate(t, today) && t.status !== 'travado' && t.kind !== 'ideia');
  const hoje = notLate.filter((t) => t.due_date === today);
  const prox = notLate.filter((t) => t.due_date && t.due_date > today && t.due_date <= addDaysYmd(today, 7)).sort(byDue);
  const depois = notLate.filter((t) => !t.due_date || t.due_date > addDaysYmd(today, 7)).sort(byDue);
  const travadas = abertas.filter((t) => t.status === 'travado' && !isLate(t, today)).sort((a, b) => (a.cobrar_em ?? '').localeCompare(b.cobrar_em ?? ''));
  const ideias = abertas.filter((t) => t.kind === 'ideia' && !isLate(t, today));
  const mine = alvo.id === viewId;
  return (
    <>
      {isOwner && (
        <div className="chips" style={{ marginBottom: 14 }}>
          {ctx.pessoas.map((p) => <Link key={p.id} href={href('minhas', `&quem=${p.id}`)} className={`chip-opt${alvo.id === p.id ? ' on' : ''}`}>{nomeDe(p)}</Link>)}
        </div>
      )}
      <p className="muted small" style={{ margin: '-6px 0 14px' }}>
        {mine ? 'Tudo aqui é seu: você decide, faz, envia e cobra. A Kim só entra quando é decisão de gestão.' : `O que está com ${nomeDe(alvo)}.`}
      </p>
      <div className="pj-tiles">
        <div className={`pj-tile${late.length ? ' late' : ''}`}><b>{late.length}</b><span>Atrasadas</span></div>
        <div className="pj-tile warn"><b>{hoje.length}</b><span>Para hoje</span></div>
        <div className="pj-tile"><b>{prox.length}</b><span>Próximos 7 dias</span></div>
        <div className="pj-tile wait"><b>{travadas.length}</b><span>Travadas</span></div>
      </div>
      {mine && threads.length > 0 && (
        <div className="task-banner late" style={{ margin: '0 0 14px' }}>
          <span><b>{threads.length} e-mail{threads.length > 1 ? 's' : ''} para responder:</b> {threads.slice(0, 3).map((t) => `${t.last.from_name || t.last.from_email} (${t.last.subject})`).join('; ')}.</span>
          <Link className="btn sm" href={href('emails')}>Ver e responder</Link>
        </div>
      )}
      <Section title="Atrasadas" tone="late">{late.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} />)}</Section>
      <Section title={`Para hoje · ${dia(today)}`} tone="warn">{hoje.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} />)}</Section>
      <Section title="Próximos 7 dias">{prox.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} />)}</Section>
      <Section title="Travadas · esperando resposta (você cobra)" tone="wait">{travadas.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} />)}</Section>
      <Section title="Depois ou sem prazo">{depois.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} compact />)}</Section>
      <Section title="Para fazer acontecer sem esperar ninguém" tone="ok">{ideias.map((t) => <TarefaCard key={t.id} t={t} ctx={ctx} onOpen={onOpen} compact />)}</Section>
      {!abertas.length && <div className="card empty"><p style={{ margin: 0 }}>Nada em aberto. Anote um pedido novo quando chegar.</p></div>}
    </>
  );
}

/* ---------------- E-mails ---------------- */
function Emails({ ctx, emails, threads, gmail, isOwner, onNova }: {
  ctx: Ctx; emails: ProjEmail[]; threads: Thread[]; gmail: GmailStatus; isOwner: boolean; onNova: (n: { title?: string; detail?: string; emailId?: string }) => void;
}) {
  const router = useRouter();
  const { toast } = useUI();
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const tz = ctx.projeto.timezone;
  async function ler() {
    setBusy(true);
    const r = await syncNow(ctx.projeto.slug);
    setBusy(false);
    if (!r.ok) return toast(r.error, 'err');
    toast(r.novos ? `${r.novos} e-mail${r.novos > 1 ? 's' : ''} novo${r.novos > 1 ? 's' : ''}` : 'Nada novo');
    router.refresh();
  }
  async function dismiss(e: ProjEmail) {
    await createClient().from('projeto_emails').update({ dismissed_at: new Date().toISOString(), dismissed_by: me.name }).eq('id', e.id);
    toast('Marcado como respondido');
    router.refresh();
  }
  const recentes = emails.slice(0, 60);
  return (
    <>
      <div className="card pj-gmail">
        {gmail.connected ? (
          <span><b className="t-ok">Gmail conectado</b> ({gmail.account}, só leitura){gmail.lastSync ? ` · lido ${quando(gmail.lastSync, tz)}` : ''}{gmail.error ? <span className="t-late"> · erro: {gmail.error}</span> : null}. Lê sozinho a cada 10 minutos.</span>
        ) : (
          <span><b>Gmail ainda não conectado.</b> {isOwner ? 'Conecte o Gmail da Kim (só leitura): os e-mails do projeto passam a aparecer aqui.' : 'A Kim precisa conectar o Gmail dela.'}{!gmail.configured ? ' Antes, o servidor precisa das chaves do Google.' : ''}</span>
        )}
        <div className="row" style={{ display: 'flex', gap: 8 }}>
          {gmail.connected && <button className="btn sm line" disabled={busy} onClick={ler}><Icon name="refresh" />{busy ? 'Lendo…' : 'Ler agora'}</button>}
          {isOwner && gmail.configured && <a className="btn sm" href={`/api/projetos/gmail/connect?p=${ctx.projeto.slug}`}>{gmail.connected ? 'Reconectar' : 'Conectar o Gmail'}</a>}
        </div>
      </div>
      <p className="muted small" style={{ margin: '0 0 14px' }}>Só entram e-mails de {ctx.projeto.gmail_domains.join(', ') || 'domínios cadastrados'}. O Aprova nunca envia e-mail: “Responder” abre o seu Gmail.</p>

      <Section title="Precisa de resposta" tone="late" empty="Nenhum e-mail esperando resposta.">
        {threads.map(({ last, hours }) => (
          <article key={last.id} className="pj-card late">
            <div className="pj-meta"><b style={{ color: 'var(--ink)' }}>{last.from_name || last.from_email}</b><span className="status atraso">sem resposta há {hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} dias`}</span></div>
            <div className="small muted">{last.subject} · {quando(last.sent_at, tz)}</div>
            {last.snippet && <div className="pj-quote">“{last.snippet}”</div>}
            <div className="pj-actions">
              <a className="btn sm" href={gmailSearch(last.subject, last.from_email)} target="_blank" rel="noopener noreferrer">Responder no Gmail</a>
              <button className="btn sm line" onClick={() => dismiss(last)}>Já respondi</button>
              {!last.tarefa_id && <button className="btn sm ghost" onClick={() => onNova({ title: `Responder: ${last.subject}`.slice(0, 300), detail: `${last.from_name || last.from_email}: “${last.snippet}”`, emailId: last.id })}>Virar tarefa</button>}
            </div>
          </article>
        ))}
      </Section>

      <Section title="E-mails recentes do projeto" empty={gmail.connected ? 'Nenhum e-mail nos últimos 30 dias.' : 'Aparecem depois de conectar o Gmail.'}>
        {recentes.map((e) => (
          <div key={e.id} className="pj-mail">
            <span className={`pj-dir ${e.direction}`}>{e.direction === 'in' ? 'chegou' : 'saiu'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{e.from_name || e.from_email}</b> <span className="small muted">· {quando(e.sent_at, tz)}</span>
              <div className="small">{e.subject}</div>
              <div className="small muted pj-snip">{e.snippet}</div>
            </div>
            {e.tarefa_id ? <span className="small t-ok">virou tarefa</span>
              : <button className="btn sm ghost" onClick={() => onNova({ title: e.subject.slice(0, 300), detail: `${e.from_name || e.from_email}: “${e.snippet}”`, emailId: e.id })}>Virar tarefa</button>}
          </div>
        ))}
      </Section>
    </>
  );
}

/* ---------------- Relatório de sexta ---------------- */
function reportSent(emails: ProjEmail[], monday: string) {
  return emails.find((e) => e.direction === 'out' && /resumo da semana/i.test(e.subject) && e.sent_at.slice(0, 10) >= monday) ?? null;
}

function Sexta({ ctx, tarefas, emails }: { ctx: Ctx; tarefas: Tarefa[]; emails: ProjEmail[] }) {
  const { today, projeto } = ctx;
  const mon = mondayOf(today);
  const nextMon = addDaysYmd(mon, 7);
  const ext = tarefas.filter((t) => !t.internal);
  const kim = ctx.pessoas.filter((p) => p.owner).map((p) => nomeDe(p).toLowerCase());
  const entregue = ext.filter((t) => t.status === 'saiu' && t.done_at && ymdIn(projeto.timezone, new Date(t.done_at)) >= mon);
  const andamento = ext.filter((t) => (t.status === 'andamento' || t.status === 'a_fazer') && t.due_date && t.due_date >= today && t.due_date < nextMon).sort(byDue);
  const proxima = ext.filter((t) => (t.status === 'andamento' || t.status === 'a_fazer') && t.due_date && t.due_date >= nextMon && t.due_date < addDaysYmd(nextMon, 7)).sort(byDue);
  const precisamos = ext.filter((t) => t.status === 'travado' && t.waiting_on && !kim.includes(t.waiting_on.toLowerCase()));
  const linha = (t: Tarefa) => `• ${t.title}${t.due_date ? ` (${dia(t.due_date)})` : ''}`;
  const gerado = [
    `Olá, ${projeto.client_name || 'pessoal'}! Tudo bem?`, '',
    `Segue o resumo da semana do ${projeto.name} (${dia(mon)} a ${dia(addDaysYmd(mon, 4))}).`, '',
    'ENTREGUE NESTA SEMANA', ...(entregue.length ? entregue.map((t) => `• ${t.title}`) : ['• —']), '',
    'EM ANDAMENTO, COM PRAZOS', ...(andamento.length ? andamento.map(linha) : ['• —']), '',
    'PRÓXIMA SEMANA', ...(proxima.length ? proxima.map(linha) : ['• —']), '',
    'O QUE PRECISAMOS DE VOCÊS', ...(precisamos.length ? precisamos.map((t) => `• ${t.title}${t.cobrar_em ? ` (até ${dia(t.cobrar_em)})` : ''}`) : ['• Nada pendente do vosso lado.']), '',
    'Qualquer dúvida, estou à disposição.', 'Obrigada!',
  ].join('\n');
  const [txt, setTxt] = useState(gerado);
  const subject = `${projeto.name} · resumo da semana (${mon.slice(8, 10)}/${mon.slice(5, 7)} a ${addDaysYmd(mon, 4).slice(8, 10)}/${addDaysYmd(mon, 4).slice(5, 7)})`;
  const sent = reportSent(emails, mon);
  return (
    <div className="pj-cols2">
      <div className="card rt-pad">
        <div className="pj-meta" style={{ marginBottom: 8 }}>
          <b style={{ fontSize: 16, color: 'var(--ink)' }}>Resumo da semana para {projeto.client_name || 'o cliente'}</b>
          {sent ? <span className="status aprovado">Enviado {quando(sent.sent_at, projeto.timezone)}</span> : <span className="status pendente">Ainda não enviado</span>}
        </div>
        <p className="small muted" style={{ margin: '0 0 10px' }}>Montado com o que mudou nos painéis desta semana. Tarefas marcadas como “só interno” não entram. Revise, abra no Gmail e envie de lá.</p>
        <div className="small" style={{ marginBottom: 8 }}><span className="muted">Para:</span> {projeto.report_to || '—'}{projeto.report_cc ? <> · <span className="muted">Cc:</span> {projeto.report_cc}</> : null}<br /><span className="muted">Assunto:</span> <b>{subject}</b></div>
        <textarea className="textarea" rows={18} value={txt} onChange={(e) => setTxt(e.target.value)} />
        <div className="pj-actions" style={{ marginTop: 10 }}>
          <a className="btn" href={gmailCompose({ to: projeto.report_to, cc: projeto.report_cc, subject, body: txt })} target="_blank" rel="noopener noreferrer">Abrir no Gmail</a>
          {txt !== gerado && <button className="btn line" onClick={() => setTxt(gerado)}>Voltar para o texto montado</button>}
        </div>
      </div>
      <div className="card rt-pad">
        <b>De onde vem cada parte</b>
        <ul className="small" style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
          <li><b>Entregue:</b> tarefas que foram para “Já saiu” desde segunda ({entregue.length}).</li>
          <li><b>Em andamento:</b> tarefas abertas com prazo até domingo ({andamento.length}).</li>
          <li><b>Próxima semana:</b> prazos de {dia(nextMon)} a {dia(addDaysYmd(nextMon, 6))} ({proxima.length}).</li>
          <li><b>Precisamos de vocês:</b> tarefas travadas esperando o cliente ou parceiros ({precisamos.length}).</li>
        </ul>
        <p className="small muted" style={{ margin: '12px 0 0' }}>Quando a cópia chegar na caixa da Kim, este relatório aparece como enviado. Se na sexta passar do meio-dia sem envio, aparece um aviso na aba Agora.</p>
      </div>
    </div>
  );
}
