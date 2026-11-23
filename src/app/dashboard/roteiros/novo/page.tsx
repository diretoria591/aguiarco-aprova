import type { Metadata } from 'next';
import { loadRoteiros } from '@/lib/roteiros-server';
import { MONTH_RE } from '@/lib/roteiros';
import { NewForm } from './new-form';

export const metadata: Metadata = { title: 'Novos roteiros' };
export const dynamic = 'force-dynamic';

export default async function NewRoteirosPage({
  searchParams,
}: { searchParams: Promise<{ cliente?: string; mes?: string }> }) {
  const { cliente, mes } = await searchParams;
  const { clients, teams, error } = await loadRoteiros();
  return (
    <NewForm
      clients={clients.map((c) => ({
        id: c.client_id, name: c.clients!.name, team: c.self_record ? 'o próprio cliente' : teams.find((t) => t.id === c.team_id)?.name ?? null,
      }))}
      initialClient={cliente ?? null}
      initialMonth={mes && MONTH_RE.test(mes) ? mes : null}
      error={error}
    />
  );
}
