import type { Metadata } from 'next';
import { loadRoteiros } from '@/lib/roteiros-server';
import { RoteirosHome } from './roteiros-home';

export const metadata: Metadata = { title: 'Roteiros' };
export const dynamic = 'force-dynamic';

export default async function RoteirosPage() {
  const { clients, roteiros, teams, error } = await loadRoteiros();
  return <RoteirosHome clients={clients} roteiros={roteiros} teams={teams} error={error} />;
}
