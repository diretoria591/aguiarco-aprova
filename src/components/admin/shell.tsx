'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { initials } from '@/lib/format';
import { Icon } from '@/components/icon';
import { useMe } from './me';

export function AdminShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const section = path.startsWith('/dashboard/equipe') ? 'equipe' : 'clientes';

  async function logout() {
    await createClient().auth.signOut().catch(() => {});
    window.location.assign('/login');
  }

  return (
    <>
      <header className="topbar">
        <div className="in">
          <Link className="brand" href="/dashboard">
            <span className="wm">Aguiar<b>&amp;co</b></span>
            <span className="tag">Aprova</span>
          </Link>
          <nav className="topnav">
            <Link href="/dashboard" className={section === 'clientes' ? 'on' : ''}>Clientes</Link>
            <Link href="/dashboard/equipe" className={section === 'equipe' ? 'on' : ''}>Equipe</Link>
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
