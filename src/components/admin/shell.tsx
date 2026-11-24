'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import { Icon } from '@/components/icon';
import { useMe } from './me';

export function AdminShell({ children, queueCount = 0, cobrarCount = 0 }: { children: ReactNode; queueCount?: number; cobrarCount?: number }) {
  const me = useMe();
  const path = usePathname();
  const section = path.startsWith('/dashboard/equipe') ? 'equipe'
    : path.startsWith('/dashboard/agendamento') ? 'agendamento'
    : path.startsWith('/dashboard/roteiros') ? 'roteiros'
    : path.startsWith('/dashboard/lembretes') ? 'lembretes'
    : path.startsWith('/dashboard/cobrar') ? 'cobrar'
    : path.startsWith('/dashboard/relatorios') ? 'relatorios'
    : path.startsWith('/dashboard/rodadas') ? 'rodadas' : 'clientes';
  const scheduler = me.role === 'scheduler';
  const badge = queueCount > 0 ? <span className="nbadge">{queueCount}</span> : null;

  async function logout() {
    await createClient().auth.signOut().catch(() => {});
    window.location.assign('/login');
  }

  return (
    <>
      <header className="topbar">
        <div className="in">
          <Link className="brand" href={scheduler ? '/dashboard/agendamento' : '/dashboard'}>
            <span className="wm">Aguiar<b>&amp;co</b></span>
            <span className="tag">Aprova</span>
          </Link>
          <nav className="topnav">
            {!scheduler && <Link href="/dashboard" className={section === 'clientes' ? 'on' : ''}>Clientes</Link>}
            <Link href="/dashboard/agendamento" className={section === 'agendamento' ? 'on' : ''}>Agendamento{badge}</Link>
            <Link href="/dashboard/roteiros" className={section === 'roteiros' ? 'on' : ''}>Roteiros</Link>
            {!scheduler && <Link href="/dashboard/cobrar" className={section === 'cobrar' ? 'on' : ''}>Cobrar hoje{cobrarCount > 0 ? <span className="nbadge">{cobrarCount}</span> : null}</Link>}
            {!scheduler && <Link href="/dashboard/relatorios" className={section === 'relatorios' ? 'on' : ''}>Relatórios</Link>}
            {!scheduler && <Link href="/dashboard/lembretes" className={section === 'lembretes' ? 'on' : ''}>Lembretes</Link>}
            {!scheduler && <Link href="/dashboard/rodadas" className={section === 'rodadas' ? 'on' : ''}>Rodadas extras</Link>}
            {!scheduler && <Link href="/dashboard/equipe" className={section === 'equipe' ? 'on' : ''}>Equipe</Link>}
          </nav>
          <div className="who">
            <span>{me.name}</span>
            <div className="avatar">{initials(me.name)}</div>
            <button className="icon-btn" onClick={logout} title="Sair" aria-label="Sair"><Icon name="out" /></button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </>
  );
}
