import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { currentViewer } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { addMonths } from '@/lib/format';
import { loadIdeas } from '@/lib/ideias';
import { ideasEmail, sendResendEmail } from '@/lib/ideias-email';

export const dynamic = 'force-dynamic';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * Chamado pelo relatório quando a estrategista marca "pronto": manda para ela por e-mail
 * os conteúdos marcados como "Performou" (aposte neles na próxima remessa) e ideias de
 * outros clientes da mesma área. O mesmo conjunto de posts não é enviado duas vezes.
 */
export async function POST(req: NextRequest) {
  const viewer = await currentViewer();
  if (!viewer) return NextResponse.json({ error: 'Faça login de novo.' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { clientId?: string; month?: string };
  const clientId = String(body.clientId ?? '');
  const month = String(body.month ?? '');
  if (!UUID_RE.test(clientId) || !MONTH_RE.test(month)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });

  const supabase = await createClient();
  const [repRes, clientRes] = await Promise.all([
    supabase.from('relatorios').select('*').eq('client_id', clientId).eq('ref_month', month).maybeSingle(),
    supabase.from('clients').select('id,name,segment,strategist_id').eq('id', clientId).maybeSingle(),
  ]);
  if (repRes.error) return NextResponse.json({ error: repRes.error.message }, { status: 500 });
  if (clientRes.error) return NextResponse.json({ error: clientRes.error.message }, { status: 500 });
  const rep = repRes.data as { id: string; status: string; highlights: string; post_marks: Record<string, string> | null; ideas_sent_marks: string | null } | null;
  const client = clientRes.data as { id: string; name: string; segment: string | null; strategist_id: string | null } | null;
  if (!rep || !client) return NextResponse.json({ error: 'Relatório não encontrado.' }, { status: 404 });
  if (rep.status !== 'pronto') return NextResponse.json({ sent: false, reason: 'rascunho' });

  const topIds = Object.entries(rep.post_marks ?? {}).filter(([, m]) => m === 'top').map(([id]) => id).sort();
  if (!topIds.length) return NextResponse.json({ sent: false, reason: 'sem_top' });
  const signature = topIds.join(',');

  // e-mail vai para a estrategista do cliente; sem estrategista, para quem marcou como pronto
  let to = { name: viewer.real.name, email: viewer.real.email };
  if (client.strategist_id) {
    const { data } = await supabase.from('profiles').select('name,email').eq('id', client.strategist_id).maybeSingle();
    if (data?.email) to = { name: data.name ?? '', email: data.email };
  }
  if (rep.ideas_sent_marks === signature) return NextResponse.json({ sent: false, reason: 'ja_enviado', to: to.name });
  if (!to.email) return NextResponse.json({ error: 'A estrategista não tem e-mail cadastrado.' }, { status: 400 });

  try {
    const ideas = await loadIdeas(supabase, { sinceMonth: addMonths(month, -5) });
    const topSet = new Set(topIds);
    const tops = ideas.filter((i) => i.clientId === client.id && i.month === month && topSet.has(i.id));
    if (!tops.length) return NextResponse.json({ sent: false, reason: 'sem_top' });
    const others = client.segment
      ? ideas.filter((i) => i.segment === client.segment && i.clientId !== client.id).slice(0, 4)
      : [];

    const site = (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
    const mail = ideasEmail({
      to: to.name, clientName: client.name, segment: client.segment ?? '', month, tops, others,
      why: (rep.highlights ?? '').trim(),
      reportUrl: `${site}/dashboard/relatorios/${client.id}?mes=${month}`,
      bankUrl: `${site}/dashboard/ideias${client.segment ? `?area=${client.segment}` : ''}`,
    });
    const key = `ideias-${rep.id}-${createHash('sha1').update(signature).digest('hex').slice(0, 16)}`;
    await sendResendEmail({ to: [to.email], ...mail }, key);
    await supabase.from('relatorios').update({ ideas_sent_at: new Date().toISOString(), ideas_sent_marks: signature }).eq('id', rep.id);
    return NextResponse.json({ sent: true, to: to.name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao enviar.' }, { status: 500 });
  }
}
