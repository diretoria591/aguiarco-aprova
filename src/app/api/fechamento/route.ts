import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { addMonths, currentMonth } from '@/lib/format';
import { buildFechamento, sendFechamento } from '@/lib/fechamento';
import { asaas } from '@/lib/asaas';

export const dynamic = 'force-dynamic';

/** A Vercel Cron manda "Authorization: Bearer <CRON_SECRET>". */
function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? '';
  const got = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (secret.length < 16 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/**
 * Fechamento do mês (todo dia 1, pela Vercel Cron): envia por e-mail as rodadas
 * extras do mês anterior por cliente. ?mes=AAAA-MM escolhe outro mês;
 * ?preview=1 só mostra o e-mail, sem enviar.
 */
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada.' }, { status: 500 });

  const mes = req.nextUrl.searchParams.get('mes');
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : addMonths(currentMonth(), -1);
  const site = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  // o Asaas desativa chaves sem uso por 3 meses: uma consulta por mês mantém a do Aprova ativa
  if (process.env.ASAAS_API_KEY) await asaas('/customers?limit=1').catch(() => {});
  try {
    const mail = await buildFechamento(admin, month, site);
    if (req.nextUrl.searchParams.get('preview') === '1') {
      return new NextResponse(mail.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    await sendFechamento(mail, month);
    return NextResponse.json({ month, total: mail.total, sent: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha no fechamento.' }, { status: 500 });
  }
}
