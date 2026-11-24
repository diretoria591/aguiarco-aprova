'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { firstName, initials, monthName } from '@/lib/format';
import { Icon } from '@/components/icon';
import { useMe } from './me';
import { SECTIONS } from '@/lib/sections';

/** Tarefas do começo do mês (vêm de lib/month-tasks, no servidor). */
export type ShellTasks = { day: number; month: string; numbersMissing: number; reportsTotal: number; reportsReady: number } | null;

export type TeamOption = { id: string; name: string; role: string };
const ROLE_LABEL: Record<string, string> = { admin: 'administração', scheduler: 'social media', team: 'equipe' };
const VIEW_AS_COOKIE = 'aprova_ver_como';
const links0 = SECTIONS.map((x) => ({ key: x.key as string, href: x.href as string, label: x.label as string }));

export type ShellPauta = { id: string; client_id: string; name: string; ref_month: string; doc_url: string; sent_at: string };

export function AdminShell({ children, queueCount = 0, cobrarCount = 0, tasks = null, team = null, pautas = [] }: {
  children: ReactNode; queueCount?: number; cobrarCount?: number; tasks?: ShellTasks; team?: TeamOption[] | null; pautas?: ShellPauta[];
}) {
  const me = useMe();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const section = path.startsWith('/dashboard/equipe') ? 'equipe'
    : path.startsWith('/dashboard/agendamento') ? 'agendamento'
    : path.startsWith('/dashboard/roteiros') ? 'roteiros'
    : path.startsWith('/dashboard/lembretes') ? 'lembretes'
    : path.startsWith('/dashboard/cobrar') ? 'cobrar'
    : path.startsWith('/dashboard/relatorios') ? 'relatorios'
    : path.startsWith('/dashboard/numeros') ? 'numeros'
    : path.startsWith('/dashboard/rodadas') ? 'rodadas' : 'clientes';
  const allowed = new Set(me.sections ?? []);
  const can = (k: string) => allowed.has(k);
  const home = links0.find((l) => can(l.key))?.href ?? '/dashboard';
  const badge = (n: number) => (n > 0 ? <span className="nbadge">{n}</span> : null);
  // a aba Números só aparece na época de preencher (começo do mês) ou quando alguém abre a página
  const showNumeros = can('numeros') && (!!tasks || section === 'numeros');

  // fecha o menu do celular ao trocar de página
  useEffect(() => { setOpen(false); }, [path]);

  /** "Ver como" (só admin): guarda a escolha num cookie e recarrega com a visão da pessoa. */
  function viewAs(id: string) {
    document.cookie = id && id !== me.id
      ? `${VIEW_AS_COOKIE}=${id}; path=/; max-age=43200; samesite=lax`
      : `${VIEW_AS_COOKIE}=; path=/; max-age=0; samesite=lax`;
    // a página atual pode não estar liberada para a pessoa: o servidor redireciona para a primeira aba dela
    window.location.assign(window.location.pathname + window.location.search);
  }

  async function logout() {
    await createClient().auth.signOut().catch(() => {});
    window.location.assign('/login');
  }

  const links = links0.map((l) => ({
    ...l,
    href: l.key === 'numeros' && tasks ? `/dashboard/numeros?mes=${tasks.month}` : l.href,
    extra: l.key === 'agendamento' ? badge(queueCount) : l.key === 'cobrar' ? badge(cobrarCount) : l.key === 'numeros' ? badge(tasks?.numbersMissing ?? 0) : null,
    show: l.key === 'numeros' ? showNumeros : can(l.key),
  }));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="in">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}>
            <Icon name="menu" />
          </button>
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
        <PautasBanner pautas={pautas} name={firstName(me.viewingAs?.name ?? me.name)} />
        <TaskBanner tasks={tasks} numbers={can('numeros') && (me.role === 'scheduler' || !can('relatorios'))} reports={can('relatorios')} name={firstName(me.viewingAs?.name ?? me.name)} section={section} />
        <main>{children}</main>
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
