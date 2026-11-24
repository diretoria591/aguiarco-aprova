import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/admin/shell';
import { MeProvider } from '@/components/admin/me';
import { ConfigWarning } from '@/components/config-warning';
import { Wordmark } from '@/components/ui';
import { loadCobrar } from '@/lib/cobrar-server';
import { loadMonthTasks } from '@/lib/month-tasks';
import { currentViewer } from '@/lib/auth';
import type { TeamRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  let supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    return <ConfigWarning message={(e as Error).message} />;
  }

  const viewer = await currentViewer();
  if (!viewer) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login');
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
  const { real, view } = viewer;
  // só a dona escolhe "Ver como": lista da equipe para o seletor
  const team = real.owner
    ? ((await supabase.from('profiles').select('id,name,role').order('name')).data ?? []) as { id: string; name: string; role: TeamRole | null }[]
    : null;

  // quantos posts aprovados esperam agendamento (número na aba Agendamento)
  const { count } = await supabase.from('posts').select('id', { count: 'exact', head: true })
    .eq('status', 'approved').is('scheduled_at', null);
  const queueCount = count ?? 0;
  const role = view.role;
  // quantos clientes estão para cobrar (número na aba Cobrar hoje); quem só agenda não vê a aba
  const [cobrarCount, tasks] = await Promise.all([
    view.sections.includes('cobrar') ? loadCobrar(supabase).then((r) => r.items.length) : 0,
    loadMonthTasks(supabase),
  ]);

  return (
    <MeProvider me={{ id: real.id, name: real.name, email: real.email, role, owner: real.owner, sections: view.sections, viewingAs: view.id !== real.id ? { id: view.id, name: view.name } : undefined }}>
      <AdminShell queueCount={queueCount} cobrarCount={cobrarCount} tasks={tasks}
        team={team?.map((t) => ({ id: t.id, name: t.name || 'Sem nome', role: t.role || 'team' })) ?? null}>{children}</AdminShell>
    </MeProvider>
  );
}
