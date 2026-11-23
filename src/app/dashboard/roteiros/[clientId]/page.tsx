import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadRoteiros } from '@/lib/roteiros-server';
import { MONTH_RE } from '@/lib/roteiros';
import { currentMonth } from '@/lib/format';
import { ClientArea } from './client-area';

export const metadata: Metadata = { title: 'Roteiros do cliente' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function RoteirosClientPage({
  params, searchParams,
}: { params: Promise<{ clientId: string }>; searchParams: Promise<{ mes?: string }> }) {
  const { clientId } = await params;
  const { mes } = await searchParams;
  if (!UUID.test(clientId)) notFound();
  const { clients, roteiros, teams } = await loadRoteiros();
  const c = clients.find((x) => x.client_id === clientId);
  if (!c) notFound();
  return (
    <ClientArea
      client={c.clients!}
      selfRecord={c.self_record}
      team={teams.find((t) => t.id === c.team_id) ?? null}
      roteiros={roteiros.filter((r) => r.client_id === clientId)}
      initialMonth={mes && MONTH_RE.test(mes) ? mes : currentMonth()}
    />
  );
}
