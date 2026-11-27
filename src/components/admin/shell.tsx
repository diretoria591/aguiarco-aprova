'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { firstName, greet, initials, monthName } from '@/lib/format';
import { Icon } from '@/components/icon';
import { useMe } from './me';
import { SECTIONS } from '@/lib/sections';
import { DemandasTutorial } from './demandas-tutorial';
import { addDays, dayLabel } from '@/lib/alteracoes';
import { todayYMD } from '@/lib/format';
import { markFeedbackSeen } from '@/app/dashboard/desempenho/actions';

/** Tarefas do começo do mês (vêm de lib/month-tasks, no servidor). */
export type ShellTasks = { day: number; month: string; numbersMissing: number; reportsTotal: number; reportsReady: number } | null;

export type TeamOption = { id: string; name: string; role: string };
const ROLE_LABEL: Record<string, string> = { admin: 'administração', scheduler: 'social media', team: 'equipe' };
const VIEW_AS_COOKIE = 'aprova_ver_como';
const links0 = SECTIONS.map((x) => ({ key: x.key as string, href: x.href as string, label: x.label as string }));
/** Caminho das páginas visitadas nesta aba, para a setinha de voltar saber se dá para voltar dentro do Aprova. */
const NAV_STACK = 'aprova_nav';

/** Para onde a setinha leva quando não há página anterior no Aprova (ex.: abriu um link direto). */
function parentOf(path: string, home: string) {
  if (path.startsWith('/dashboard/clientes')) return '/dashboard';
  const parts = path.split('/').filter(Boolean);
  if (parts.length > 2) return '/' + parts.slice(0, -1).join('/');
  return home;
}

export type ShellPauta = { id: string; client_id: string; name: string; ref_month: string; doc_url: string; sent_at: string };

export type ShellEntregas = { atrasado: string[]; atencao: string[]; acima: string[]; total: number } | null;

/** Pedidos de alteração: para encaminhar/revisar (Kim e João) e a vez da pessoa (Minhas demandas). */
export type ShellAlt = {
  encaminhar: number; revisar: number; minhas: number; doesChanges: boolean; tutorial?: boolean; days?: number[]; hours?: string;
  /** demandas da pessoa (a vez dela), para o aviso do topo */
  lista?: { client: string; clientId: string; title: string; due: string | null }[];
  /** pedidos de roteiro: para escrever (a pessoa) e para revisar (Kim e João) */
  roteiros?: { escrever: number; revisar: number; recebidos: number; atrasados: { who: string; what: string }[]; lista: { client: string; due: string | null }[] };
};

export type ShellFeedback = { id: string; message: string; tone: string; sent_by_name: string; created_at: string; ref_month: string } | null;

export function AdminShell({ children, queueCount = 0, cobrarCount = 0, tasks = null, team = null, pautas = [], entregas = null, alt = null, feedback = null }: {
  feedback?: ShellFeedback;
  children: ReactNode; queueCount?: number; cobrarCount?: number; tasks?: ShellTasks; team?: TeamOption[] | null; pautas?: ShellPauta[]; entregas?: ShellEntregas; alt?: ShellAlt | null;
}) {
  const me = useMe();
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [depth, setDepth] = useState(0);
  const [tutorial, setTutorial] = useState(!!alt?.tutorial);
  const section = path.startsWith('/dashboard/equipe') ? 'equipe'
    : path.startsWith('/dashboard/desempenho') ? 'desempenho'
    : path.startsWith('/dashboard/projetos') ? 'projetos'
    : path.startsWith('/dashboard/roteiros/pedidos') ? 'pedidos'
    : path.startsWith('/dashboard/alteracoes') ? 'alteracoes'
    : path.startsWith('/dashboard/demandas') ? 'demandas'
    : path.startsWith('/dashboard/agendamento') ? 'agendamento'
    : path.startsWith('/dashboard/roteiros') ? 'roteiros'
    : path.startsWith('/dashboard/lembretes') ? 'lembretes'
    : path.startsWith('/dashboard/cobrar') ? 'cobrar'
    : path.startsWith('/dashboard/entregas') ? 'entregas'
    : path.startsWith('/dashboard/relatorios') ? 'relatorios'
    : path.startsWith('/dashboard/ideias') ? 'ideias'
    : path.startsWith('/dashboard/numeros') ? 'numeros'
    : path.startsWith('/dashboard/rodadas') ? 'rodadas' : 'clientes';
  const allowed = new Set(me.sections ?? []);
  const can = (k: string) => allowed.has(k);
  const home = links0.find((l) => can(l.key))?.href ?? (alt?.doesChanges ? '/dashboard/demandas' : '/dashboard');
  const badge = (n: number) => (n > 0 ? <span className="nbadge">{n}</span> : null);
  // a aba Números só aparece na época de preencher (começo do mês) ou quando alguém abre a página
  const showNumeros = can('numeros') && (!!tasks || section === 'numeros');

  // fecha o menu do celular ao trocar de página
  useEffect(() => { setOpen(false); }, [path]);

  // guarda o caminho percorrido na aba (voltou = tira a última; foi para outra = acrescenta)
  useEffect(() => {
    let stack: string[] = [];
    try { stack = JSON.parse(sessionStorage.getItem(NAV_STACK) || '[]'); } catch { /* noop */ }
    if (!Array.isArray(stack)) stack = [];
    if (stack[stack.length - 1] !== path) {
      if (stack[stack.length - 2] === path) stack.pop(); else stack.push(path);
    }
    stack = stack.slice(-30);
    try { sessionStorage.setItem(NAV_STACK, JSON.stringify(stack)); } catch { /* noop */ }
    setDepth(stack.length);
  }, [path]);

  // setinha de voltar (no celular): aparece se há para onde voltar ou se a página é interna (ex.: um cliente)
  const topLevel = links0.some((l) => l.href === path);
  const showBack = depth > 1 || !topLevel;
  function goBack() {
    if (depth > 1) router.back();
    else router.push(parentOf(path, home));
  }

  /** "Ver como" (só admin): guarda a escolha num cookie e recarrega com a visão da pessoa. */
  function viewAs(id: string) {
    document.cookie = id && id !== me.id
      ? `${VIEW_AS_COOKIE}=${id}; path=/; max-age=43200; samesite=lax`
      : `${VIEW_AS_COOKIE}=; path=/; max-age=0; samesite=lax`;
    // a página atual pode não estar liberada para a pessoa: o servidor redireciona para a primeira aba dela
    window.location.assign(window.location.pathname + window.location.search);
  }

  async function logout() {
    try { sessionStorage.removeItem(NAV_STACK); } catch { /* noop */ }
    await createClient().auth.signOut().catch(() => {});
    window.location.assign('/login');
  }

  const links = links0.map((l) => ({
    ...l,
    href: l.key === 'numeros' && tasks ? `/dashboard/numeros?mes=${tasks.month}` : l.href,
    extra: l.key === 'agendamento' ? badge(queueCount) : l.key === 'cobrar' ? badge(cobrarCount) : l.key === 'numeros' ? badge(tasks?.numbersMissing ?? 0)
      : l.key === 'alteracoes' ? badge((alt?.encaminhar ?? 0) + (alt?.revisar ?? 0)) : null,
    show: l.key === 'numeros' ? showNumeros : can(l.key),
  }));
  // "Minhas demandas" para quem faz alterações (ou recebeu uma), no topo do menu
  const escrever = (alt?.roteiros?.escrever ?? 0) + (alt?.roteiros?.recebidos ?? 0);
  if (alt && (alt.doesChanges || alt.minhas > 0 || escrever > 0)) {
    links.unshift({ key: 'demandas', href: '/dashboard/demandas', label: 'Minhas demandas', extra: badge(alt.minhas + escrever), show: true });
  }
  // pedidos de roteiro (Kim e João): logo depois de Alterações
  const altIdx = links.findIndex((l) => l.key === 'alteracoes');
  if (altIdx >= 0) {
    links.splice(altIdx + 1, 0, { key: 'pedidos', href: '/dashboard/roteiros/pedidos', label: 'Pedidos de texto', extra: badge((alt?.roteiros?.revisar ?? 0) + (alt?.roteiros?.atrasados.length ?? 0)), show: can('alteracoes') });
  }

  return (
    <div className="shell">
      <header className={`topbar${showBack ? ' has-back' : ''}`}>
        <div className="in">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}>
            <Icon name="menu" />
          </button>
          {showBack && (
            <button className="icon-btn back-btn" onClick={goBack} aria-label="Voltar" title="Voltar">
              <Icon name="left" />
            </button>
          )}
          <Link className="brand" href={home}>
            <span className="wm">Aguiar<b>&amp;co</b></span>
            <span className="tag">Aprova</span>
          </Link>
          <div className="who">
            {team && team.length > 1 && (
              <label className="viewas" title="Ver o Aprova como outra pessoa da equipe">
                <Icon name="eye" />
                <select value={me.viewingAs?.id ?? me.id} onChange={(e) => viewAs(e.target.value)} aria-label="Ver como">
                  {team.map((t) => (
                    <option key={t.id} value={t.id}>{t.id === me.id ? `Minha visão (${t.name})` : `Ver como ${t.name} · ${ROLE_LABEL[t.role] ?? t.role}`}</option>
                  ))}
                </select>
              </label>
            )}
            <span>{me.name}</span>
            <div className="avatar">{initials(me.name)}</div>
            <button className="icon-btn" onClick={logout} title="Sair" aria-label="Sair"><Icon name="out" /></button>
          </div>
        </div>
      </header>
      {/* fora do header: o desfoque da barra prenderia um menu fixo dentro dela */}
      <nav className={`sidenav${open ? ' open' : ''}`} aria-label="Menu">
        <div className="nav-head">
          <span className="wm">Aguiar<b>&amp;co</b></span>
          <button className="icon-btn" onClick={() => setOpen(false)} aria-label="Fechar menu"><Icon name="x" /></button>
        </div>
        {links.filter((l) => l.show).map((l) => (
          <Link key={l.key} href={l.href} className={section === l.key ? 'on' : ''}>{l.label}{l.extra}</Link>
        ))}
      </nav>
      {open && <div className="nav-overlay" onClick={() => setOpen(false)} />}
      <div className="shell-body">
        {me.viewingAs && (
          <div className="viewas-bar">
            <span><Icon name="eye" /> Você está vendo o Aprova como <b>{me.viewingAs.name}</b>. O que você fizer aqui fica registrado no seu nome.</span>
            <button className="btn sm line" onClick={() => viewAs('')}>Voltar para a minha visão</button>
          </div>
        )}
        <FeedbackBanner data={feedback} viewing={!!me.viewingAs} />
        {section !== 'entregas' && <EntregasBanner data={entregas} name={firstName(me.viewingAs?.name ?? me.name)} />}
        <HelloBanner alt={alt} name={firstName(me.viewingAs?.name ?? me.name)} section={section}
          greeted={!!entregas && section !== 'entregas'} />
        <RoteirosBanner data={alt?.roteiros ?? null} name={firstName(me.viewingAs?.name ?? me.name)} section={section} />
        <PautasBanner pautas={pautas} name={firstName(me.viewingAs?.name ?? me.name)} />
        <TaskBanner tasks={tasks} numbers={can('numeros') && (me.role === 'scheduler' || !can('relatorios'))} reports={can('relatorios')} name={firstName(me.viewingAs?.name ?? me.name)} section={section} />
        <main>{children}</main>
        {tutorial && alt && (
          <DemandasTutorial name={firstName(me.name)} days={alt.days ?? [1, 2, 3, 4, 5]} hours={alt.hours ?? ''} profileId={me.id} save
            onClose={() => { setTutorial(false); router.push('/dashboard/demandas'); router.refresh(); }} />
        )}
      </div>
    </div>
  );
}

/** Aviso no topo, só nos dias certos: números da social media (dias 1 a 3) e relatórios (dias 1 a 5). */
function TaskBanner({ tasks, numbers, reports, name, section }: { tasks: ShellTasks; numbers: boolean; reports: boolean; name: string; section: string }) {
  if (!tasks) return null;
  const mes = monthName(tasks.month);
  if ((numbers && tasks.day <= 3 && tasks.numbersMissing > 0) || section === 'numeros') {
    if (section === 'numeros') return null;
    return (
      <div className={`task-banner${tasks.day >= 2 ? ' late' : ''}`}>
        <span><b>{name}, {tasks.day === 1 ? 'hoje é dia de preencher' : 'faltam preencher'} os números do Instagram de {mes}:</b>{' '}
          {tasks.numbersMissing} cliente{tasks.numbersMissing > 1 ? 's' : ''}. A Renata precisa deles para o relatório.</span>
        <Link className="btn sm" href={`/dashboard/numeros?mes=${tasks.month}`}>Preencher agora</Link>
      </div>
    );
  }
  if (!reports || tasks.day > 5 || tasks.reportsTotal === 0 || tasks.reportsReady >= tasks.reportsTotal || section === 'relatorios') return null;
  return (
    <div className={`task-banner${tasks.day >= 4 ? ' late' : ''}`}>
      <span><b>Relatórios de {mes}: {tasks.reportsReady} de {tasks.reportsTotal} prontos</b> · prazo dia 5
        {tasks.numbersMissing ? ` · números da Duda: faltam ${tasks.numbersMissing}` : ' · números da Duda completos'}.
        {' '}Marque a reunião com cada cliente.</span>
      <Link className="btn sm" href={`/dashboard/relatorios?mes=${tasks.month}`}>Abrir relatórios</Link>
    </div>
  );
}

/** Segunda a sexta: pautas que chegaram no sábado e ainda não foram revisadas. */
function PautasBanner({ pautas, name }: { pautas: ShellPauta[]; name: string }) {
  const me = useMe();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  if (!pautas.length || hidden) return null;
  const mes = monthName(pautas[0].ref_month);
  async function reviewed() {
    setBusy(true);
    const { error } = await createClient().from('pautas')
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: me.name })
      .in('id', pautas.map((p) => p.id));
    setBusy(false);
    if (!error) setHidden(true);
  }
  return (
    <div className="task-banner pautas-banner">
      <span>
        <b>{name}, chegaram no sábado as pautas de {mes}:</b>{' '}
        {pautas.map((p, i) => (
          <span key={p.id}>{i > 0 && ', '}{p.doc_url
            ? <a href={p.doc_url} target="_blank" rel="noopener noreferrer">{p.name}</a>
            : p.name}</span>
        ))}
        . Revise e transforme em roteiros e demandas.
      </span>
      <button className="btn sm" disabled={busy} onClick={reviewed}><Icon name="check" />Marcar como revisadas</button>
    </div>
  );
}

/** Termômetro sempre à vista para quem acompanha entregas: urgente quando há cliente atrasado. */
function EntregasBanner({ data, name }: { data: ShellEntregas; name: string }) {
  if (!data) return null;
  const late = data.atrasado.length, warn = data.atencao.length, over = data.acima.length;
  const tone = late ? 'late' : warn ? '' : 'ok';
  const list = (xs: string[]) => xs.slice(0, 4).join(', ') + (xs.length > 4 ? ` e mais ${xs.length - 4}` : '');
  return (
    <div className={`task-banner ent-banner ${tone}`}>
      <span suppressHydrationWarning>
        <b>{greet()}, {name}! </b>
        {late ? <><b>{late} cliente{late > 1 ? 's' : ''} com entrega atrasada</b> ({list(data.atrasado)})</>
          : warn ? <><b>{warn} cliente{warn > 1 ? 's' : ''} em atenção</b> ({list(data.atencao)})</>
          : <>Todas as entregas dos seus {data.total} clientes estão em dia</>}
        {late && warn ? <> e {warn} em atenção ({list(data.atencao)})</> : null}
        {over ? <> · {over} acima do contrato</> : null}
        {late || warn ? '. Acesse agora o termômetro.' : '.'}
      </span>
      <Link className="btn sm" href="/dashboard/entregas">Abrir termômetro</Link>
    </div>
  );
}

/**
 * "Bom dia, Brenda!": o que a pessoa tem para fazer hoje, sempre à vista.
 * Prazo vencido fica vermelho; prazo hoje, âmbar. Para a Kim e o João, também os pedidos para encaminhar e revisar.
 */
function HelloBanner({ alt, name, section, greeted }: { alt: ShellAlt | null; name: string; section: string; greeted: boolean }) {
  if (!alt) return null;
  const today = todayYMD();
  const lista = alt.lista ?? [];
  const late = lista.filter((d) => d.due && d.due < today);
  const hoje = lista.filter((d) => d.due === today);
  const rest = lista.filter((d) => !d.due || d.due > today);
  const fila = alt.encaminhar + alt.revisar;
  const showMine = lista.length > 0 && section !== 'demandas';
  const showFila = fila > 0 && section !== 'alteracoes';
  if (!showMine && !showFila) return null;
  const when = (d: string | null) => (!d ? '' : d === addDays(today, -1) ? 'ontem' : dayLabel(d));
  const nome = (d: { client: string; title: string }) => `${d.client}${d.title ? ` (“${d.title}”)` : ''}`;
  const names = (xs: { client: string }[]) => [...new Set(xs.map((x) => x.client))].join(', ');
  const tone = showMine && late.length ? 'late' : showMine && hoje.length ? '' : 'ok';
  const target = late[0] ?? hoje[0] ?? rest[0];

  let mine: React.ReactNode = null;
  // depois de "Bom dia, Brenda!" começa com maiúscula; depois de "João, " (quando o termômetro já cumprimentou), minúscula
  const V = greeted ? 'você' : 'Você';
  const H = greeted ? 'hoje' : 'Hoje';
  if (showMine) {
    if (late.length === 1) mine = <><b>{V} precisa fazer a alteração de {nome(late[0])}.</b> O prazo era {when(late[0].due)}.</>;
    else if (late.length > 1) mine = <><b>{V} tem {late.length} alterações atrasadas</b> ({names(late)}).</>;
    else if (hoje.length) mine = <><b>{H} é o prazo de {hoje.length === 1 ? `1 alteração: ${nome(hoje[0])}` : `${hoje.length} alterações (${names(hoje)})`}.</b></>;
    else mine = <>{V} tem <b>{lista.length} alteraç{lista.length > 1 ? 'ões' : 'ão'} para fazer</b>. A próxima vence {when(rest[0]?.due ?? null) || 'sem prazo'} ({rest[0]?.client}).</>;
    if (late.length && hoje.length) mine = <>{mine} E {hoje.length} vence{hoje.length > 1 ? 'm' : ''} hoje.</>;
    if ((late.length || hoje.length) && rest.length) mine = <>{mine} Depois: {rest.length} com prazo mais pra frente.</>;
  }
  const filaTxt = showFila ? (
    <>{[alt.encaminhar ? `${alt.encaminhar} pedido${alt.encaminhar > 1 ? 's' : ''} de alteração para encaminhar` : '', alt.revisar ? `${alt.revisar} para revisar` : ''].filter(Boolean).join(' e ')}.</>
  ) : null;

  return (
    <div className={`task-banner hello-banner ${tone}`}>
      <span suppressHydrationWarning>
        {!greeted && <b>{greet()}, {name}! </b>}
        {mine ? <>{greeted ? <b>{name}, </b> : null}{mine}</> : null}
        {mine && filaTxt ? ' ' : null}
        {filaTxt ? <>{mine ? 'Na revisão: ' : 'Tem '}{filaTxt}</> : null}
      </span>
      <div className="hello-actions">
        {showMine && <Link className="btn sm" href={`/dashboard/demandas${target?.clientId ? `?cliente=${target.clientId}` : ''}`}>{late.length ? 'Fazer agora' : 'Ver minhas demandas'}</Link>}
        {showFila && <Link className={`btn sm${showMine ? ' line' : ''}`} href="/dashboard/alteracoes">Abrir alterações</Link>}
      </div>
    </div>
  );
}

/**
 * Pedidos de texto (roteiro, copy, legenda): o que a pessoa tem para escrever (prazo vencido em vermelho),
 * o que chegou do que ela pediu e, para a Kim e o João, o que está para revisar e o que atrasou.
 */
function RoteirosBanner({ data, name, section }: { data: ShellAlt['roteiros'] | null; name: string; section: string }) {
  if (!data) return null;
  const today = todayYMD();
  const showMine = data.escrever > 0 && section !== 'demandas';
  const showRec = data.recebidos > 0 && section !== 'demandas';
  const showRev = data.revisar > 0 && section !== 'pedidos';
  const showLate = data.atrasados.length > 0 && section !== 'pedidos';
  if (!showMine && !showRec && !showRev && !showLate) return null;
  const late = data.lista.filter((d) => d.due && d.due < today);
  const hoje = data.lista.filter((d) => d.due === today);
  const next = data.lista.find((d) => d.due && d.due >= today);
  const tone = (showMine && late.length) || showLate ? 'late' : showMine && hoje.length ? '' : 'ok';
  const list = (xs: string[]) => xs.slice(0, 3).join('; ') + (xs.length > 3 ? ` e mais ${xs.length - 3}` : '');
  const parts: React.ReactNode[] = [];
  if (showMine) {
    parts.push(late.length
      ? <><b>{late.length} pedido{late.length > 1 ? 's' : ''} para escrever com prazo vencido</b> ({list(late.map((d) => d.client))}).</>
      : hoje.length
        ? <><b>Hoje é o prazo de {list(hoje.map((d) => d.client))}.</b></>
        : <>Você tem <b>{data.escrever} pedido{data.escrever > 1 ? 's' : ''} para escrever</b>.{next ? <> O próximo vence {dayLabel(next.due)} ({next.client}).</> : null}</>);
  }
  if (showRec) parts.push(<><b>Chegou {data.recebidos === 1 ? 'o que você pediu' : `${data.recebidos} coisas que você pediu`}</b> para outra pessoa da equipe.</>);
  if (showLate) parts.push(<><b>{data.atrasados.length} pedido{data.atrasados.length > 1 ? 's' : ''} atrasado{data.atrasados.length > 1 ? 's' : ''}:</b> {list(data.atrasados.map((a) => `${a.who} (${a.what})`))}.</>);
  if (showRev) parts.push(<>{data.revisar} pedido{data.revisar > 1 ? 's' : ''} entregue{data.revisar > 1 ? 's' : ''} para revisar.</>);
  return (
    <div className={`task-banner hello-banner ${tone}`}>
      <span><b>{name}, </b>{parts.map((p, i) => <span key={i}>{i > 0 ? ' ' : ''}{p}</span>)}</span>
      <div className="hello-actions">
        {(showMine || showRec) && <Link className="btn sm" href="/dashboard/demandas">{showMine ? 'Escrever agora' : 'Ver o que chegou'}</Link>}
        {(showRev || showLate) && <Link className={`btn sm${showMine || showRec ? ' line' : ''}`} href={`/dashboard/roteiros/pedidos?aba=${showRev ? 'revisar' : 'equipe'}`}>{showRev ? 'Revisar' : 'Ver atrasados'}</Link>}
      </div>
    </div>
  );
}

/** Recado do mês (aba Desempenho): fica no topo até a pessoa marcar como lido. */
function FeedbackBanner({ data, viewing }: { data: ShellFeedback; viewing: boolean }) {
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!data || hidden) return null;
  async function seen() {
    setBusy(true);
    const r = await markFeedbackSeen(data!.id);
    setBusy(false);
    if (r.ok) setHidden(true);
  }
  return (
    <div className={`task-banner feedback-banner ${data.tone}`}>
      <span>
        <b>Recado da {firstName(data.sent_by_name) || 'Kim'} · seu mês de {monthName(data.ref_month)}</b>
        <span className="fb-msg">{data.message}</span>
      </span>
      <div className="hello-actions">
        <button className="btn sm" disabled={busy || viewing} onClick={seen} title={viewing ? 'Só a própria pessoa marca como lido' : undefined}><Icon name="check" />Li, obrigada!</button>
      </div>
    </div>
  );
}
