'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { firstName, initials, monthName } from '@/lib/format';
import { Icon } from '@/components/icon';
import { useMe } from './me';

/** Tarefas do começo do mês (vêm de lib/month-tasks, no servidor). */
export type ShellTasks = { day: number; month: string; numbersMissing: number; reportsTotal: number; reportsReady: number } | null;

export function AdminShell({ children, queueCount = 0, cobrarCount = 0, tasks = null }: {
  children: ReactNode; queueCount?: number; cobrarCount?: number; tasks?: ShellTasks;
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
  const scheduler = me.role === 'scheduler';
  const badge = (n: number) => (n > 0 ? <span className="nbadge">{n}</span> : null);
  // a aba Números só aparece na época de preencher (começo do mês) ou quando alguém abre a página
  const showNumeros = !!tasks || section === 'numeros';

  // fecha o menu do celular ao trocar de página
  useEffect(() => { setOpen(false); }, [path]);

  async function logout() {
    await createClient().auth.signOut().catch(() => {});
    window.location.assign('/login');
  }

  const links: { key: string; href: string; label: string; extra?: ReactNode; show: boolean }[] = [
    { key: 'clientes', href: '/dashboard', label: 'Clientes', show: !scheduler },
    { key: 'agendamento', href: '/dashboard/agendamento', label: 'Agendamento', extra: badge(queueCount), show: true },
    { key: 'roteiros', href: '/dashboard/roteiros', label: 'Roteiros', show: true },
    { key: 'cobrar', href: '/dashboard/cobrar', label: 'Cobrar hoje', extra: badge(cobrarCount), show: !scheduler },
    { key: 'numeros', href: tasks ? `/dashboard/numeros?mes=${tasks.month}` : '/dashboard/numeros', label: 'Números', extra: badge(tasks?.numbersMissing ?? 0), show: showNumeros },
    { key: 'relatorios', href: '/dashboard/relatorios', label: 'Relatórios', show: !scheduler },
    { key: 'lembretes', href: '/dashboard/lembretes', label: 'Lembretes', show: !scheduler },
    { key: 'rodadas', href: '/dashboard/rodadas', label: 'Rodadas extras', show: !scheduler },
    { key: 'equipe', href: '/dashboard/equipe', label: 'Equipe', show: !scheduler },
  ];

  return (
    <div className="shell">
      <header className="topbar">
        <div className="in">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}>
            <Icon name="menu" />
          </button>
          <Link className="brand" href={scheduler ? '/dashboard/agendamento' : '/dashboard'}>
            <span className="wm">Aguiar<b>&amp;co</b></span>
            <span className="tag">Aprova</span>
          </Link>
          <div className="who">
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
        <TaskBanner tasks={tasks} scheduler={scheduler} name={firstName(me.name)} section={section} />
        <main>{children}</main>
      </div>
    </div>
  );
}

/** Aviso no topo, só nos dias certos: números da social media (dias 1 a 3) e relatórios (dias 1 a 5). */
function TaskBanner({ tasks, scheduler, name, section }: { tasks: ShellTasks; scheduler: boolean; name: string; section: string }) {
  if (!tasks) return null;
  const mes = monthName(tasks.month);
  if (scheduler || section === 'numeros') {
    if (tasks.day > 3 || tasks.numbersMissing === 0 || section === 'numeros') return null;
    return (
      <div className="task-banner">
        <span><b>{name}, {tasks.day === 1 ? 'hoje é dia de preencher' : 'faltam preencher'} os números do Instagram de {mes}:</b>{' '}
          {tasks.numbersMissing} cliente{tasks.numbersMissing > 1 ? 's' : ''}. A Renata precisa deles para o relatório.</span>
        <Link className="btn sm" href={`/dashboard/numeros?mes=${tasks.month}`}>Preencher agora</Link>
      </div>
    );
  }
  if (tasks.day > 5 || tasks.reportsTotal === 0 || tasks.reportsReady >= tasks.reportsTotal || section === 'relatorios') return null;
  return (
    <div className="task-banner">
      <span><b>Relatórios de {mes}: {tasks.reportsReady} de {tasks.reportsTotal} prontos</b> · prazo dia 5
        {tasks.numbersMissing ? ` · números da Duda: faltam ${tasks.numbersMissing}` : ' · números da Duda completos'}.
        {' '}Marque a reunião com cada cliente.</span>
      <Link className="btn sm" href={`/dashboard/relatorios?mes=${tasks.month}`}>Abrir relatórios</Link>
    </div>
  );
}
