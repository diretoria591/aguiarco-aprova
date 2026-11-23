import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { dispatchNotifications } from '@/lib/notify';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET ?? '';
  const got = req.headers.get('x-notify-secret') ?? '';
  if (expected.length < 16 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Chamado pelo Supabase (pg_net) quando um cliente aprova um conteúdo. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 500 });
  const site = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  try {
    const result = await dispatchNotifications(admin, site);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao processar avisos.' }, { status: 500 });
  }
}
