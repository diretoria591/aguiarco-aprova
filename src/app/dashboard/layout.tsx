import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/admin/shell';
import { MeProvider } from '@/components/admin/me';
import { ConfigWarning } from '@/components/config-warning';
import { Wordmark } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    return <ConfigWarning message={(e as Error).message} />;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,name,email').eq('id', user.id).maybeSingle();
  if (!profile) {
    return (
      <div className="invalid">
        <div>
          <Wordmark style={{ fontSize: 26 }} />
          <h2 style={{ margin: '26px 0 8px' }}>Acesso <b>não liberado</b></h2>
          <p className="muted">Sua conta ainda não faz parte da equipe. Rode o <code>supabase/schema.sql</code> ou peça para alguém da equipe te adicionar.</p>
        </div>
      </div>
    );
  }

  return (
    <MeProvider me={{ id: profile.id, name: profile.name || user.email || 'Equipe', email: profile.email || user.email || '' }}>
      <AdminShell>{children}</AdminShell>
    </MeProvider>
  );
}
