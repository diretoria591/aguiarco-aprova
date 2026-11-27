import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { requireOwner } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/server';
import { exchangeCode, gmailProfile, syncProjeto } from '@/lib/gmail';
import type { Projeto } from '@/lib/projetos';

export const dynamic = 'force-dynamic';

const site = (req: NextRequest) => (process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Volta do Google: guarda o acesso de leitura (o token fica só no servidor) e faz a primeira leitura. */
export async function GET(req: NextRequest) {
  const state = req.nextUrl.searchParams.get('state') ?? '';
  const code = req.nextUrl.searchParams.get('code') ?? '';
  const saved = req.cookies.get('aprova_gmail_state')?.value ?? '';
  const slug = state.split('.')[0] ?? '';
  const back = (q: string) => NextResponse.redirect(`${site(req)}/dashboard/projetos/${slug || ''}?aba=emails&gmail=${q}`);
  if (!state || !saved || !same(state, saved) || !code) return back('erro');
  const v = await requireOwner();
  if (!v) return back('sem-permissao');
  const admin = createAdminClient();
  if (!admin) return back('sem-config');
  try {
    const tok = await exchangeCode(code, `${site(req)}/api/projetos/gmail/callback`);
    if (!tok.refresh_token) return back('sem-refresh');
    const prof = await gmailProfile(tok.access_token!);
    const { data: p } = await admin.from('projetos').select('*').eq('slug', slug).maybeSingle();
    if (!p) return back('erro');
    const { error } = await admin.from('projeto_gmail').upsert({
      projeto_id: p.id, account_email: prof.emailAddress, refresh_token: tok.refresh_token,
      connected_by: v.real.name, connected_at: new Date().toISOString(), last_sync_at: null, last_error: '',
    });
    if (error) return back('erro');
    await syncProjeto(admin, p as Projeto);
    const res = back('ok');
    res.cookies.delete({ name: 'aprova_gmail_state', path: '/api/projetos/gmail' });
    return res;
  } catch {
    return back('erro');
  }
}
