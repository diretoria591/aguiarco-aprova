import { NextResponse } from 'next/server';
import { currentViewer } from '@/lib/auth';
import { listCustomers } from '@/lib/asaas';

export const dynamic = 'force-dynamic';

/** Clientes cadastrados no Asaas, para ligar cada cliente do Aprova ao dele (só a dona da conta). */
export async function GET() {
  const viewer = await currentViewer();
  if (!viewer?.real.owner) return NextResponse.json({ error: 'Só a dona da conta.' }, { status: 403 });
  try {
    const list = await listCustomers();
    return NextResponse.json({
      customers: list.map((c) => ({ id: c.id, name: c.name, doc: c.cpfCnpj ?? '' })).sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao falar com o Asaas.' }, { status: 502 });
  }
}
