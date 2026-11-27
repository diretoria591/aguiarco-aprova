import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { googleConfigured, syncAll } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

function authorized(req: NextRequest) {
  const expected = process.env.NOTIFY_WEBHOOK_SECRET ?? '';
  const got = req.headers.get('x-notify-secret') ?? '';
  if (expected.length < 16 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Chamado pelo Supabase (pg_cron, a cada 10 min): lê os e-mails novos dos projetos no Gmail conectado. */
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  if (!googleConfigured()) return NextResponse.json({ skipped: 'GOOGLE_CLIENT_ID/SECRET não configurados.' });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 500 });
  return NextResponse.json({ result: await syncAll(admin) });
}
